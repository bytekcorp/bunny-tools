# Code Review — Phases 2-7 (bunny-tools)

Date: 260502-1958
Scope: Phases 2-7 (deploy, storage, zones, DNS, MCP server, GH Action). Phase 1 excluded (reviewed previously, fixes verified).

## Pre-flight

- `npm run typecheck` clean
- `npm run lint` clean (eslint boundary rule active in `.eslintrc.cjs:36-50`)
- `npm test` 91/91 pass across 16 files
- Architectural boundary: `grep "from.*api/" src/commands src/mcp` returns nothing. Boundary holds.

## CRITICAL

### C1. GitHub Action — shell injection via `${{ inputs.* }}` interpolation
File: `action/action.yml:60-66`

Inputs `only`, `purge`, `delete-orphans`, `concurrency` are interpolated **directly into the bash script body** rather than passed as env vars. A malicious value containing `"; <cmd>; #` runs arbitrary shell on the runner.

```yaml
[ -n "${{ inputs.only }}" ]   && ARGS+=("--only=${{ inputs.only }}")
```

This is a documented GitHub Actions footgun (used in the `tj-actions/changed-files` 2025 incident class). Even if the action is private, downstream consumers can call it from forks where attackers control inputs.

Fix: pass via env, dereference in bash with quoted `"$VAR"`:
```yaml
env:
  INPUT_ONLY: ${{ inputs.only }}
  INPUT_PURGE: ${{ inputs.purge }}
  ...
run: |
  set -euo pipefail
  ARGS=(deploy --json)
  [ -n "$INPUT_ONLY" ]  && ARGS+=("--only=$INPUT_ONLY")
  ...
```

The action is on the publish path (Phase 7) — fix before tagging a release.

## MAJOR

### M1. MCP `bunny.dns_record_set` skips its own zod parse
File: `src/mcp/tools.ts:193-197`

Every other tool runs `z.object({...}).parse(raw)` before dispatching. This one declares a 10-field `inputSchema` for the wire protocol but the `run` handler just casts:

```ts
run: async (raw) => {
  const args = (raw as { zoneId: number }) ?? {};
  const { zoneId, ...rest } = args as { zoneId: number };
  return addRecord(zoneId, rest);
},
```

`addRecord` does call `parseRecordInput(rest)` internally (validates the discriminated union), so the *body* fields are safe — but `zoneId` is not validated. If the LLM passes `zoneId: "42"` or omits it, the call lands as `client.addDnsRecord(undefined, ...)` → URL `/dnszone/undefined/records` → opaque 404, not the helpful zod error other tools give.

Fix: parse via the declared schema first, like the other 13 tools.

### M2. Diff false-negative when remote checksum is absent
File: `src/deploy/diff.ts:69-73`

```ts
} else if (
  (remote.checksum && remote.checksum.toLowerCase() === sha.toLowerCase()) ||
  (!remote.checksum && remote.length === file.size)
) {
  entry.classification = 'unchanged';
```

When remote has no `Checksum`, falls back to **size-only** comparison. A file edited in place that keeps the same byte count (common: typo fixes, version-string swaps in JS bundles) will be classified `unchanged` and skipped.

Bunny's storage API returns `Checksum` for normal files, but the type marks it optional and `remote-list.ts:18` only forwards it when present. Older zones, partial responses, or directory-shaped entries can drop into this fallback.

Mitigation: when `cachedState` has a prior sha for this path that **also** matches the current local sha and the remote size matches, classify unchanged. When checksum is missing and there is no cached match, classify `changed` (safer to re-upload than skip silently). Or document the size-only fallback explicitly in deploy output.

## MINOR

### m1. `core/deploy.ts:175-182` — `paths` purge is a no-op when toUpload is empty
File: `src/core/deploy.ts:173-183`

```ts
} else if (policy === 'paths') {
  for (const f of toUpload) {
    await acct.purgePullZone(pz.id);
    purgeTargets.push(...);
    purged++;
    break;
  }
}
```

User confirmed `break` is intentional (fallback to whole-zone). But when nothing was uploaded (e.g., re-deploy with no changes), the loop never enters. Result: `paths` policy + empty diff = no purge at all, and no log line saying so. Likely fine in practice — nothing changed, nothing to purge — but combined with M2 (a falsely-unchanged file) it could mask a real bug. Consider emitting a `warn` event when the policy resolves to no purge.

### m2. Dead-code branch: `purge` array form in `bunny.json`
File: `src/config/bunny-json.ts:11-16` vs. `src/core/deploy.ts:161`

`PurgeSpec = z.union([... z.array(z.string()).min(1)])` accepts an explicit URL list. But deploy resolves:
```ts
const policy = opts.purgeOverride ?? (typeof pz.purge === 'string' ? pz.purge : 'all');
```
Array `purge` is silently coerced to `'all'`. Either implement per-URL purge for arrays or drop the array variant from the schema. YAGNI: drop.

### m3. Unused-import smell in `storage:sync`
File: `src/commands/storage/sync.ts:5,8,32-33`

Imports `readFile` and `contentTypeFor`, then forces lint to ignore them with `void readFile; void contentTypeFor;`. Either delete the imports (commands now go through `core/storage-ops.uploadFile` which handles content-type internally) or restructure to use them. The `void` trick adds noise.

### m4. `readJsonOrNull` silently treats corrupt JSON as missing
File: `src/util/fs.ts:31-34`

For `state.ts` and `bunnyrc.ts` this is fine (state regenerates, bunnyrc has its own zod path). For `credential-resolver.ts:91 readFileStore()`, a corrupt `credentials.json` silently looks empty — the user gets `AuthError` instead of "credentials file at X is corrupt." Defense in depth (keychain) covers most users; a one-line `logger.warn` on parse failure inside `readJsonOrNull` (or a typed result) would help users diagnose.

### m5. `bunny.run` uses `process.env` wholesale for child
File: `src/mcp/tools.ts:237-240`

```ts
spawn(process.execPath, [process.argv[1] ?? 'bunny', ...args], {
  cwd: cwd ?? process.cwd(),
  env: process.env,
});
```

The MCP server inherits the user's full env, including any `BUNNY_*` credentials, into spawned `bunny` invocations. Intentional (the LLM agent often wants the deploy to succeed using configured creds), but worth a comment explaining the trust boundary: anyone with stdio access to this MCP server can effectively read secrets via `bunny.run env`. Not exploitable in stdio mode (caller already has the same env), just worth marking.

### m6. Inconsistent error handling in DNS/zone read commands
Files: `src/commands/dns/list.ts`, `src/commands/dns/get.ts`, `src/commands/storage-zone/get.ts`, `src/commands/pull-zone/get.ts`, etc.

Most of these `await` the core call without try/catch and rely on `cli.ts:76-79` to log+exit. The write/delete commands (deploy, configure, upload, etc.) use `progress.fail(...)`. Functionally equivalent — both surface the message — but stylistically split. Either pattern is fine; pick one.

### m7. `pageination runaway` cutoff at page=100
File: `src/api/account.ts:50`

`if (page > 100) throw new Error('Pagination runaway...')`. With `perPage=1000`, that's a hard cap of 100,000 items per resource type. Probably fine for the foreseeable future but worth surfacing as a typed `BunnyError` (so callers can distinguish vs. credential errors) or making the cap configurable per call site.

## Verified-clean checks

- **Architectural boundary** — `commands/**` and `mcp/**` import only from `core/*`, `config/*`, `manifest/*`, `ui/*`, `util/*`. No `api/*` leaks.
- **MCP credentials resource** — `bunny://config/current` returns `[{scope, value: "***xxxx"}]`. `maskCredential` is idempotent (`***xxxx` → `***xxxx`). No plaintext exposure path.
- **MCP tool args logging** — `logger.debug` is only called for HTTP retry/keychain debug; tool args never logged.
- **bunny.run anti-recursion** — `args[0] === 'mcp'` rejected (`tools.ts:235`), test in `tools.test.ts:54-57`.
- **State cache atomicity** — `atomicWriteJson` writes `<path>.tmp.<pid>` then renames; `state.ts:28-31` falls back to null on corrupt/wrong-version data (no crash). State save happens once after diff at `deploy.ts:154`.
- **Upload-pool concurrency** — `runPool` worker loop uses non-shared local `i = nextIndex++`. Each result slot written exactly once. Per-job errors captured, never aborts siblings. Test verifies peak concurrency.
- **DNS type-code mapping** — `dns.ts:10-19` matches user-confirmed Bunny codes (A=0, AAAA=1, CNAME=2, TXT=3, MX=4, SRV=8, CAA=9, NS=12).
- **DNS discriminated union** — MX requires priority, SRV requires priority+weight+port, CAA requires flags+tag. Tested in `dns.test.ts`.
- **HTTP retries** — 401/403 short-circuit (no retry, `AuthError`). 429/5xx retry with jitter+`Retry-After`. Body always drained on auth-fail (no socket leak).
- **Region resolution** — alias > bunny.json > account API. Storage region "DE"/"falkenstein" maps to empty subdomain (primary endpoint). Deploy errors clearly when zone not found.
- **Confirmation gating** — every destructive command (`storage:delete`, `*-zone:delete`, `dns:delete`) requires either `--yes` or interactive `confirm()`; refuses in non-TTY without `--yes`.
- **gitignore handling** — `core/init.ts:39-45` only appends if file exists and entry not present.
- **Drift CI** — `release.yml:40-42` re-runs `gen:all` and `git diff --exit-code`; manifest/AGENTS/schema can't drift from registry.

## Test coverage notes

- 91 tests, all green. `core/deploy.test.ts` covers happy-path, dry-run, purge override, orphan delete via undici MockAgent.
- DNS validation has 8 unit tests covering each record type's required-field constraints.
- MCP tool surface tested for shape (≤16 tools, unique names, all have descriptions, recursive `mcp` rejected). No integration test that drives the actual server transport — acceptable for v0.1.

## YAGNI/KISS observations

- Generally restrained. Only one truly dead path (m2: `purge` array form).
- `bunny.run` escape hatch + `bunny.manifest` resource feels right for an alpha — gives LLMs a fallback without bloating the tool count.
- `src/manifest/registry.ts` as single source of truth (CLI, AGENTS.md, schema, MCP) is the right call; one place to add a command.
- No premature abstractions noted in the diff.

## Recommended priority order

1. **C1** — fix shell injection in action.yml before any release tag.
2. **M1** — add `parse(raw)` to `bunny.dns_record_set` (5-line fix).
3. **M2** — tighten diff fallback when remote checksum is missing.
4. m1-m7 — opportunistic cleanup; none block ship.

## Unresolved questions

- Does Bunny's Edge Storage API guarantee `Checksum` on all file entries? If documented, M2 downgrades to MINOR. If not documented, M2 is the correct severity.
- Is `bunny.run` intended to be reachable from an MCP client running over a network transport in v0.2 (HTTP/SSE)? If yes, m5 (env passthrough) becomes a CRITICAL trust-boundary issue and `bunny.run` should be off-by-default for non-stdio transports.

Verdict: needs-fixes
