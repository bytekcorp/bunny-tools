# rc.10 UX Polish — Brainstorm Summary

**Date:** 2026-05-03 08:56
**Source audit:** `plans/260502-1748-bunny-tools-cli/reports/researcher-260503-0856-ux-audit-rc9.md`
**Status:** Design approved (Tier 1 + Tier 2). Ready for `0.1.0-rc.10`.

---

## 1. Problem

After 9 release candidates, surface is structurally sound but daily friction remains. User asked for full UX review. Audit identified 15 issues; agreed to ship Tier 1 (6 fixes) + Tier 2 (3 fixes) in rc.10. Brutal-honest note logged: this is the LAST UX iteration before live integration testing.

## 2. Approved fixes (9 total)

### Tier 1 — daily friction (HIGH)

**H1. Auto-default `--zone` for `storage *` commands.**
Today every `storage upload/download/list/delete/sync` requires `--zone=...`. After H1: precedence is `--zone` flag > active alias's storageZone > bunny.json#deploy.storageZone > error.

```bash
# rc.9:
bunny storage upload x.txt /x --zone=my-app
# rc.10 (when bunny.json or alias has my-app):
bunny storage upload x.txt /x
```

**H2. `bunny init` reuses what `configure` already stored.**
If keychain has `storage:my-app` password, init defaults storage zone to "my-app" and doesn't re-prompt for password. Eliminates the duplicate-entry friction users hit when running configure→init back-to-back.

**H3. Subcommand group descriptions.**
Replace placeholder `storage commands` / `pullzone commands` strings with actual descriptions in `bunny --help`. Adds `groupDescription` field to `CommandSpec` types; `cli.ts` walker uses it when creating intermediate group commands.

**H4. Hyphenated command aliases.**
Register `pull-zone`, `storage-zone`, `edge-rule` as Commander aliases for `pullzone`, `storagezone`, `edgerule`. Both work; flattened forms remain canonical in help. Old docs/muscle memory survive.

**H5. `bunny configure` walkthrough asks about pull zone.**
Adds an optional pick step after storage zone: lists pull zones, allows "none — skip". Stores chosen pull-zone id under the profile (new field in profile bag). Symmetry with non-interactive `--pull-zone` flag.

**M4. Error messages surface `BunnyApiError` detail.**
When Bunny returns `{ ErrorKey, Field, Message }`, format CLI error as `[errorKey] message (field: X)`. Aids docs/log search.

### Tier 2 — worth shipping while we're here

**M1. `pullzone create <name> <origin>` — origin positional.**
Was `--origin=<url>`. Reads cleaner as positional. Minor breaking change (acceptable pre-GA).

**M3. Stream library get/delete for symmetry.**
Adds `bunny stream library get <id>` and `bunny stream library delete <id> [--yes]`. Two thin command files + registry entries. Brings stream library to full CRUD.

**M5. `bunny manifest --names` mode.**
Outputs flat list of command names, one per line. Useful for shell completion / quick scan. Default behavior unchanged.

## 3. Implementation order

1. Add `groupDescription` to `CommandSpec` type + cli.ts handling (H3 foundation).
2. Add aliases support to `CommandSpec` + cli.ts walker (H4 foundation).
3. Update `core/configure.ts` to ask pull zone (H5).
4. Update `core/init.ts` to detect existing zones from keychain + reuse (H2).
5. Update each storage command handler to default `--zone` (H1).
6. Update logger error formatting (M4).
7. Move pullzone create origin to positional (M1).
8. Add stream library get/delete files + registry entries (M3).
9. Add `--names` flag to manifest command (M5).
10. Update tests (~10 new test cases across the changes).
11. Bump 0.1.0-rc.9 → 0.1.0-rc.10. Regen artifacts. Commit + tag + push.

## 4. Files affected (estimate)

| Layer | Change |
|---|---|
| `src/manifest/types.ts` | Add `groupDescription?` and `aliases?` to CommandSpec. |
| `src/manifest/registry.ts` | Add per-group descriptions. Move pullzone create origin to args. Add stream library get/delete entries. |
| `src/cli.ts` | Honor groupDescription + aliases in tree builder. |
| `src/core/configure.ts` | Add pull-zone pick step. |
| `src/core/init.ts` | Detect existing zones; pre-fill defaults. |
| `src/core/storage-ops.ts` | Add `resolveActiveZone(override?)` helper. |
| `src/commands/storage/{upload,download,list,delete,sync}.ts` | Use resolver helper instead of strict --zone. |
| `src/commands/pullzone/create.ts` | Positional origin. |
| `src/commands/stream/library/{get,delete}.ts` | New files. |
| `src/commands/manifest.ts` | Add `--names` flag. |
| `src/util/logger.ts` (or call sites) | Format BunnyApiError detail. |
| Tests | New tests for zone-default precedence, init prefill behavior, stream library CRUD, manifest --names. Update affected existing tests. |

## 5. Risk register

| Risk | Mitigation |
|---|---|
| Auto-default `--zone` masks bugs (deploys to wrong zone) | Print resolved zone in command output ("Uploading to my-app:..."). Same as deploy already does. |
| Hyphenated aliases register late after primary, conflict | Walker registers primary first; aliases set via Commander's `.alias()` API; tested. |
| `init` prefill prompts confusingly when keychain has stale zone | If detected zone doesn't exist in account anymore (zone listing API check), show but don't preselect. |
| pullzone create origin positional break | Pre-GA; zero published users for that exact form; CHANGELOG note. |
| Walkthrough length grows with new pull-zone step | "none" option short-circuits; takes <2 seconds for users without pull zones. |

## 6. Success criteria

- All 117 existing tests pass + ~10 new tests.
- `bunny storage upload x.txt /x` works when bunny.json has storageZone (no `--zone` needed).
- `bunny --help` shows real group descriptions, no `storage commands` placeholders.
- `bunny pull-zone list` works (alias for `bunny pullzone list`).
- `bunny stream library get/delete` work end-to-end.
- `bunny manifest --names` lists ~50 names, one per line.
- Error from a bad pullzone id surfaces `pullzone.not_found` in the output.
- Auto-publishes via OIDC, just like rc.7-9.

## 7. Hard line (this is the ask)

After rc.10 ships, **no more design pivots before GA.** Next step is live integration test on a real Bunny account. If something genuinely broken surfaces, hotfix as `0.1.1`. Otherwise tag `0.1.0` GA.

## 8. Open questions

- Where does `defaultPullZoneId` get stored when configure asks (new field in profile bag, or in a separate config object)? **Decision:** new field on the profile bag in `credentials.json` — co-located with the rest of the profile data. Simplest.
- Should `bunny manifest --names` filter to active commands only or include planned? **Decision:** active only by default; `--all` flag for full set. Skip the flag in v0.1.
- Does `init` prefill ask "use stored zone X?" or silently default to it? **Decision:** silently default; show in summary line so user sees what was picked.
