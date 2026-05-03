---
date: 2026-05-03
slug: e2e-drift-harness
commits:
  - 50f1762
  - 4507a0e
---

# E2E Drift Detection Harness Shipped

## What Went Out

Vitest e2e suite + nightly GitHub Actions cron. Commits:
- `50f1762` — 30 e2e tests across 6 services (18 files)
- `4507a0e` — nightly cron + docs (6 files)

Plan complete except Phase 5 (first nightly cron observability) blocked on manual GitHub secret setup.

## Why This Matters

Live-CRUD test uncovered 6 bugs that 117 unit tests missed: storage subdir 404, bare-arg crash, edge rule silent drop, scripting update crash, missing stream library delete, region case sensitivity. Mocks don't exercise real endpoint shapes. E2E harness hits real Bunny API; drift surfaces fast.

## Architecture

**Isolation & Safety**
- `vitest.config.e2e.ts` split from main config; `BUNNY_E2E=1` env gate — suite skips unless explicitly enabled
- `pool: 'forks', singleFork: true` — sequential, no rate-limit thrash
- Spawn-based CLI invocation (not direct imports) — exercises full Commander surface

**Resource Lifecycle**
- Naming: `bt-e2e-<pid>-<unixts>-<service>-<n>` — PID disambiguates concurrent local runs
- 3-layer cleanup: try/finally → cleanup-registry → 24h stale-sweep in globalSetup
- Per-service files, no harness changes when adding services

**Key Discovery: Propagation Lag**
Storage zone password and Stream library API key take ~5–6s to activate on Bunny's data plane after creation. Ad-hoc test didn't catch this (loose sleep 3 between commands); tight e2e suite hit it. Fixed: 6s wait in beforeAll for storage-files, deploy, stream tests.

## Code Review: DONE_WITH_CONCERNS

Applied 5 of 12 findings:
1. Stale-sweep silent errors → console.error before swallow
2. CLI timeout 60s → 45s + captured output in error message
3. **High-impact:** Stale-sweep parses `--json` not human table (table rendering changes can't break drift detection)
4. Account-readonly assert column headers (not just exit code)
5. Workflow tails redact 32+ char hex/base64 tokens before posting issue body

Deferred (non-blocking): regex tightening, cleanup-failed-count metrics, stream lib-key bypass extraction, GH action SHA pinning.

## Test Results

- 122/122 unit tests pass (unchanged)
- 30/30 e2e pass across 3 runs (~2:15 each)
- Zero `bt-e2e-*` orphans post-cleanup (manually cleared 4 from failed extractId runs pre-fix)

## Surprises

1. **`stream library create` doesn't return ApiKey.** Test bypasses CLI to fetch via direct API. Code review flagged breaking black-box invariant; pragmatic for now. Cleaner fix: `stream library get` returns ApiKey field.

2. **Edge rule GUID extraction order-sensitive.** `pullzone get` returns Hostnames before EdgeRules; first regex match grabbed hostname GUID. Fixed: extract from `edge rule list` instead.

3. **stdout vs stderr split.** Progress messages (`+ Created storage zone...`) go to stderr; JSON/table data to stdout. `bunnyCliOk` now returns `{stdout, stderr, exitCode}`.

## Manual Followup: GitHub Secret

User must add `BUNNY_E2E_ACCOUNT_KEY` in repo Settings → Secrets and variables → Actions. Without it, first nightly cron fails. Phase 5 blocked until done.

## Carry-Forward

- Containers app create schema (demoted to `planned`, needs Bunny v3 research)
- 5 deferred review findings (small, any-time landing)
- Auto-close drift issues on recovery
- De-dupe drift issues by content-hash on multi-night breakage

## Closing

First honest drift detection for bunny-tools. Mocks were always boundary-limited; unit suite can't exercise real endpoint shapes. E2E harness fills that gap with ~2 min of real-API exercise per run. Field renames will surface before users discover them.
