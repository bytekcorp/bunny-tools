---
type: live-test
date: 2026-05-03
slug: rc10-first-real-account
target: 0.1.0-rc.10
account: ***cc39 (5 storage zones, 4 pull zones, 4 dns zones, 1 edge script)
status: GA-blocking bugs found
---

# Live Integration Test — bunny-tools 0.1.0-rc.10

First real-account test. Auth via env var `BUNNY_ACCOUNT_KEY`. CLI run via `npx tsx src/cli.ts` (no dist build needed).

## Results matrix

| # | Command | Result | Notes |
| --- | --- | --- | --- |
| 1 | `whoami` | PASS | Masked key + zone counts (5/4/4) |
| 2 | `manifest --names` | PASS | 49 commands |
| 3 | `storagezone list` | PASS | Table render |
| 4 | `storagezone get <id>` | PASS | Full JSON incl. Password |
| 5 | `pullzone list` | PASS | Table render |
| 6 | `pullzone get <id>` | PASS | Full JSON |
| 7 | `pullzone edgerule list <id>` | PASS | 1 rule found |
| 8 | `dns list` | PASS | Table render |
| 9 | `dns record list <zone-id>` | PASS | Records returned |
| 10 | `stream library list` | PASS | (empty list) |
| 11 | `containers app list` | PASS | (empty list) — first live verification |
| 12 | `scripting list` | PASS | 1 real script — first live verification |
| 13 | hyphen alias `pull-zone list` | PASS | Aliases route correctly |
| 14 | hyphen alias `storage-zone get` | PASS | Aliases route correctly |
| 15 | `--profile=default` global flag | PASS | Resolves to default profile |
| 16 | `init --help-json` | PASS | JSON help emitted |
| 17 | `docs <topic>` | PASS | Browser open intent |
| 18 | `storage list /` | PASS | Root listing works |
| 19 | `storage list /<subdir>` | **FAIL** | "Object Not Found" — see Bug #1 |
| 20 | `storage list / --recursive` | **FAIL** | "Object Not Found" — see Bug #1 |
| 21 | `storage list` (no path) | **FAIL** | `path.endsWith is not a function` — see Bug #2 |
| 22 | `storage upload --help-json` | **FAIL** | "missing required argument" — see Bug #3 |

**18 PASS / 4 FAIL.** Phase 5 endpoints (Stream/Containers/Scripting) — three years of "zero live verification" — all responded successfully. That's the biggest single win.

## Bugs (GA blockers)

### Bug #1 — MAJOR — Subdirectory listing always returns 404

**Symptom:** `bunny storage list /assets --zone=chien-site` → `[error] Object Not Found`. Every non-root directory fails. Tested `/assets`, `/vi`, `/fonts` (all known to exist per `storage list /`).

**Root cause:** `src/api/storage.ts:28-31` `joinPath()` strips trailing slashes:

```ts
function joinPath(zone: string, path: string): string {
  const clean = path.replace(/^\/+|\/+$/g, '');  // strips leading AND trailing
  return `/${zone}/${clean}`;
}
```

`listDir` adds `/` to non-trailing paths (line 70), then calls `joinPath` which strips it back off. Bunny's storage API treats `/zone/assets` as a file lookup (404) but `/zone/assets/` as a directory listing (200).

**Why root works:** `path = '/'` → after `replace`, `clean = ''` → returns `/zone/` (still has trailing slash by accident).

**Blast radius:**
- `bunny storage list <subdir>` — broken
- `bunny storage list / --recursive` — broken (walks subdirs internally)
- `bunny storage delete <path> --recursive` — broken (uses `listRecursive`)
- `bunny deploy` — **likely broken on any non-empty remote zone** (deploy diff calls `listRecursive`). Untested live but high confidence per code path.

**Fix sketch:** Either (a) bypass `joinPath` in `listDir` and build path inline preserving trailing slash, or (b) add an `isDir` parameter to `joinPath`:

```ts
listDir: async (zone, region, path) => {
  const dir = path.endsWith('/') ? path : `${path}/`;
  const cleanDir = dir.replace(/^\/+/, '');
  const result = await callBunny({
    base: storageBaseUrl(region),
    path: `/${zone}/${cleanDir}`,
    scope: { kind: 'storage', zone },
  });
  return result ?? [];
}
```

**Test gap:** Zero unit tests cover `listDir` / `listPath` / `listRecursive` for non-root paths. Recommend at least one Nock test asserting the URL contains the trailing slash for subdirs.

### Bug #2 — MAJOR — Bare `storage list` (no path) crashes

**Symptom:** `bunny storage list --zone=chien-site` → `[error] path.endsWith is not a function`.

**Root cause:** `src/commands/storage/list.ts:17` defaults `path` to `'/'` only when `args.path ?? '/'` evaluates the inner. But the value falls into `listPath(zone, path, ...)` → into `client.listDir` → `path.endsWith('/')` where `path` is `undefined`. Looking again at the code, `args.path ?? '/'` should default — but the chain eventually loses it OR the registry argument descriptor isn't optional (so Commander passes `''` or `undefined` differently).

**Likely fix:** in `src/commands/storage/list.ts`, ensure `path = args.path ?? '/'` is captured before the `listPath` call (current code does `const path = args.path ?? '/'` — verify this isn't being shadowed). Actually the bug is more subtle — `args.path` may be received as `undefined` and `'/'` default applies, but somewhere downstream the path is re-derived. Needs investigation.

**Workaround for users:** Always pass `/`: `bunny storage list / --zone=...`.

### Bug #3 — MINOR — `--help-json` fails on commands with required args

**Symptom:** `bunny storage upload --help-json` → `error: missing required argument 'local'`.

**Root cause:** Commander validates required positional args before invoking the action handler. The `--help-json` check in `src/cli.ts:127` runs INSIDE the action, so it never reaches that branch when args are missing.

**Workaround:** `bunny init --help-json` works (no required args). For commands with required args, README's promise of "`bunny <any-command> --help-json`" is wrong — this is documentation drift / unfinished feature.

**Fix sketch:** Use Commander's `preAction` hook OR pre-parse `process.argv` for `--help-json` before letting Commander validate args. Mirror how `--help` short-circuits.

### Bug #4 — MINOR (UX) — DNS record types render as numeric codes

**Symptom:** `dns record list 783181` shows `type` column as `code:5`, `code:7` instead of `A`, `CNAME`, `Redirect`, etc.

**Workaround:** None.

**Fix:** Map Bunny's numeric type codes to symbolic names in the table renderer. Bunny enum (per docs): 0=A, 1=AAAA, 2=CNAME, 3=TXT, 4=MX, 5=Redirect, 6=Flatten, 7=PullZone, etc.

## What worked exceptionally well

- **Phase 5 commands first live verification.** Stream library list, Containers app list, Scripting list all returned valid responses against a real account. The endpoint shapes inferred from sparse Bunny docs were correct. (One genuine success: `scripting list` returned the actual script `chien-api-chat` ID 72956.)
- **Hyphen aliases route correctly.** `pull-zone list` and `storage-zone get` work identically to their canonical forms.
- **Global `--profile=default`** resolves the active profile.
- **Auth resolver chain** picks up `BUNNY_ACCOUNT_KEY` env var without a configure step. Zero friction for CI use.
- **Error display.** API errors surface clean (`[error] Object Not Found`) — no stack trace noise.
- **Storage password resolution.** Once `BUNNY_STORAGE_PASSWORD` is set, list-on-root works first try.

## GA gate decision

**Do NOT tag 0.1.0 GA yet.** Bug #1 alone breaks the headline `bunny deploy` command on any zone with content. Recommend:

1. Fix Bug #1 (storage subdir listing) — adds 1 unit test, ~10 LOC change in `src/api/storage.ts`
2. Fix Bug #2 (bare list crash) — ~3 LOC in `src/commands/storage/list.ts`
3. Fix Bug #3 (help-json on required-arg commands) — ~10 LOC in `src/cli.ts` OR document the limitation
4. Defer Bug #4 (DNS type names) — minor, can land in 0.1.x patch

Tag as `0.1.0-rc.11` once #1 + #2 fixed, then live-test deploy + storage delete recursive once more, then GA.

## Test coverage gap

`test/api/storage.test.ts` does not exist. Storage layer relies entirely on MCP tool tests — none of which cover subdirectory listing semantics.

**Recommend adding:** `test/api/storage.test.ts` with Nock asserting:
- `listDir(zone, region, '/')` hits `/zone/`
- `listDir(zone, region, '/sub')` hits `/zone/sub/`
- `listDir(zone, region, '/sub/')` hits `/zone/sub/`
- `listRecursive` walks at least 2 levels deep

## Cleanup needed

- `my-api-key.txt` is in working tree. Already added to `.gitignore` this session. User should `rm my-api-key.txt` after this report is acted on, or leave it (gitignored, won't leak).

## Unresolved questions

- Is the deploy diff broken in practice? Untested live (would have required mutation against a real zone). Strong code-path indication that yes.
- Bug #2 root cause is uncertain — needs a 5-minute repro/inspect to confirm where the `undefined` path slips through the `?? '/'` default.
