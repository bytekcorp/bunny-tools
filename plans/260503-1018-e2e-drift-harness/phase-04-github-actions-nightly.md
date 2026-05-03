---
phase: 4
title: "GitHub Actions nightly + issue-on-fail"
status: completed
priority: P2
effort: "30m"
completedDate: "2026-05-03"
dependencies: [3]
---

# Phase 4: GitHub Actions nightly + issue-on-fail

## Overview

Schedule the e2e suite to run nightly at 03:00 UTC against real Bunny. On failure, open a labeled GitHub issue with the failure log so drift surfaces without anyone having to remember to check.

## Requirements

**Functional**
- Workflow runs daily at 03:00 UTC + on `workflow_dispatch` (manual trigger)
- Reads `BUNNY_E2E_ACCOUNT_KEY` from GitHub Secrets
- On test failure, creates a GitHub issue with title `e2e drift detected — <run_id>` labeled `e2e,drift`
- Issue body includes the failed assertions and a link to the workflow run
- On pass, no issue is created (no noise)
- Workflow has a 15-min timeout to bound runaway runs

**Non-functional**
- Zero new dependencies in repo (only the GitHub Action `peter-evans/create-issue-from-file@v5`)
- Secret name documented in `docs/e2e-testing.md`
- Workflow file <60 LOC

## Architecture

```
.github/workflows/
└── e2e-nightly.yml
```

Workflow shape:

```yaml
name: e2e-nightly
on:
  schedule:
    - cron: '0 3 * * *'    # 03:00 UTC daily
  workflow_dispatch:        # manual trigger button
permissions:
  contents: read
  issues: write             # for create-issue-from-file
jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - name: Run e2e suite
        id: run
        env:
          BUNNY_E2E: '1'
          BUNNY_ACCOUNT_KEY: ${{ secrets.BUNNY_E2E_ACCOUNT_KEY }}
        run: npm run test:e2e 2>&1 | tee e2e-output.log
      - if: failure()
        run: |
          {
            echo "## Failure summary"
            echo ""
            echo "Workflow run: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
            echo ""
            echo "## Last 200 lines of output"
            echo '```'
            tail -200 e2e-output.log
            echo '```'
          } > e2e-failure.md
      - if: failure()
        uses: peter-evans/create-issue-from-file@v5
        with:
          title: "e2e drift detected — ${{ github.run_id }}"
          content-filepath: ./e2e-failure.md
          labels: 'e2e,drift'
```

## Related Code Files

**Create:**
- `.github/workflows/e2e-nightly.yml`

**Modify:**
- `docs/e2e-testing.md` — add CI section: secret name (`BUNNY_E2E_ACCOUNT_KEY`), schedule, manual trigger, where to find issues (label `e2e`), how to roll a fresh secret

## Implementation Steps

1. **Provision the secret** (MANUAL STEP — still pending) — using the same account that worked locally:
   - GitHub repo Settings → Secrets and variables → Actions → New repository secret
   - Name: `BUNNY_E2E_ACCOUNT_KEY`
   - Value: the account API key (from `bunny configure list` or Bunny dashboard)
2. Create `.github/workflows/e2e-nightly.yml` per Architecture above
3. Push to main; verify the workflow appears under the Actions tab
4. **Manual smoke test** — trigger via `workflow_dispatch` button; expect the same ~5 min runtime and pass result as local
5. **Confirm issue-on-fail flow** without burning a real failure: run `gh workflow run e2e-nightly.yml` after temporarily breaking one assertion in a test (e.g. expect `whoami` exit code 99). Verify a GitHub issue is created with label `e2e`. Revert the broken assertion. Close the test issue.
6. Update `docs/e2e-testing.md` CI section with the actual workflow URL and secret-rotation steps

## Success Criteria

- [ ] Workflow file <60 LOC
- [ ] Manual `workflow_dispatch` run completes in <5 min and passes
- [ ] Intentionally-broken test creates a GitHub issue labeled `e2e,drift` within 1 min of failure
- [ ] Reverted test passes on next manual run; no new issue created
- [ ] Secret `BUNNY_E2E_ACCOUNT_KEY` is set and not echoed in any log line
- [ ] `docs/e2e-testing.md` documents how to rotate the secret

## Risk Assessment

| Risk | Mitigation |
| --- | --- |
| Secret leaks in workflow logs | GitHub Secrets are auto-redacted in logs by Actions runner; `bunny whoami` already masks; avoid `env -p \| grep BUNNY` style debug |
| Issue-spam on persistent failure | One issue per run_id keeps duplicates explicit; future enhancement could de-dupe by content-hash |
| Cron drift / runner unavailability | `workflow_dispatch` available as escape hatch; docs explain manual run |
| Bunny rate-limits during run | `singleFork` keeps it sequential; src/api/http.ts retries 429 |
| Account compromise from secret | Use a dedicated key with minimum permissions if Bunny supports scoped keys; otherwise rotate quarterly per docs |
