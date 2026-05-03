---
phase: 2
title: "Service e2e files (×8)"
status: completed
priority: P2
effort: "4h"
completedDate: "2026-05-03"
dependencies: [1]
---

# Phase 2: Service e2e files (×8)

## Overview

Drop in eight `.e2e.ts` files — one per service — that mutate real Bunny resources via the prefix-aware helpers from Phase 1, assert response shapes, and clean up. Each file is independent and can run in isolation. Total ~50 tests.

## Requirements

**Functional**
- Every test creates only `bt-e2e-*` resources and self-cleans (per-test `try/finally`) plus registers with cleanup-registry as backup
- Assertions check **shape** (specific fields exist, specific status codes, table render contains expected columns) — not just `exitCode === 0`
- Regression coverage for all 6 bugs fixed in rc.12: storage subdir listing, bare-arg defaults, edge rule subresource, scripting deploy --id update, stream library delete, region uppercasing
- Containers tests use `it.skip` with comment referencing v0.2 rewrite

**Non-functional**
- Each file <120 LOC
- Each test <5 LOC of assertions on top of helpers
- Suite total runtime <5 min on a fast network
- Zero shared state between files (no global mutable state across imports)

## Architecture

```
test/e2e/
├── storage-zones.e2e.ts   # 6 tests — create/get/update/delete + region uppercase + list
├── storage-files.e2e.ts   # 8 tests — upload/download/list (root, /sub, /sub/, --recursive)/sync/delete
├── pull-zones.e2e.ts      # 5 tests — create/get/update/delete + list
├── edge-rules.e2e.ts      # 4 tests — add (Bug #5 regression: assert rule actually persists)/list/delete
├── dns.e2e.ts             # 7 tests — zone CRUD + record CRUD (A type)
├── stream.e2e.ts          # 6 tests — library CRUD + video upload (10 KB fixture)/list/delete
├── scripting.e2e.ts       # 5 tests — create/update via --id (Bug #7 regression)/list/delete
└── deploy.e2e.ts          # 4 tests — initial deploy/state-cache hit/modify+redeploy/--dry-run
```

## Related Code Files

**Create (all):**
- `test/e2e/storage-zones.e2e.ts`
- `test/e2e/storage-files.e2e.ts`
- `test/e2e/pull-zones.e2e.ts`
- `test/e2e/edge-rules.e2e.ts`
- `test/e2e/dns.e2e.ts`
- `test/e2e/stream.e2e.ts`
- `test/e2e/scripting.e2e.ts`
- `test/e2e/deploy.e2e.ts`

**Modify:** none (all infrastructure was Phase 1).

## Implementation Steps

1. **storage-zones.e2e.ts** — create `<prefix>-zone`, assert default region DE; create `<prefix>-zone2 --region=ny`, assert response Region === 'NY' (Bug #9 regression); get-by-id and get-by-name; update with `--body='{"ReplicationRegions":[]}'`; list contains both; delete both.
2. **storage-files.e2e.ts** — create zone, capture password from `storagezone get`. Tests: upload single file; list `/` shows it; list `/<sub>` returns subdir listing (Bug #1 regression); list `/<sub>/` same; list `/ --recursive` includes subdir contents; bare `storage list` (no path) succeeds (Bug #2 regression); download byte-identical; delete /sub --recursive; delete /file. Cleanup zone.
3. **pull-zones.e2e.ts** — create with `--origin=https://bunny.net`; get returns Hostnames[]; update `--body='{"EnableLogging":true}'`; list contains it; delete; verify gone.
4. **edge-rules.e2e.ts** — Bug #5 regression. Create pull zone, add rule via `--rule='<json>'`, **assert rule persists** by re-listing (proves we hit `/edgerules/addOrUpdate` not pullzone update); delete rule by GUID; assert empty list. Cleanup pz.
5. **dns.e2e.ts** — create `<prefix>.invalid` zone; get returns Records[]; add A www 1.2.3.4 --ttl=300; record list shows type as `A` (not `code:0`); update record body; delete record; delete zone.
6. **stream.e2e.ts** — create library; capture API key via `BUNNY_STREAM_KEY` env; upload `test/e2e/fixtures/tiny-video.mp4 --title=bt-test`; list videos shows guid; delete video; **delete library via `stream library delete <id> --yes`** (Bug #8 regression).
7. **scripting.e2e.ts** — write tmp `.js`, deploy create; assert `id` returned; deploy update via `--id=<id>` with new code (Bug #7 regression — must NOT crash, must return updated metadata); list shows it; delete.
8. **deploy.e2e.ts** — create zone, capture pw, build tmpdir with 3 files (1 in subdir), write `bunny.json`. Tests: dry-run says "3 new"; full deploy uploads 3; rerun shows "3 unchanged"; modify one file, rerun shows "1 changed". Cleanup zone.
9. Run full suite: `BUNNY_E2E=1 npm run test:e2e`. Expect ~50 tests pass <5 min.
10. Verify zero `bt-e2e-*` orphans across all services (re-run `bunny <svc> list 2>&1 | grep bt-e2e` for each service — should be empty).

## Success Criteria

- [ ] All 8 files compile + lint clean
- [ ] `BUNNY_E2E=1 npm run test:e2e` runs ~50 tests, all green, in <5 min
- [ ] Edge rule add test asserts rule appears in list (not just exit code) — fails if Bunny silently drops the rule
- [ ] Scripting deploy --id test asserts response.Name matches input — fails if 204 → undefined
- [ ] Storage subdir listing test asserts at least one entry returned — fails on Bug #1 regression
- [ ] Stream library delete test calls the new command (not direct API) — fails if registry entry removed
- [ ] Containers tests are present but `.skip`-ed with comment
- [ ] Zero `bt-e2e-*` resources after a successful run (verified via grep across all services)

## Risk Assessment

| Risk | Mitigation |
| --- | --- |
| Tests interact (one creates, another expects empty) | Each file is its own describe block with its own zones; no shared resource ids |
| Bunny rate-limits during sequential 50 tests | `singleFork: true` + 429 backoff in src/api/http.ts; if still flaky, add 100ms delay between mutating tests |
| Stream video upload fails on slow network | 10 KB fixture; 60s timeout |
| Cleanup fails mid-test → orphan | cleanup-registry catches it via afterAll; stale-sweep catches >24h survivors next run |
| New service added to bunny-tools without e2e file | Phase 3 docs lists "adding a service" workflow; CI doesn't fail without coverage |
