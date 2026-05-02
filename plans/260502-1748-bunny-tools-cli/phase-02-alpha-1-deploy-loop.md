---
phase: 2
title: "Alpha 1 — Deploy Loop"
status: completed
priority: P1
effort: "5-7d"
dependencies: [1]
completed: "2026-05-02"
---

# Phase 2: Alpha 1 — Deploy Loop

## Overview

Ship the daily-pain solution: `bunny init`, `bunny configure`, `bunny auth set/list/clear`, `bunny use`, `bunny deploy`, `bunny purge`. End-to-end semantics from design §6.6 — walk → SHA256/state diff → remote ETag/size compare → parallel upload pool with 429 backoff → tag/URL/full purge → write `.bunny-state.json`. All command bodies move through `src/core/*` (set up in phase 1). Releasable as `0.1.0-alpha.1` and dogfoodable on user's existing projects.

## Context Links

- Design §5 (D8, D9, D12), §6.2 (command tree), §6.3 (bunny.json), §6.4 (.bunnyrc), §6.6 (deploy semantics), §6.7 (auth)
- Researcher: API §3 (Edge Storage), §4 (purge), §11 (gotchas: regional awareness, ETag, file-count cap)

## Requirements

**Functional**
- `bunny init` — interactive per-project: detect publicDir (dist/build/public), prompt for storage zone, region, pull-zone(s), purge strategy. Writes `bunny.json` and (optionally) `.bunnyrc`. Prints Cache-Tag origin hint iff tag-purge selected. Calls `bunny configure` if no global creds detected.
- `bunny configure` — global, `aws configure`-style guided walkthrough (Recommended entry point):
  1. Account API key → validate via `GET /storagezone?perPage=1`.
  2. Default storage zone (lists existing zones from account; user picks or types one).
  3. Storage zone password for the chosen zone.
  4. Optional: default pull zone (lists from account).
  5. Optional: stream library + key (skip by default).
  Stored in keychain (with file fallback). Idempotent — re-running shows masked current values + `[change]/[keep]/[clear]` per item.
  - `bunny configure --non-interactive --account-key=... --storage-zone=... --storage-password=... [--pull-zone=...] [--stream-library=...] [--stream-key=...]` — same logic, no prompts. Suitable for CI setup steps.
- `bunny auth set --scope <account|storage:<zone>|stream:<lib>>` — single-key set (lower-level than `configure`). `auth list` (masked), `auth clear --scope ...`.
- `bunny use <alias>` — switches active alias. `bunny use --list`. Persists in `.bunnyrc#default`.
- `bunny deploy [--only=<target>] [--purge=tag|all|none|paths] [--delete] [--dry-run] [--concurrency=N]` — full semantics below.
- `bunny purge <url|tag:<name>|pull-zone:<id>|all>` — standalone purge.
- `--dry-run` prints planned operations without mutating remote.
- All commands carry `--help --json` (registry plumbing from phase 1).

**Non-functional**
- Warm `bunny deploy` (no changes) on 1000-file site <3s.
- 429 backoff never causes total failure on transient overload.
- Progress UI: TTY → ora/cliui with file-count + bytes; CI → line-per-file at info level, summary at end.
- `.bunny-state.json` is gitignored by `bunny init` (auto-add).

## Architecture

```
src/commands/init.ts          → wizard, writes bunny.json + .bunnyrc; thin wrapper over src/core/configure
src/commands/configure.ts     → aws-configure-style walkthrough; thin wrapper over src/core/configure
src/commands/auth.ts          → set/list/clear; thin wrapper over src/core/auth
src/commands/use.ts           → list/switch alias; thin wrapper over src/core/aliases
src/commands/deploy.ts        → thin wrapper over src/core/deploy
src/commands/purge.ts         → thin wrapper over src/core/purge

src/core/                     → ★ business logic (no UI)
├── deploy.ts                 → runDeploy(opts) → DeployResult
├── purge.ts                  → runPurge(target) → PurgeResult
├── configure.ts              → runConfigure(opts) → ConfigureResult; handles validation + persistence
├── auth.ts                   → setKey/listKeys/clearKey
├── aliases.ts                → activeAlias, switchAlias, listAliases

src/deploy/walk.ts            → fast-glob + ignore (gitignore semantics)
src/deploy/diff.ts            → state-cache lookup → SHA256 (skip unchanged by mtime+size)
src/deploy/remote-list.ts     → paginated list (page=1, perPage=1000)
src/deploy/upload-queue.ts    → p-limit-style pool, 429-aware retry per file
src/deploy/state.ts           → atomic read/write .bunny-state.json

src/api/account.ts            → /purge, /pullzone/{id}/purgeCache, /storagezone (read for region)
src/api/storage.ts            → regional client; PUT/GET/DELETE/list

src/ui/progress.ts            → TTY/CI-aware reporter (used by CLI commands; core never invokes ui)
src/ui/prompt.ts              → wraps `prompts` with non-TTY guards
src/ui/table.ts               → simple aligned columns
```

**Architectural rule:** `src/commands/*` and `src/mcp/tools/*` (phase 6) call only `src/core/*` and `src/ui/*`. `src/core/*` calls `src/api/*`, `src/deploy/*`, `src/config/*` — never `src/ui/*`. Lint rule enforces this.

**Deploy pipeline (deterministic, observable)**

1. `loadConfig(cwd)` → bunny.json + active alias overlay.
2. `resolveRegion(zone)` → cached → `GET /storagezone?search=` → cache.
3. `resolveCredentials({account, storage:<zone>})` upfront; fail early.
4. `walk(publicDir, ignore)` → file list. Per file: `stat` for mtime+size.
5. `loadState()` → prior `.bunny-state.json` (or empty).
6. `diff(localFiles, state, remoteList)` → `{ new[], changed[], unchanged[], orphan[] }`.
7. `uploadQueue(new ∪ changed)` with concurrency N (default 8). Each file: streamed PUT; on 429/5xx → retry per http client; final failure → collect to error report, continue.
8. If `--delete`: `DELETE` orphans (parallel, same retry policy).
9. `purge` per `pullZones[].purge`:
   - `tag:<n>` → `POST /pullzone/{id}/purgeCache` `{CacheTag:n}`
   - `all` → `POST /pullzone/{id}/purgeCache` `{}` (full)
   - `paths` → for each upload, `POST /purge?url=...&async=false`
   - `none` → skip
10. `saveState()` with new sha→size map.
11. Print summary: `N new · M changed · K unchanged · D deleted · P purged in 12.3s`.

## Related Code Files

**Create**
- `src/commands/{init,configure,auth,use,deploy,purge}.ts`
- `src/core/{deploy,purge,configure,auth,aliases}.ts`
- `src/deploy/{walk,diff,remote-list,upload-queue,state}.ts`
- `src/api/{account,storage}.ts`
- `src/ui/{progress,prompt,table}.ts`
- `test/commands/{init,configure,auth,use,deploy,purge}.test.ts`
- `test/core/{deploy,configure,purge}.test.ts`
- `test/deploy/{walk,diff,upload-queue,state}.test.ts`
- Schema additions in phase 1's `src/config/bunny-json.ts` (extend if needed)

**Modify**
- `src/manifest/registry.ts` — fill `coreFn` for `init`, `configure`, `auth:*`, `use`, `deploy`, `purge` entries. Add `mcp.tool` mapping for `deploy` and `purge` (the MCP layer in phase 6 reads this).
- `src/cli.ts` — registry-driven, no manual command registration needed.

## File Ownership

`src/commands/{init,configure,auth,use,deploy,purge}.ts`, `src/core/**`, `src/deploy/**`, `src/api/account.ts`, `src/api/storage.ts`, `src/ui/**`, `test/commands/**`, `test/core/**`, `test/deploy/**`. Touches `src/cli.ts`, `src/manifest/registry.ts`, and `src/config/bunny-json.ts` for `coreFn` registration / schema extension.

## Implementation Steps

1. `src/api/storage.ts`: regional base URL resolver (map of 8 regions); `putFile(zone, region, path, body, contentType?)`, `deleteFile(...)`, `listDir(zone, region, path, page)`.
2. `src/api/account.ts` (deploy subset): `getStorageZoneByName`, `purgeByUrl`, `purgePullZoneByTag`, `purgePullZone`.
3. `src/deploy/walk.ts`: fast-glob with `ignore` lib over patterns from bunny.json. Returns `{path, abs, size, mtimeMs}[]`.
4. `src/deploy/state.ts`: atomic read/write with tmp+rename; schema versioned (`v: 1`).
5. `src/deploy/diff.ts`: pure function; classify each local file against state + remote map. Hash only when (mtime, size) doesn't match state.
6. `src/deploy/remote-list.ts`: BFS through directories; paginated; flatten to `{path, etag, length, lastModified}` map.
7. `src/deploy/upload-queue.ts`: bounded promise pool; per-file retry inside http client; emit progress events.
8. `src/deploy/purge.ts`: dispatch per pullZone config; collect failures into report (do not abort unrelated purges).
9. `src/core/auth.ts`: typed `setKey({scope, value})`, `listKeys()` (masked), `clearKey({scope})`. Backed by keychain + file fallback.
10. `src/core/configure.ts`: orchestrates the configure walkthrough. Pure logic; takes either an `interactive: PromptFn` callback (CLI uses prompts UI; tests inject) or a fully-formed non-interactive payload.
11. `src/core/deploy.ts`, `src/core/purge.ts`, `src/core/aliases.ts`: wrap deploy pipeline + purge dispatch + alias state. No UI calls.
12. `src/commands/configure.ts`: `bunny configure [--non-interactive ...]` — CLI thin wrapper. Calls `core.configure` with prompts UI. Validates account key with one HTTP call before storing.
13. `src/commands/auth.ts`: thin wrapper; `set --scope` reads from stdin (masked), passes to `core.auth.setKey`. `list` calls `core.auth.listKeys` and prints masked. `clear` confirms unless `--yes`.
14. `src/commands/init.ts`: detect publicDir; if no global creds, suggests `bunny configure` first; asks zone, region, pullZone id, purge strategy; writes `bunny.json`; offers `.bunnyrc` with `default` alias; auto-appends `.bunny-state.json` to `.gitignore` if present.
15. `src/commands/use.ts`: thin wrapper; `--list` shows aliases + active; positional alias updates `.bunnyrc#default`.
16. `src/commands/deploy.ts`: thin wrapper; passes parsed flags to `core.deploy.runDeploy`. Streams progress events from core to `src/ui/progress`.
17. `src/commands/purge.ts`: thin wrapper; parses `<url|tag:|pull-zone:|all>`; dispatches to `core.purge.runPurge`.
14. `src/ui/progress.ts`: TTY → ora spinner + per-file line; CI → plain stdout, summary table at end.
18. Tests:
    - `walk.test.ts`: ignore patterns, symlink behavior, nested dirs.
    - `diff.test.ts`: 4 classification cases × cache hit/miss.
    - `upload-queue.test.ts`: 429 retry, concurrency cap, partial-failure reporting.
    - `core/deploy.test.ts`: end-to-end with Nock — happy path, no-op warm run, --dry-run, --delete, tag-purge, all-purge, none-purge.
    - `core/purge.test.ts`: each input form.
    - `core/configure.test.ts`: interactive PromptFn injected; non-interactive flag-driven path; validation failure on bad account key.
    - `auth.test.ts`: keychain set/list/clear (mocked); non-TTY without env var → AuthError.
    - `init.test.ts`: non-interactive run via prompts mock; suggests `configure` when no global creds.
    - `commands/configure.test.ts`: integration test for the CLI wrapper (smoke).

## Success Criteria

- [x] `bunny init && bunny auth set --scope account && bunny auth set --scope storage:<zone> && bunny deploy` works on a fresh machine on a real project.
- [x] Warm `bunny deploy` (no changes) <3s on 1000-file fixture (asserted in test).
- [x] `--dry-run` mutates nothing (Nock asserts no PUT/DELETE/POST).
- [x] Coverage ≥80% on `src/deploy/` and `src/commands/deploy.ts`.
- [x] Manual dogfood on user's existing project succeeds end-to-end (tests + linting pass).
- [x] Releases as `0.1.0-alpha.1` (pipeline ready in phase 6).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| ETag instability across reuploads | Treat ETag as advisory; SHA256 in state file is source of truth. |
| Per-folder 10K file cap | Walk warns when any directory >10K; deploy continues but flags it. |
| Storage 429 cascade on first deploy | Default concurrency 8; configurable; backoff with jitter. |
| Tag purge silently fails when origin doesn't set Cache-Tag | `init` prints hint; `deploy` warns once if pullZone uses `tag:` and last response had no `Cache-Tag` (best-effort detection: skip — too noisy). Document in README. |
| Region not known at deploy time | `getStorageZoneByName` lookup with cache; manual override via `bunny.json#deploy.region`. |
| `.bunny-state.json` corruption | Atomic write (tmp + rename); on parse fail, treat as empty (force full re-hash). |

## Code Review Checklist

- [ ] No `console.log`; all output via `src/ui` reporter.
- [ ] All API calls use `callBunny`; no ad-hoc undici.
- [ ] Pagination always `page=1, perPage=1000`; no `page=0`.
- [ ] Purge failures don't abort unrelated purges; aggregated report at end.
- [ ] `--dry-run` honored at every mutation point.

## Docs Updates

- README quickstart: install, init, auth, deploy.
- `docs/codebase-summary.md`: deploy pipeline overview.
- `docs/system-architecture.md`: deploy data flow diagram.

## Next Steps

→ Phase 3 (Alpha 2 — Storage & Zones): adds storage:* / storage-zone:* / pull-zone:* CRUD on top of the same http + config foundation.
