---
type: live-test
date: 2026-05-03
slug: rc11-full-crud
target: 0.1.0-rc.11 (with Bug #1+#2 fixes applied locally)
account: chien (***cc39)
test_prefix: bt-test-260503-095749-*
status: 5 new bugs surfaced — additional fixes required before GA
---

# Full CRUD Live-Test — bunny-tools 0.1.0-rc.11

12 phases, ~25 mutations, all name-prefixed `bt-test-260503-095749-*`. Final sweep confirmed zero orphans across all services after manual stream-library cleanup.

## Results matrix

| Phase | Service | Result | Notes |
| --- | --- | --- | --- |
| 1 | Storage Zones CRUD | PASS | create / get-by-id / get-by-name / update / list / delete all work |
| 2 | Storage files CRUD | PASS | upload / list / download (byte-identical) / delete / sync (3 files incl. subdir) / list --recursive / delete /sub --recursive |
| 3 | Pull Zones CRUD | PASS | create / get / update / delete |
| 4 | Edge Rules CRUD | **FAIL** | Bug #5 — `add` reports success but rule never persists |
| 5 | DNS Zones CRUD | PASS | create / get / list / delete |
| 6 | DNS Records CRUD | PASS | add / list / update / delete |
| 7 | Stream Library | PARTIAL | create works; **no delete command exists** (Bug #8) |
| 8 | Stream Video CRUD | PASS | upload (5.6 MB) / list / delete |
| 9 | Magic Containers CRUD | **FAIL** | Bug #6 — body shape wrong; Bunny v3 requires `runtimeType`, `containerTemplates[]`, `autoScaling.{min,max}` |
| 10 | Edge Scripting CRUD | PARTIAL | create / list / delete work; **update mode crashes** (Bug #7) |
| 11 | Deploy E2E | **PASS** | walked 3 → diff 3 new → uploaded 3 → recursive list verified. State cache works on re-deploy (3 unchanged, 1 changed). Bug #1 fix confirmed working in production code path. |
| 12 | Final orphan sweep | CLEAN | All `bt-test-*` resources removed (after manual stream-lib delete) |

## Bugs found (5 new + 2 still open from prior round)

### Bug #5 — MAJOR — Edge rule add silently fails

**Symptom:** `bunny pullzone edgerule add <id> --rule=<json>` prints `Added edge rule. Pull zone now has 1 rule(s).` but `pullzone get <id>` shows `EdgeRules: []` and `pullzone edgerule list` returns `(no edge rules)`.

**Root cause:** `src/core/zones.ts:addEdgeRule` calls `client().updatePullZone(pullZoneId, { EdgeRules: next })` which POSTs to `/pullzone/{id}` with `{EdgeRules: [...]}`. **Bunny's pullzone update endpoint does not accept the EdgeRules field — it silently drops it.** Bunny has dedicated edge-rule endpoints:

- `POST /pullzone/{pullZoneId}/edgerules/addOrUpdate` — body is the single rule object
- `DELETE /pullzone/{pullZoneId}/edgerules/{guid}`

**Fix sketch:**

```ts
// src/api/account.ts
addEdgeRule: (pullZoneId: number, rule: Record<string, unknown>) =>
  callBunny<EdgeRule>({
    base, path: `/pullzone/${pullZoneId}/edgerules/addOrUpdate`,
    method: 'POST', scope: { kind: 'account' }, body: rule,
  }),
deleteEdgeRule: (pullZoneId: number, guid: string) =>
  callBunny<void>({
    base, path: `/pullzone/${pullZoneId}/edgerules/${guid}`,
    method: 'DELETE', scope: { kind: 'account' },
  }),
```

Then `src/core/zones.ts` calls these directly, no list-then-update pattern.

**Test gap:** `test/core/zones.test.ts` mocked the wrong endpoint, so passing tests gave false confidence.

### Bug #6 — MAJOR — Magic Containers create body wrong

**Symptom:** `bunny containers app create <name> --image=... --region=DE --port=80` → `[error] HTTP 400`.

**Root cause:** Direct probe with curl returned Bunny's actual error:

```json
{
  "errors": [
    { "field": "runtimeType", "message": "The field RuntimeType is invalid." },
    { "field": "containerTemplates", "message": "Application must have at least one container" },
    { "field": "autoScaling.max", "message": "Value for 'autoScaling.max' must be between 1 and 1000." },
    { "field": "autoScaling.min", "message": "Value for 'autoScaling.min' must be between 1 and 1000." }
  ]
}
```

Current `src/core/containers.ts:createApp` sends `{Name, Image, Region, Port}`. Bunny expects:

```json
{
  "name": "...",
  "runtimeType": "Container",
  "autoScaling": { "min": 1, "max": 10 },
  "containerTemplates": [{ "image": "...", "port": 80, "regions": ["DE"] }]
}
```

**Fix scope:** Substantial. Needs research into Bunny's full Containers v3 schema. Suggest rewriting `core/containers.ts` and `api/account.ts` (createContainerApp body shape) and updating the CLI flags to match (currently 3 flags; real surface needs more).

**Recommend:** Demote `containers app create` from `active` to `planned` in registry until rewrite. Keep `containers app list` and `containers app delete` (proven working).

### Bug #7 — MEDIUM — Scripting deploy update mode crashes

**Symptom:** `bunny scripting deploy <name> --file=<path> --id=<existingId>` → `[error] Cannot read properties of undefined (reading 'Name')`.

**Root cause:** `src/api/account.ts:updateEdgeScriptCode` types its return as `EdgeScript` but Bunny's `POST /compute/script/{id}/code` returns 204 No Content / empty body. `callBunny` resolves to undefined, then `result.Name` throws.

**Fix sketch:**

```ts
// src/core/scripting.ts
if (opts.id !== undefined) {
  await c.updateEdgeScriptCode(opts.id, { Code: code });
  // Re-fetch to return the up-to-date metadata for the success message.
  return c.getEdgeScript(opts.id);
}
```

**Test gap:** No live test covered update mode prior to today.

### Bug #8 — MEDIUM — Stream library has no delete command

**Symptom:** Created library `bt-test-260503-095749-lib` (id 652095) cannot be deleted via CLI. Registry has `stream library list` and `stream library create` but no `delete`.

**Workaround:** Direct API: `curl -X DELETE -H "AccessKey: <key>" https://api.bunny.net/videolibrary/{id}`

**Fix:** Add `stream library delete <id>` to registry + thin command file. Bunny endpoint is `DELETE /videolibrary/{id}` (returns 204). ~30 LOC.

### Bug #9 — MINOR — Storage zone region flag rejects lowercase

**Symptom:** `bunny storagezone create foo --region=ny` → `[error] [storagezone.validation] Invalid main region code.`

**Root cause:** Bunny accepts uppercase region codes (`NY`, `LA`). CLI README and registry description both say lowercase ("e.g. ny, la, sg").

**Fix:** Either `.toUpperCase()` the region flag value before sending, or update registry description and README to use uppercase examples. Recommend uppercase + transform — preserves user-friendly lowercase input.

### Bug #10 — MINOR — README has multiple flag-name errors

Caught while running tests. README I wrote earlier today documents:

| Command | README says | Actual |
| --- | --- | --- |
| `pullzone edgerule add` | `--body=<json>` | `--rule=<json>` |
| `dns record add` | `--type=A --name=... --value=...` (flags) | `<type> <name> <value>` (positional) |
| `stream video upload` | `--library=<id>` | `<library> <file>` (positional) |

**Fix:** README rewrite pass to match registry. ~10 LOC of doc edits.

## Still open from prior round

- **Bug #3** (`--help-json` on required-arg cmds) — unchanged; documented behavior limitation, fix in later patch
- **Bug #4** — RESOLVED (false positive). DNS record types render correctly as `A` not `code:0`. Was a misread of the chien.do zone output last time.

## What worked exceptionally well

- **Bug #1 + #2 fixes confirmed in production:** `bunny deploy` walked 3 files, diffed remote storage (calls `listRecursive` internally), uploaded everything, then re-ran with state-cache hit and modified-file detection. The headline command path is now production-grade.
- **`storage delete /sub --recursive`** — works correctly with the bug-1 fix.
- **`storage delete /` recursive guard** — refuses to delete zone root, prompts user to use `storagezone delete` instead. Good safety.
- **DNS record CRUD** — full positional-arg path works including `--ttl` flag. Type names render correctly.
- **Stream library + video upload** — 5.6 MB upload completed cleanly; library API key resolved automatically.
- **Edge Scripting create + delete** — work as advertised. First live confirmation that `/compute/script` endpoint shape matches.
- **Pull zone create** — sets up hostnames, returns full object, accepts `--origin` flag correctly.
- **Storage zone create + update** — `--body=<json>` raw mode works for partial updates.

## GA gate decision

**Do NOT tag 0.1.0 GA yet.** Required additional fixes:

1. **Bug #5 (edge rules)** — silent failure is worse than error. Either fix or demote `pullzone edgerule add/delete` to `planned`. ~30 min to fix.
2. **Bug #6 (containers create)** — substantial rewrite OR demote `containers app create` to `planned`. Recommend demote for v0.1; tackle in v0.2.
3. **Bug #7 (scripting deploy update)** — small fix, ~5 min.
4. **Bug #8 (stream library delete missing)** — small add, ~30 min.
5. **Bug #9 (region case)** — small fix, ~5 min.
6. **Bug #10 (README)** — doc fix, ~10 min.

Total fix budget: ~90 min including a second live verification pass.

**After fixes, suggest tagging `0.1.0-rc.12` not `0.1.0`** — these surface large enough that one more rc cycle is honest.

## Untested commands (still no live verification)

- `bunny init` (interactive)
- `bunny init --non-interactive` (non-interactive)
- `bunny configure` (interactive)
- `bunny purge` (covered indirectly by deploy with no pullZones; not tested with pullZones)
- `bunny mcp` (manual smoke-test against Claude Code recommended)

## Test coverage gap

Prior round noted `test/api/storage.test.ts` was missing — added in rc.11 commit (will land with bug-fix commit).

**Still missing:**
- `test/api/edge-rules.test.ts` — would have caught Bug #5
- `test/api/containers.test.ts` (live-shape mock) — would have caught Bug #6 sooner if tests asserted error envelope shape
- Update-mode tests for scripting deploy — would have caught Bug #7

## Cleanup state

- Created: 4 storage zones, 2 pull zones, 2 DNS zones, 1 stream library, 1 stream video, 1 edge script
- Final sweep: 0 leftovers across all services
- All `bt-test-*` resources removed
- `/tmp/bt-*` working files removed

## Unresolved questions

- Bunny Magic Containers v3 schema — full field list not documented in our researcher report. Need a fresh research pass before fixing Bug #6.
- Stream library `update` endpoint — registry doesn't have one; not tested; unknown if we should add.
