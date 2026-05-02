---
phase: 3
title: "Alpha 2 — Storage & Zones"
status: pending
priority: P2
effort: "4-6d"
dependencies: [2]
---

# Phase 3: Alpha 2 — Storage & Zones

## Overview

Add resource-management CRUD: `storage:*` file ops (already partly used internally — now exposed), `storage-zone:*` (account-level zone provisioning), `pull-zone:*` (CDN config) including `pull-zone:edge-rule:*`. Releasable as `0.1.0-alpha.2`. No new infrastructure — extends api/account.ts and api/storage.ts.

## Context Links

- Design §6.2 (command tree), §6.5 (composite Action — irrelevant here, kept for context)
- Researcher API §2.1 (storage zone mgmt), §2.2 (pull zone mgmt + edge rules), §3 (edge storage)

## Requirements

**Functional**
- `storage:upload <local> <remote> [--zone] [--content-type]`
- `storage:download <remote> <local> [--zone]`
- `storage:list <path> [--zone] [--recursive] [--json]`
- `storage:delete <path> [--zone] [--recursive] [--yes]`
- `storage:sync <local> <remote> [--delete] [--zone] [--concurrency]` (uses phase-2 deploy primitives)
- `storage-zone:list [--json]`, `storage-zone:get <id|name>`
- `storage-zone:create <name> [--region] [--replicate=<r,r,...>] [--tier=Standard|Edge]`
- `storage-zone:update <id> [...]`, `storage-zone:delete <id> [--yes]`
- `pull-zone:list`, `pull-zone:get <id>`, `pull-zone:create <name> --origin=<url> [...]`, `pull-zone:update <id>`, `pull-zone:delete <id>`
- `pull-zone:edge-rule:list <pz>`, `pull-zone:edge-rule:add <pz> --description=... --action=... --triggers=<json>`, `pull-zone:edge-rule:delete <pz> <ruleId>`

**Non-functional**
- Destructive ops (`delete`) require `--yes` or interactive confirm.
- All list commands support `--json` for piping.
- Pagination handled internally; consumer always sees a flat array.

## Architecture

```
src/commands/storage/{upload,download,list,delete,sync}.ts
src/commands/storage-zone/{list,get,create,update,delete}.ts
src/commands/pull-zone/{list,get,create,update,delete}.ts
src/commands/pull-zone/edge-rule/{list,add,delete}.ts

src/api/account.ts (extend)
   - listStorageZones(opts)        // paginated iterator → array
   - getStorageZone(id|name)
   - createStorageZone(body)
   - updateStorageZone(id, body)
   - deleteStorageZone(id)
   - listPullZones(opts)
   - getPullZone(id)
   - createPullZone(body)
   - updatePullZone(id, body)
   - deletePullZone(id)
   - listEdgeRules(pzId)            // returned in pullzone GET; helper extracts
   - addEdgeRule(pzId, rule)
   - deleteEdgeRule(pzId, ruleGuid)

src/api/storage.ts (extend)
   - listRecursive(zone, region, root)  // BFS, used by storage:list --recursive and storage:delete --recursive
```

## Related Code Files

**Create**
- `src/commands/storage/{upload,download,list,delete,sync}.ts`
- `src/commands/storage-zone/{list,get,create,update,delete}.ts`
- `src/commands/pull-zone/{list,get,create,update,delete}.ts`
- `src/commands/pull-zone/edge-rule/{list,add,delete}.ts`
- `test/commands/storage/**`, `test/commands/storage-zone/**`, `test/commands/pull-zone/**`

**Modify**
- `src/api/account.ts` — add zone/pull-zone/edge-rule operations.
- `src/api/storage.ts` — add recursive list helper.
- `src/cli.ts` — register new command tree.

## File Ownership

`src/commands/storage/**`, `src/commands/storage-zone/**`, `src/commands/pull-zone/**`, `test/commands/storage/**`, `test/commands/storage-zone/**`, `test/commands/pull-zone/**`. Extends `src/api/account.ts`, `src/api/storage.ts`, `src/cli.ts`.

## Implementation Steps

1. Extend `src/api/account.ts` with all storage-zone + pull-zone + edge-rule operations. Each list returns an iterator that pages through `page=1..N, perPage=1000`. Provide `toArray()` helper.
2. Extend `src/api/storage.ts` with `listRecursive`.
3. Build `src/commands/storage/upload.ts`: stream-based PUT for files, infer content-type via `mime` (or hardcode common map to avoid dep).
4. `download.ts`: streamed GET with `If-None-Match` skip when local exists and `--check`.
5. `list.ts`: TTY → table, `--json` → array dump, `--recursive` flag.
6. `delete.ts`: confirm prompt unless `--yes`; `--recursive` walks then deletes leaf-first.
7. `sync.ts`: thin wrapper around phase-2 deploy primitives, no purge step. (DRY win.)
8. `storage-zone/*.ts`: thin wrappers over api/account; format output via `src/ui/table`.
9. `pull-zone/*.ts`: same shape. `create` requires `--origin`; defaults rest.
10. `pull-zone/edge-rule/*.ts`: edge rules are nested in pull-zone GET response; `add`/`delete` issue full pull-zone update with mutated `EdgeRules[]`.
11. Register all in `src/cli.ts` via colon-delimited Commander pattern (e.g. `program.command('storage:upload <local> <remote>')`).
12. Tests: per command, Nock-mocked happy path + at least one failure path (404, 401, 429×5 → terminal). Snapshot test list output formatting.

## Success Criteria

- [ ] Every command has `--help` with at least one example in description.
- [ ] `storage:sync` reuses phase-2 deploy primitives without duplicating walk/diff logic (asserted via static review).
- [ ] All list endpoints iterate transparently (test: 2-page mock returns combined array).
- [ ] No `--yes` bypass for destructive ops in CI without explicit env-var enable (`BUNNY_NONINTERACTIVE=1` accepts default = abort).
- [ ] Coverage ≥75% on `src/commands/storage/`, `src/commands/storage-zone/`, `src/commands/pull-zone/`.
- [ ] Releases as `0.1.0-alpha.2`.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Edge rule schema undocumented in researcher report | Read rule shape from a live `pull-zone:get`; persist a TS type from observed payload. Validate inputs against zod with passthrough for unknown fields. |
| Replication regions param naming mismatch | Test against actual API response; allow both `ReplicationRegions` (array) and CSV input. |
| Listing 10K+ pull zones / storage zones | Iterator + perPage=1000 + paged-fetch concurrency=1 (don't parallelize list pages — order matters for stable tables). |
| `storage:delete --recursive` against root | Refuse path `/` or empty; require `--zone` plus explicit `--yes` and confirm prompt with zone name typed back. |

## Code Review Checklist

- [ ] All new endpoints in `src/api/account.ts` add typed request/response interfaces.
- [ ] No `--yes` defaults to true.
- [ ] `--json` output is stable (sorted keys where order is irrelevant).
- [ ] `storage:sync` does not invoke purge (orthogonal to deploy).

## Docs Updates

- README: add storage / zone / pull-zone command examples.
- `docs/codebase-summary.md`: list new command modules.

## Next Steps

→ Phase 4 (Alpha 3 — DNS): same shape, DNS endpoints in api/account.
