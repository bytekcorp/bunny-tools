# E2E Drift-Detection Harness — Sync Report

**Date:** 2026-05-03 11:04 UTC  
**Status:** 4 of 5 phases complete; 1 manual step blocking phase 5.

## What Shipped

**Phase 1 (DONE):** Harness infrastructure complete.
- `vitest.config.e2e.ts` with `BUNNY_E2E=1` gate, sequential forks, 60s timeout
- Five helper modules: prefix.ts (bt-e2e-<pid>-<unixts>-* generation), env-guard.ts (setupFile), bunny-cli.ts (spawn wrapper), cleanup-registry.ts (afterAll teardown), stale-sweep.ts (globalSetup >24h purge)
- account-readonly.e2e.ts smoke test (whoami, manifest, storagezone list)
- Synthetic tiny-video.mp4 fixture (8.6 KB)
- `test:e2e` script added to package.json

**Phase 2 (DONE):** 8 service e2e files written; ~30 tests total.
- storage-zones.e2e.ts, storage-files.e2e.ts, pull-zones.e2e.ts, edge-rules.e2e.ts
- dns.e2e.ts, stream.e2e.ts, scripting.e2e.ts, deploy.e2e.ts
- Regression coverage for rc.12 bugs: #1 (storage subdir), #2 (bare-arg), #5 (edge rule subresource), #7 (scripting deploy --id), #8 (stream library delete), #9 (region uppercase)

**Phase 3 (DONE):** Verified + documented.
- Three consecutive clean runs: ~2:15 per run; zero orphans after run #3 (manually cleaned 4 strays from earlier broken-extractId)
- docs/e2e-testing.md written: local invocation, account provisioning, adding a service, failure interpretation, CI flow reference
- README pointer added

**Phase 4 (DONE in code):** GitHub Actions workflow complete.
- .github/workflows/e2e-nightly.yml written (48 LOC): schedule 03:00 UTC daily + manual trigger, secret-gated, issue-on-fail with last 200 lines + workflow link
- Code-review pass applied (M1–M10 fixes logged before merge; lower-priority deferred)
- **BLOCKER:** User must manually add `BUNNY_E2E_ACCOUNT_KEY` secret to GitHub repo for workflow to fire

**Phase 5 (PENDING):** Wall-clock dependency.
- Requires scheduled 03:00 UTC cron to fire (next opportunity ~2026-05-03 03:00 UTC)
- Observational: verify green, run drift drill, confirm issue flow
- P3 priority; does not block v0.1.x patches

## Code-Review Outcomes

Applied fixes:
- M1: sweep errors now logged before swallowing
- M2: bunnyCli timeout drops to 45s default + includes captured output
- M3: stale-sweep parses --json instead of human table (highest-leverage fix)
- M4: account-readonly tightened to assert column header presence
- m10: workflow tail-redacts long hex/base64 tokens before posting issue body

Deferred (not load-bearing):
- m1, m2, m8 (regex tightening)
- m4 (cleanup-registry failed-count surfacing)
- m6 (stream lib-key fetch helper extraction)
- m12 (pin GH action to SHA)

## Remaining Actions

1. **User action (BLOCKING PHASE 5):** Add `BUNNY_E2E_ACCOUNT_KEY` secret to GitHub repo
   - Settings → Secrets and variables → Actions → New repository secret
   - Name: `BUNNY_E2E_ACCOUNT_KEY`
   - Value: Bunny account API key

2. **Automatic:** Next 03:00 UTC, scheduled nightly fires; Phase 5 observes + documents outcome

## Success Metrics

- [x] 4 phases complete (1–4) on 2026-05-03
- [x] ~30 tests green locally; <5 min per run
- [x] Zero orphans after verified runs
- [x] Code-review pass applied
- [ ] Phase 5 blocked on: scheduled nightly fire + manual secret provisioning

## Unresolved Questions

- None; clear path to phase 5 once secret is added and cron fires.
