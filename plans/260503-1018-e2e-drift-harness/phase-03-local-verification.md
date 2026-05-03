---
phase: 3
title: "Local verification + docs"
status: completed
priority: P2
effort: "1h"
completedDate: "2026-05-03"
dependencies: [2]
---

# Phase 3: Local verification + docs

## Overview

Run the full e2e suite at least three times in a row, fix flakiness, and document for human operators. Output: `docs/e2e-testing.md` covering local invocation, CI flow, account provisioning, and failure interpretation.

## Requirements

**Functional**
- Three consecutive runs pass without flakiness
- Cleanup pass confirmed clean across all 6 services
- Zero `bt-e2e-*` resources remain on the account
- `docs/e2e-testing.md` present, <800 LOC, links from README

**Non-functional**
- Suite runtime <5 min per run
- Documentation readable by a contributor with no prior context

## Architecture

No new code — this phase tests + documents.

`docs/e2e-testing.md` outline:

1. **What this is** — drift detection vs unit tests
2. **Running locally** — env var, command, expected runtime
3. **Provisioning a Bunny account** — for contributors who don't have one
4. **Adding a new service** — copy/paste template, register cleanup, add file
5. **Interpreting failures** — common patterns (auth, rate limit, schema drift, network)
6. **CI flow** — link to Phase 4's GH Action (forward reference)

## Related Code Files

**Create:**
- `docs/e2e-testing.md`

**Modify:**
- `README.md` — single line under Development section: "See [docs/e2e-testing.md](docs/e2e-testing.md) for end-to-end testing against real Bunny."
- `test/e2e/*` — fix flakiness if found (per-test only, no harness changes — those go back to Phase 1 if structural)

## Implementation Steps

1. Run `BUNNY_E2E=1 npm run test:e2e` three times consecutively. Note pass count and timing per run.
2. If any test flakes: identify root cause. Two acceptable fixes per test:
   - Add `await delay(100)` after mutating call before assertion (Bunny propagation)
   - Replace strict equality with shape match (`expect.objectContaining`)
3. Forbidden flakiness fixes: `.skip`, `retry: 3`, increasing timeout beyond 60s. If a test needs those, surface as a real bug instead.
4. After three clean runs, do one orphan sweep: for each service (storagezone, pullzone, dns, stream library, scripting), run `bunny <svc> list | grep bt-e2e` — must be empty.
5. Write `docs/e2e-testing.md` per outline above. Pull example commands from actual run output.
6. Add the README pointer line.
7. Update `docs/codebase-summary.md` if test count cited there is now stale.

## Success Criteria

- [ ] 3 consecutive `BUNNY_E2E=1 npm run test:e2e` runs pass with no flakes
- [ ] Each run finishes in <5 min
- [ ] Zero `bt-e2e-*` orphans after run #3 (verified via 6-service grep)
- [ ] `docs/e2e-testing.md` exists, <800 LOC, covers the 6 outline sections
- [ ] README has the one-line pointer
- [ ] No `.skip` (other than containers placeholder), no `retry: N`, no timeout >60s introduced

## Risk Assessment

| Risk | Mitigation |
| --- | --- |
| Flakiness from Bunny eventual consistency | Add explicit `await delay()` only after mutating calls; document the pattern in docs |
| One test affects another (shared state leak) | Each test gets its own resource via prefix.uniqueId(); strict file-level isolation already in Phase 2 |
| Docs go stale within a release | Tie cited test count to a `wc -l` or registry count, not a hardcoded number |
| Contributors run e2e accidentally | `BUNNY_E2E` gate is the safety; docs warn that this hits real Bunny |
