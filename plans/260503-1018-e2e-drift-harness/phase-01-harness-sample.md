---
phase: 1
title: "Harness helpers + sample e2e"
status: completed
priority: P2
effort: "2h"
completedDate: "2026-05-03"
dependencies: []
---

# Phase 1: Harness helpers + sample e2e

## Overview

Stand up the e2e infrastructure so subsequent phases just drop in test files. Deliverables: separate vitest config gated on `BUNNY_E2E=1`, four helper modules, the 10 KB synthetic mp4 fixture, and one fully-working sample e2e file (`account-readonly`) that exercises the helper surface end-to-end.

## Requirements

**Functional**
- Suite is skipped entirely when `BUNNY_E2E !== '1'`
- Helper auto-prefixes `bt-e2e-<pid>-<unixts>-` so concurrent local + CI runs never collide
- `bunnyCli(args, env?)` spawns `npx tsx src/cli.ts <args>` and returns `{stdout, stderr, exitCode}`
- Cleanup registry tracks created resource ids; suite-level `afterAll` tears down survivors
- Pre-flight stale-sweep deletes any `bt-e2e-*` resource older than 24h before suite runs

**Non-functional**
- Zero new runtime dependencies (vitest + node:child_process only)
- Vitest timeout 60000ms (deploy + video upload need it)
- `pool: 'forks', singleFork: true` — sequential, no rate-limit thrash
- Helpers <250 LOC total

## Architecture

```
test/e2e/
├── helpers/
│   ├── prefix.ts            # bt-e2e-<pid>-<unixts>-* generator (one prefix per suite)
│   ├── env-guard.ts         # vitest setupFile — exits early when BUNNY_E2E !== '1'
│   ├── bunny-cli.ts         # spawn wrapper around `npx tsx src/cli.ts`
│   ├── cleanup-registry.ts  # createdResources.push(...); afterAll iterates
│   └── stale-sweep.ts       # delete bt-e2e-* > 24h via list+delete loop
├── fixtures/
│   └── tiny-video.mp4       # ~10 KB; ffmpeg -f lavfi -i testsrc -t 1 -s 64x64
└── account-readonly.e2e.ts  # smoke test — proves env-guard, cli wrapper, no mutations
```

`vitest.config.e2e.ts` (project root):
- `include: ['test/e2e/**/*.e2e.ts']`
- `setupFiles: ['test/e2e/helpers/env-guard.ts']`
- `globalSetup: ['test/e2e/helpers/stale-sweep.ts']`
- `testTimeout: 60000`
- `pool: 'forks', poolOptions: { forks: { singleFork: true } }`
- `hookTimeout: 60000`

## Related Code Files

**Create:**
- `vitest.config.e2e.ts`
- `test/e2e/helpers/prefix.ts`
- `test/e2e/helpers/env-guard.ts`
- `test/e2e/helpers/bunny-cli.ts`
- `test/e2e/helpers/cleanup-registry.ts`
- `test/e2e/helpers/stale-sweep.ts`
- `test/e2e/account-readonly.e2e.ts`
- `test/e2e/fixtures/tiny-video.mp4`

**Modify:**
- `package.json` — add `"test:e2e": "vitest run --config vitest.config.e2e.ts"` script
- `.gitignore` — already covers test artifacts

## Implementation Steps

1. **Generate the fixture mp4** locally:
   ```bash
   ffmpeg -f lavfi -i testsrc=duration=1:size=64x64:rate=10 \
          -c:v libx264 -preset ultrafast -pix_fmt yuv420p \
          test/e2e/fixtures/tiny-video.mp4
   ```
   Verify size ~10 KB. Commit binary.
2. Write `prefix.ts` — exports `getPrefix(): string` that lazily computes once per suite (uses `process.env.BT_E2E_PREFIX` if set, otherwise generates).
3. Write `env-guard.ts` — vitest setupFile; checks `process.env.BUNNY_E2E === '1'`, otherwise calls `vi.skipAll()` equivalent (or sets a global flag tests can `it.skipIf` on).
4. Write `bunny-cli.ts` — async `bunnyCli(args: string[], env?: Record<string,string>): Promise<{stdout, stderr, exitCode}>`. Uses `node:child_process.spawn('npx', ['tsx', 'src/cli.ts', ...args])`. Inherits env, allows overrides.
5. Write `cleanup-registry.ts` — module-level `Set<{type, id}>`; `register(type, id)`, `cleanupAll()` iterates (per-type delete via bunnyCli). Suite afterAll calls `cleanupAll()`.
6. Write `stale-sweep.ts` — globalSetup hook. Lists each service via `bunnyCli`, regexes for `bt-e2e-*`, parses unix-ts from name, deletes anything > 24h.
7. Write `account-readonly.e2e.ts` — three tests: `whoami` exits 0, `manifest --names` outputs ≥40 lines, `storagezone list` exits 0.
8. Add `vitest.config.e2e.ts` per Architecture section above.
9. Add `test:e2e` script to package.json.
10. Run `BUNNY_E2E=1 npm run test:e2e` locally; expect 3 tests pass <10s.
11. Run `npm run test:e2e` (no env) locally; expect suite skipped (0 tests run).

## Success Criteria

- [ ] `BUNNY_E2E=1 npm run test:e2e` runs 3 tests, all pass
- [ ] `npm run test:e2e` without the env var skips the entire suite (no spawned commands)
- [ ] `test/e2e/fixtures/tiny-video.mp4` exists and is <15 KB
- [ ] Helper modules are pure: zero imports from `src/api/*` or `src/core/*` (true black-box e2e)
- [ ] Cleanup registry called even if a test throws (verified via try/throw test)
- [ ] Stale sweep is idempotent — re-running back-to-back leaves the same state
- [ ] Existing 122 unit tests still pass via `npm test` (vitest config split clean)

## Risk Assessment

| Risk | Mitigation |
| --- | --- |
| `npx tsx` cold-starts make tests slow | Acceptable cost (~50ms × ~50 tests = 2.5s). Avoid `npm exec`; use direct path if needed. |
| ffmpeg not installed for fixture generation | Generate once, commit. Future contributors don't need ffmpeg. |
| Stale sweep deletes resources from a concurrent run | PID + unix-ts in prefix; only sweep > 24h old. |
| Vitest config split breaks IDE integration | Keep `vitest.config.ts` unchanged; e2e is a separate config. |
| Helpers leak account key in error messages | Logger already masks creds; don't `JSON.stringify(env)` anywhere. |
