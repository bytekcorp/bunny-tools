---
title: "E2E Drift-Detection Harness"
description: "Vitest e2e suite gated on BUNNY_E2E=1 + nightly GitHub Action that detects when Bunny.net API shapes drift away from what bunny-tools expects."
status: in_progress
priority: P2
branch: "main"
tags: ["testing", "e2e", "ci", "drift-detection"]
blockedBy: []
blocks: []
created: "2026-05-03T03:23:34.367Z"
completedDate: "2026-05-03T10:30:00Z"
createdBy: "ck:plan"
source: skill
---

# E2E Drift-Detection Harness

## Overview

122 unit tests mock Bunny via undici MockAgent and cannot detect API drift. Today's full live CRUD test surfaced 6 bugs that mocks missed — same risk lurks every time Bunny ships an API change. This plan adds a re-runnable e2e suite that hits real Bunny via name-prefixed throwaway resources, plus a nightly GitHub Action that opens an issue when the suite fails.

**Design source of truth:** `plans/reports/brainstorm-summary-260503-1018-e2e-drift-detection-harness.md`

**Stack:** Vitest 2.x (separate config), node:child_process for CLI spawning, real Bunny account (chien ***cc39), GitHub Actions for nightly runs.
**Gate:** `BUNNY_E2E=1` env var — skip whole suite otherwise. Never runs in regular CI.
**Naming:** `bt-e2e-<pid>-<unixts>-*` for all created resources. Pre-flight stale-sweep deletes anything older than 24h.

## Phases

| Phase | Name | Status | Effort | Completed |
|-------|------|--------|--------|-----------|
| 1 | [Harness helpers + sample e2e](./phase-01-harness-sample.md) | Completed | ~2h | 2026-05-03 |
| 2 | [Service e2e files (×8)](./phase-02-service-e2e-files.md) | Completed | ~4h | 2026-05-03 |
| 3 | [Local verification + docs](./phase-03-local-verification.md) | Completed | ~1h | 2026-05-03 |
| 4 | [GitHub Actions nightly + issue-on-fail](./phase-04-github-actions-nightly.md) | Completed | ~30m | 2026-05-03 |
| 5 | [First successful nightly + drift drill](./phase-05-first-successful-nightly.md) | Pending | ~1d wall-clock | — |

## Key Decisions (locked in brainstorm)

- Vitest e2e (not bash, not custom runner)
- Real account with prefixed throwaways (not separate test account)
- Build harness AND GH Action (not just harness)
- Spawn-based CLI invocation (not core/* import) — exercise full Commander surface
- Sequential run (`pool: 'forks', singleFork: true`) — no parallelism within a run
- Containers `.skip`-ed until v0.2 schema rewrite
- Stream video fixture committed (~10 KB synthetic mp4)

## Success Criteria

- `BUNNY_E2E=1 npm run test:e2e` finishes in <5 min, all green
- Zero `bt-e2e-*` resources remain after a successful run
- Stale sweep cleans 24h+ orphans before each run
- Nightly CI runs at 03:00 UTC; failure opens labeled GitHub issue
- Each test asserts response shape (not just status code) so silent drift surfaces
- Adding a new service = 1 file with no harness changes

## Dependencies

No cross-plan dependencies. Builds on rc.12 fixes (commits 924d427 + 293f237) but does not block further v0.1.x work.
