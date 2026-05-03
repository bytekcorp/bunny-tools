---
type: brainstorm-summary
date: 2026-05-03
slug: e2e-drift-detection-harness
status: approved
target_version: 0.1.x patch (post rc.12)
---

# E2E Drift-Detection Harness — Design Summary

## Problem
Today's full CRUD live test was ad-hoc bash. The repo has zero re-runnable e2e coverage. 122 unit tests use undici MockAgent — by design they cannot detect Bunny API drift. If Bunny renames a field, changes a status code, or updates a schema next month, our users hit the bug before we do (just like Bug #1, #5, #6, #7 today).

## Approved scope
1. **Vitest e2e suite** at `test/e2e/`, gated on `BUNNY_E2E=1`
2. **Real account** (chien ***cc39) with `bt-e2e-*` name-prefixed throwaway resources
3. **GitHub Actions nightly** workflow that runs the suite and opens an issue on failure

## Architecture

### Harness layout

```
test/e2e/
├── helpers/
│   ├── prefix.ts           # bt-e2e-<pid>-<unixts>-* generator
│   ├── cleanup-registry.ts # tracks created IDs; afterAll teardown
│   ├── bunny-cli.ts        # spawn helper for `npx tsx src/cli.ts`
│   ├── stale-sweep.ts      # delete bt-e2e-* older than 24h before suite
│   └── env-guard.ts        # skip whole suite if BUNNY_E2E !== '1'
├── account-readonly.e2e.ts # whoami, manifest --names, all *list
├── storage-zones.e2e.ts    # CRUD + region uppercasing
├── storage-files.e2e.ts    # upload, list (root + subdir), recursive, sync, delete
├── pull-zones.e2e.ts       # CRUD
├── edge-rules.e2e.ts       # add/list/delete subresource (regression for Bug #5)
├── dns.e2e.ts              # zone + record CRUD
├── stream.e2e.ts           # library + video CRUD
├── scripting.e2e.ts        # deploy create + update mode + delete (regression for Bug #7)
├── deploy.e2e.ts           # walk → diff → upload → state cache hit → modify → re-deploy
└── fixtures/
    └── tiny-video.mp4      # ~10 KB, committed (ffmpeg -f lavfi -i testsrc -t 1 -s 64x64)
```

### Vitest config

`vitest.config.e2e.ts` — separate from main `vitest.config.ts`:
- `testTimeout: 60000` (vs default 5s; deploy E2E + video upload need it)
- `pool: 'forks', singleFork: true` — sequential to prevent rate-limit thrash
- `setupFiles: ['./test/e2e/helpers/env-guard.ts']` — skip everything if `BUNNY_E2E` not set

`package.json` adds:
- `"test:e2e": "vitest run --config vitest.config.e2e.ts"`

### Cleanup strategy

Three layers — belt and suspenders:

1. **Per-test `try/finally`**: each test cleans up its own resources before yielding
2. **Suite-level `afterAll`**: `cleanup-registry.ts` tracks every created ID; afterAll iterates and deletes any survivors
3. **Suite-level pre-flight stale sweep** (`stale-sweep.ts`): before the suite runs, delete any `bt-e2e-*` resources older than 24h that prior runs may have orphaned

### CLI invocation strategy

Two options:
- **Spawn `npx tsx src/cli.ts <cmd>`** via `node:child_process` — true e2e, exercises Commander parsing, output rendering, exit codes
- **Import `core/*` directly** — faster, but skips CLI surface

**Pick spawn-based.** Drift detection should cover the whole CLI surface (Commander parsing + flag wiring + render). Speed cost is negligible (~50ms overhead per spawn × ~50 tests = 2.5s). Helper `bunnyCli(args, env?)` returns `{stdout, stderr, exitCode}`.

### Naming + collision

Prefix format: `bt-e2e-<pid>-<unixts>-<service>-<n>` — e.g. `bt-e2e-12345-1746280000-pz-1`.

- PID prevents collision between concurrent local runs
- Unix-ts prevents collision between sequential runs that fail mid-cleanup
- Service code makes orphans easy to grep
- Suite-level seed: `process.env.BT_E2E_PREFIX` so child spawns share the prefix

### Test scope

**IN scope (regression coverage for today's findings):**
- Storage subdir listing (Bug #1 regression)
- Bare-arg commands resolving correctly (Bug #2 regression)
- Edge rule add/list/delete via correct endpoint (Bug #5 regression)
- Scripting deploy --id update mode (Bug #7 regression)
- Stream library delete command (Bug #8 regression)
- Storagezone region uppercasing (Bug #9 regression)
- Deploy E2E with state cache + modified-file detection
- All read-only `list` commands across services

**OUT of scope:**
- `containers app create` — broken (demoted to planned in rc.12)
- `bunny init` interactive — separate manual smoke
- `bunny configure` interactive — same
- `bunny purge` — covered indirectly by deploy; explicit URL purge requires existing pullzone setup

## GitHub Action

`.github/workflows/e2e-nightly.yml`:

```yaml
name: e2e-nightly
on:
  schedule:
    - cron: '0 3 * * *'  # 03:00 UTC daily
  workflow_dispatch:     # manual trigger button
jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run test:e2e
        env:
          BUNNY_E2E: '1'
          BUNNY_ACCOUNT_KEY: ${{ secrets.BUNNY_E2E_ACCOUNT_KEY }}
      - if: failure()
        uses: peter-evans/create-issue-from-file@v5
        with:
          title: "e2e drift detected — ${{ github.run_id }}"
          content-filepath: ./e2e-failure.md
          labels: 'e2e,drift'
```

Test reporter writes `./e2e-failure.md` with the failed assertions on any fail. Single issue per failure run; future improvement could de-dupe via labels.

**Cost analysis:**
- ~50 mutations × 365 nights = 18,250 mutations/year
- Bunny pricing for what we test: storage zones free (deleted same-day), pull zones free, DNS free, stream library free (no actual video traffic), edge scripts free (no executions). Stream video upload of 10 KB × 365 = 3.6 MB/year — negligible.
- GitHub Actions: ~3 min/run × 365 = ~18 hours/year, well within free tier
- **Total cost: $0/year if Bunny pricing holds**

## Approaches considered

| Approach | Verdict |
| --- | --- |
| Standalone bash script | Rejected — no structured assertions, fragile error handling, hard to grow |
| Standalone Node script | Rejected — reinvents vitest |
| **Vitest e2e gated on env** | **Approved** — same runner, structured, parallel-safe, gates cleanly |
| Hybrid: e2e + scheduled GH Action | **Approved as v1** — drift detection automatic |
| Dedicated test account | Rejected — adds credential management overhead; real account proven safe today |
| Per-PR e2e (vs nightly) | Rejected for v1 — would slow PRs and double-spend mutations on every commit |

## Risks

| Risk | Mitigation |
| --- | --- |
| Schedule overlaps with manual run | PID-prefixed naming + stale-sweep before each run |
| Bunny rate-limits us | `singleFork: true` runs sequentially; `src/api/http.ts` has 429 backoff |
| Cleanup fails mid-run leaving orphans | Pre-flight stale sweep deletes anything `bt-e2e-*` older than 24h |
| Test flakiness from network | Retry-once on `BunnyApiError` with status >= 500 (transient infra) |
| Account key leaked in CI logs | CLI already masks creds; verify no `JSON.stringify(env)` in handlers; GitHub Secrets are auto-redacted in logs |
| Stream video upload wastes bandwidth | Use 10 KB synthetic mp4, not the 5.6 MB demo |
| Containers test fails because shape unfixed | Test marked `.skip` until v0.2 rewrite |

## Success criteria

1. `BUNNY_E2E=1 npm run test:e2e` runs all e2e tests against real Bunny in <5 min
2. Zero `bt-e2e-*` resources remain after a successful run
3. Stale sweep deletes orphans from prior failed runs (24h cutoff)
4. CI runs nightly; failure opens labeled GitHub issue
5. Each test asserts response shape (not just status code) so silent drift surfaces
6. Adding a new service is `1 file = 1 service` — no harness changes needed

## Implementation considerations

- **First commit**: harness only (no GH Action). Verify locally for a week. Then add the workflow.
- **Test count target**: ~50 tests across 8 files. Each <5 LOC of assertions on top of the helper.
- **No new dependencies**: use vitest + node:child_process. Skip ffmpeg by committing the fixture (10 KB binary is fine).
- **Documentation**: `docs/e2e-testing.md` — how to run locally, how to provision a test account, how to interpret failures.
- **Reporting**: vitest's default reporter is enough; no custom JSON output needed for v1.

## Effort estimate

- Harness: 4-6 hours
- Tests: 4-6 hours
- GH Action: 30 min
- Local verification: 1 run = ~5 min
- **Total: ~10-12 hours one-time, ~5 min/night recurring**

## Phasing recommendation

| Phase | Deliverable | Effort |
| --- | --- | --- |
| 1 | Helpers + 1 sample e2e file (account-readonly) | 2h |
| 2 | All 8 e2e files | 4h |
| 3 | First end-to-end local run + fix any flakiness | 1h |
| 4 | GH Action workflow | 30m |
| 5 | First successful nightly run + first drift detection test | 1 day wall-clock |

## Out of scope for this brainstorm

- Slack/email notifications on failure (just GitHub issues for v1)
- Multi-account testing (one account is enough)
- Performance benchmarking (separate concern)
- Load testing / parallel mutations (rate limits make it pointless)

## Unresolved questions

None — all three decisions made via AskUserQuestion. Ready for `/ck:plan` if user wants a phased plan, or direct implementation otherwise.
