---
phase: 5
title: "First successful nightly + drift drill"
status: pending
priority: P3
effort: "1d wall-clock"
dependencies: [4]
---

# Phase 5: First successful nightly + drift drill

## Overview

Wait for the scheduled nightly to fire, verify it passes unattended, then run one intentional drift drill so we know the failure→issue flow actually works in production. This phase is mostly observation, not coding.

## Requirements

**Functional**
- At least one scheduled run (not manual `workflow_dispatch`) completes green
- One intentional failure → labeled GitHub issue → close issue verified
- Account state is clean after both runs

**Non-functional**
- No code changes in this phase
- Outcome captured in a journal entry

## Architecture

No new files. Verification + observation only.

## Related Code Files

**Create:**
- `docs/journals/<date>-e2e-harness-shipped.md` — journal entry capturing the outcome

**Modify:** none.

## Implementation Steps

1. **Wait for the scheduled run** — first 03:00 UTC fire after Phase 4 ships. Set a calendar reminder for ~05:00 UTC the next day.
2. Open Actions tab; confirm the run completed green with the same ~5 min runtime and ~50 tests as local
3. Run a 6-service grep on the account: confirm zero `bt-e2e-*` orphans
4. **Drift drill** — temporarily change one test assertion to something that will fail. Pick a low-risk file (e.g. `account-readonly.e2e.ts` — assert `manifest --names` returns ≥99999 lines). Push to a feature branch and open a PR (or just push to a `drift-drill` branch and run `gh workflow run e2e-nightly.yml -r drift-drill` so main stays clean)
5. Within 1 min of failure, verify a GitHub issue is created with title `e2e drift detected — <run_id>` and labels `e2e,drift`
6. Read the issue body — confirm it contains workflow link + last 200 log lines
7. Revert the broken assertion (or delete the drill branch); close the drift-drill issue
8. Run a manual `workflow_dispatch` once more to confirm green state restored — no new issue
9. Write the journal entry: scheduled run pass time, drift drill issue link, anything you'd improve in v2

## Success Criteria

- [ ] One unattended scheduled nightly completes green
- [ ] Drift drill produces exactly one issue, labeled correctly, with useful body
- [ ] Reverting the drill returns the suite to green; no new issue
- [ ] Account end-state: zero `bt-e2e-*` orphans
- [ ] Journal entry written and committed

## Risk Assessment

| Risk | Mitigation |
| --- | --- |
| First scheduled run fails for environmental reason (Bunny outage, runner issue) | Re-trigger via `workflow_dispatch`; success criterion needs ONE scheduled green, not consecutive |
| Drift drill leaves a test broken on main | Use `drift-drill` branch + `workflow_dispatch -r`; never commit broken assertion to main |
| Drill issue stays open and pollutes triage | Closing instructions in the implementation steps; future enhancement: bot auto-closes when next run passes |
| Wall-clock dependency means sub-day stalls block nothing else | Phase 5 is P3, not blocking — v0.1.x patches don't depend on this |

## Carry-forward (v2 ideas)

These are explicitly out of scope; capture for future plans:

- **Auto-close issues on recovery** — bot that closes the open `e2e,drift` issue when the next nightly is green
- **De-dupe issues by content-hash** — if Bunny is broken for a week, don't create 7 identical issues
- **Slack/email notification** — currently issue-only
- **Multi-account testing** — only one account today
- **Per-PR e2e on labeled PRs** — gate via a label like `e2e-required` so deploy-loop changes get verified before merge
