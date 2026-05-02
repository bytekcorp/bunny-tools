# Phase 1 Bootstrap — Code Review

Scope: HTTP client, errors, credential resolver, config loaders, manifest registry, CLI entry, generators, tests, CI.
LOC reviewed: ~1.1k production + ~430 test.
Verdict deferred to bottom.

---

## CRITICAL

None. No data loss, no auth bypass, no secret leak found in the surfaces reviewed.

---

## MAJOR

### M1 — `--json` flag injection collides with command-output semantics
- **File:** `src/cli.ts:46`, `src/cli.ts:54`
- **Issue:** `registerCommand` adds a `--json` option to **every** command and treats `opts.json === true` as "render help-JSON". This means:
  - `bunny manifest --json` does **not** print the registry — it prints help-JSON for the manifest command. Surprising, since `manifest` itself outputs JSON.
  - Future commands that want a real `--json` output flag (e.g. `storage:list --json`) will be hijacked by this intercept, forcing every callsite to special-case the help branch.
  - The `opts.help === true` half of the condition is dead: Commander handles `--help` itself and exits before the action callback runs.
- **Verified:** confirmed via Commander REPL — `bunny <cmd> --json` flips `opts.json` to `true` and the action takes the help branch.
- **Fix:** rename the help intercept to `--help-json` (and key the branch on that), or only add the intercept for `planned` commands. Drop the `opts.help` check; if you want a true help-JSON capture, hook Commander's `--help` via a `preAction` event.

### M2 — `scopeToEnvVars` sanitization is inconsistent across scope kinds
- **File:** `src/config/credential-resolver.ts:45-58`
- **Issue:**
  - `storage` zone names are sanitized: `[^a-zA-Z0-9] → _` then uppercased → `BUNNY_STORAGE_PASSWORD_MY_APP`.
  - `stream.libraryId` is **not** sanitized: `BUNNY_STREAM_KEY_${libraryId}` — Bunny library IDs are numeric in practice, but the type is `string`, so passing `42-foo` produces an invalid POSIX env var name (`BUNNY_STREAM_KEY_42-foo`) that the shell rejects on export.
  - `database.name` is uppercased only — `my-db` → `BUNNY_DATABASE_KEY_MY-DB` (dash, also invalid).
  - The storage sanitizer is also lossy: `my-app` and `my_app` both collapse to `MY_APP`. A user with two zones differing only in separator could read the wrong zone's credential. **This is the cross-scope coercion you asked about.**
- **Fix:** apply the same `[^A-Z0-9] → _` + uppercase pipeline to all kinds. For collision risk, prefer a deterministic-but-injective encoding (e.g. lowercase preserved + percent-style escape), or refuse zone names that collide after normalization. Document the normalization in the help text alongside the env var name.

### M3 — `--pretty` defaultValue cast through `as never` produces stable but obscure shape
- **File:** `src/cli.ts:38`
- **Issue:** `cmd.option(decl, flag.description, flag.defaultValue as never)`. The cast is fine for booleans, but for any future flag with `defaultValue: 0` or `defaultValue: ''` Commander will treat the third arg as the default and the falsy value will silently win against user input depending on Commander version semantics.
- **Fix:** narrow the cast: only pass the third arg when `flag.defaultValue !== undefined && flag.defaultValue !== null`, OR when `flag.hasValue === true` (string defaults) vs boolean flags (skip). The current `if (flag.defaultValue !== undefined)` guard is right; the `as never` is hiding a real type hole.

---

## MINOR

### m1 — `atomicWriteJson` has a brief 0644 window on the credential tmp file
- **File:** `src/util/fs.ts:13-16`
- **Issue:** `writeFile(tmp, body, 'utf8')` then `chmod(tmp, 0o600)`. Between those two awaits, the tmp file containing plaintext credentials exists with the process umask (typically 0644). The window is millisecond-scale on a single user's box, but it is observable.
- **Fix:** pass `mode` to `writeFile` directly: `await writeFile(tmp, body, { encoding: 'utf8', mode: opts.mode ?? 0o600 })`. Node respects this on file creation. Drop the separate `chmod`. (Note: umask still applies to `writeFile`'s mode arg, but that's a global concern, not a race.)

### m2 — No test verifies the file-store actually lands at 0600
- **File:** `test/config/credential-resolver.test.ts`
- **Issue:** `setCredential`, `clearCredential`, `listCredentialScopes` have **zero coverage**. The 0600 perm claim is unverified. The keychain-fail-then-fallback-to-file path is unverified. Prompt path is unverified. For a credential-handling library this is a meaningful gap.
- **Fix:** add a temp-dir test that calls `setCredential` with `keytar: null`, then `fs.stat`s `credentialsFile()` and asserts `(stat.mode & 0o777) === 0o600`. Also test the keychain-throws path and confirm fallback writes to file.

### m3 — Sleep in retry loop ignores `AbortSignal`
- **File:** `src/api/http.ts:131,143`
- **Issue:** `await sleep(delay)` is unconditional. If the caller aborts during a 30s backoff, the user waits the full delay before the next iteration's `fetcher` call rejects with `AbortError`.
- **Fix:** race `sleep(delay)` against a promise that rejects on `signal.aborted`. Or short-circuit at the top of each iteration: `if (opts.signal?.aborted) throw new Error('aborted')`.

### m4 — Corrupt `credentials.json` crashes the resolver chain
- **File:** `src/util/fs.ts:20-29`, `src/config/credential-resolver.ts:68`
- **Issue:** `readJsonOrNull` only swallows `ENOENT`. `SyntaxError` from `JSON.parse` propagates up through `resolveCredential`. Env vars run before the file (good — most users hit env first), but anyone relying on the file store and hitting parse failure sees a raw `Unexpected token` rather than an actionable message. Also blocks resolution even for scopes whose creds are NOT in the file.
- **Fix:** in `readFileStore`, catch `SyntaxError`, `logger.warn(\`credentials.json is malformed at ${path}; ignoring\`)`, return `{}`. Optionally back up the corrupt file.

### m5 — Multi-process write race on `credentials.json`
- **File:** `src/util/fs.ts:5-18`, `src/config/credential-resolver.ts:127-130`
- **Issue:** `setCredential` reads-then-writes without a lock. Two concurrent `bunny auth set` invocations can read the same store, both modify, and the later rename clobbers the earlier write. Tmp filename is pid-suffixed so they don't fight over the tmp, but the rename is last-writer-wins.
- **Fix:** for v0.1, accept the trade and document it. For v0.2+, use `proper-lockfile` or an O_EXCL lockfile around read-modify-write.

### m6 — `parseBunnyErrorBody` has loose JSON-shape acceptance
- **File:** `src/api/errors.ts:53-61`
- **Issue:** `JSON.parse('null')` returns `null`, which fails the `parsed && typeof parsed === 'object'` check → falls to the trimmed-body branch → message becomes `"null"`. `JSON.parse('"hello"')` returns the string, which also falls through and the message becomes the literal `"hello"` (with surrounding quotes from `body.trim()`). Cosmetic, but error messages will look weird.
- **Fix:** if `JSON.parse` succeeds and produces a non-object, prefer the original raw `body.trim()` as the message and skip the literal coercion.

### m7 — `DELETE` always discards the response body
- **File:** `src/api/http.ts:112-114`
- **Issue:** `if (status === 204 || method === 'DELETE')` returns `undefined`. Bunny endpoints occasionally return 200 with a JSON confirmation on delete. Currently impossible to read it. Not a v0.1 problem but will bite a future caller silently.
- **Fix:** drop the `method === 'DELETE'` clause; rely on `status === 204` and an empty-body branch. Let the parser run on a non-empty body even for DELETE.

### m8 — `isMain` check breaks on Windows
- **File:** `src/cli.ts:102`
- **Issue:** `import.meta.url === \`file://\${process.argv[1]}\`` — on Windows this becomes `file://C:\path\cli.js` which never matches the real `file:///C:/path/cli.js`. CI matrix is Ubuntu+macOS only, so this is undetected. The CLI as a binary still works (the `bin` symlink hits the file directly), but any platform-aware tooling breaks.
- **Fix:** `import { pathToFileURL } from 'node:url'; const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;`.

### m9 — `flag.defaultValue: false` is rendered as `null` in help-JSON
- **File:** `src/manifest/render-help.ts:83`
- **Issue:** `defaultValue: f.defaultValue ?? null`. For `pretty` with `defaultValue: false`, `false ?? null` returns `false` (correct, `??` is nullish-only). I traced this and it is fine. **No change needed** — flagging only because the test suite never asserts the JSON shape carries non-null defaults, so the next refactor could regress to `||` and silently break.
- **Fix:** add `expect(json.flags.find(f => f.name === 'pretty')!.defaultValue).toBe(false)` to `render-help.test.ts`.

### m10 — CI does not run coverage with the gate the plan specified
- **File:** `.github/workflows/ci.yml:27`, `vitest.config.ts:13-19`
- **Issue:** Plan §19 mandated `npm test -- --coverage` and a 80% gate on `src/api/`, `src/config/`, `src/manifest/`. CI runs `npm test` (no coverage). The plan's own success checkbox at L158 acknowledges this with "full coverage report deferred to phase 2 CI". Locally documented; CI does not enforce. Aligning to the deferral is fine but call it out explicitly so phase 2 doesn't lose the breadcrumb.
- **Fix:** add a `coverage:` job to ci.yml in phase 2, or just `- run: npm run test:coverage` now. Vitest config already has thresholds — they are dead until invoked.

### m11 — `cli.ts` `program.parseAsync` errors only log message, not stack
- **File:** `src/cli.ts:105-108`, `src/cli.ts:79-82`
- **Issue:** Both fallbacks do `logger.error((err as Error).message)`. For a developer-facing CLI in alpha, losing the stack on unexpected errors makes debugging harder. End-users probably want the message-only path; devs want the stack.
- **Fix:** check `process.env.BUNNY_LOG_LEVEL === 'debug'` (or `getLogLevel() === 'debug'`) and emit the stack in that case.

### m12 — `bunnyrc.ts` swallows zod validation details
- **File:** `src/config/bunnyrc.ts:35`
- **Issue:** `throw new ConfigError(\`.bunnyrc at ${filePath} failed validation\`)` — does not pass the issues. `bunny-json.ts:60` does it correctly via `formatZodIssues`. Inconsistency, not a bug.
- **Fix:** mirror the helper from `bunny-json.ts`. Extract `formatZodIssues` to `src/util/`.

### m13 — `generate-agents.ts` cast `(groups[c.phase] ??= [] as never).push(c)`
- **File:** `scripts/generate-agents.ts:65`
- **Issue:** Mostly fine, but `as never` here defeats the type system. If `groups[c.phase]` is `undefined`, `??=` assigns the typed-as-never empty array, then `.push` succeeds at runtime but the typing is lost.
- **Fix:** `(groups[c.phase] ??= []).push(c)` works fine without the cast in TS strict, given `Record<number, CommandSpec[]>` declared upfront.

---

## YAGNI / KISS observations

- The `STATE_FILENAME` constant in `src/util/paths.ts:16` is exported but unused in phase 1. Fine to keep — phase 2 deploy uses it — but it is dead code today.
- `_internal` export at `src/config/credential-resolver.ts:173` exposes `configDir`/`credentialsFile`/`KEYCHAIN_SERVICE` for tests but tests never import it. Currently dead.
- `BunnyError` base class hierarchy with four subclasses is a small luxury — pragmatic but borderline; the `name` property + `instanceof` already handles dispatch. Keep, it's cheap.
- `setLogLevel`/`getLogLevel` exported but only the implicit env-var read is used. Reasonable forward-compat — keep.

No serious over-engineering. Registry-driven CLI + manifest generators are the right amount of metaprogramming for the stated AI-agent goal.

---

## Architectural boundary verification

Verified by probe: I dropped a file at `src/commands/__test_boundary__/probe.ts` importing `'../api/http.js'` and `'../api/errors.js'`. ESLint flagged both with the `no-restricted-imports` rule and the configured message. Also verified from a subdirectory (`src/commands/sub/probe.ts` importing `'../../api/http.js'`) — caught.

**Gap:** the rule only catches relative imports. Path aliases (e.g. if `tsconfig.paths` later adds `@/api`) would silently bypass. Currently no aliases are configured, so this is a forward-looking nit.

**Gap 2:** the rule does NOT prevent `commands/*` from importing `undici` or `node:fetch` directly. Currently no command does, but the boundary is purely about the `src/api/` directory, not "no raw HTTP". The `src/core/README.md` says "Network calls go through `src/api/*` only" — but the lint rule is on commands, not on core. Both layers benefit from the rule. Consider adding a `src/core/**` block to also forbid `undici` (allow only via `src/api/*`).

---

## Test quality

- HTTP tests use a `vi.fn` fetcher with programmed responses — that's testing real branch behavior (status code routing, retry counting, body parsing, AuthError on 401, BunnyApiError shape). Honest tests.
- Credential resolver tests cover the **read** chain through keychain-mock. They do **not** cover the write path (m2 above), keychain-throw fallback, file-store actual perms, or interactive prompt. Real gap for a security module.
- bunny-json tests cover happy + 4 invalid shapes, including walks-up search. Solid.
- Manifest tests cover uniqueness, summaries, MCP cap. Missing: variadic-arg-must-be-last assertion (cli.ts uses Commander's strict syntax, would crash at startup if violated). Cheap to add.
- No CLI integration test (spawn `bunny manifest`, parse output). Phase 1 success criteria did not require it; reasonable.

---

## Positive observations

- Logger writes to stderr only with a clear comment about MCP transport reservation. Correct discipline.
- `parseBunnyErrorBody` keeps both shapes (envelope + plain text) and never crashes.
- `loadBunnyJson` walks up directories — correct, intuitive UX.
- Generators compose `renderRegistryHelpJson` so `manifest.json` and `bunny manifest` literally produce identical bytes (same code path). Drift check in CI guards it.
- Architectural boundary documented in `src/core/README.md` AND enforced in lint AND verified by tests being unable to be authored that violate it. Defense in depth.
- `RETRYABLE_STATUS` excludes 4xx (other than 429). Bodies always drained on the auth-error and 204/DELETE paths.
- Body re-serialization happens inside the retry loop (line 86) — no stale-body bug across attempts.
- Credentials never logged or echoed — every error message uses scope identifiers, not values. `maskCredential` keeps tail-4 only.

---

## Recommended actions (priority order)

1. **M1**: rename `--json` intercept to `--help-json` or remove entirely. Otherwise phase-3 commands that want `--json` output will all collide. Touches `src/cli.ts:46,54`.
2. **M2**: unify `scopeToEnvVars` sanitization across all four scope kinds and document collision behavior. `src/config/credential-resolver.ts:45-58`.
3. **m1+m2**: pass `mode: 0o600` directly to `writeFile` (atomic perm) and add a test that stats the file. Closes the brief 0644 window AND the missing-coverage gap.
4. **m3**: race the retry sleep against `AbortSignal`. Easy win.
5. **m4**: catch `SyntaxError` in `readFileStore` and warn-then-empty.
6. **m8**: use `pathToFileURL` for the `isMain` check.
7. **M3** + **m13**: tighten the `as never` casts.
8. **m12**: factor out `formatZodIssues` and use it in both config loaders.

---

## Unresolved questions

- Phase 2 introduces `bunny configure` + `bunny auth set/list/clear`. Will those land tests for the credential write path? Recommended before any release tag.
- The CI matrix is ubuntu+macos. Is Windows a v0.1 target? If yes, fix m8 now and add a `windows-latest` row. If no, document explicitly in README.
- Does the manifest registry need a `since` version on each command for AI agents that target specific bunny-tools versions? Not in scope for phase 1, but worth deciding before publish.

**Verdict: needs-fixes (top 3 items: M1 `--json` collision, M2 env var sanitization, m1+m2 file-perm window with test).**
