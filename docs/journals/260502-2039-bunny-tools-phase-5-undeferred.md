---
date: "2026-05-02T20:39:00Z"
phase: 5
title: "Phase 5 Un-Deferral — Stream / Containers / Scripting Shipped"
severity: "Medium"
status: "Resolved"
commit: "6f7c8da"
previous_journal: "260502-1958-bunny-tools-phases-2-through-7.md"
related_plan: "plans/260502-1748-bunny-tools-cli/phase-05-alpha-4-stream-containers-scripting.md"
---

# Phase 5 Un-Deferral — Stream / Containers / Scripting Shipped in v0.1

**Date**: 2026-05-02 20:39  
**Severity**: Medium (reversible decision, cleanly executed)  
**Component**: CLI phases 2–7 (bunny-tools v0.1)  
**Status**: Resolved — Phase 5 shipped alongside Phases 6–7

## What Happened

Phase 5 was deferred to v0.2 mid-session (~19:58) per slip-gate logic — context budget needed preserving for MCP (Phase 6) and release tooling (Phase 7), which held more daily-deploy value. All 7 stream/containers/scripting commands stayed in the registry as `planned` entries for AI discovery cost-free. 

User returned ~40 minutes later asking to un-defer Phase 5 and ship it in v0.1 with all tests green. I reversed the deferral, implemented the phase in ~30 minutes, added 22 new files (11 command implementations, 3 core wrappers, 3 test modules, 5 API extensions), ran the test suite, and shipped commit `6f7c8da`. Phase 5 now released as v0.1.0-rc.2 alongside Phases 6–7 (which were already complete).

## The Brutal Truth

Un-deferring felt like reversing a difficult trade-off I'd consciously made, but the reversal was **structurally free**. Because Phase 5 stayed in the registry, nothing had to be retroactively discovered or re-decided. The 30-minute implementation was mechanical: extend existing API clients, follow established command patterns, write thin CLI wrappers, batch tests via undici MockAgent (same infra as Phase 3–4). No architectural surprises. No hidden costs.

The frustrating part is that I'd correctly predicted the slip-gate trade-off earlier — "if trending >2 weeks, demote phase 5" — but then the un-deferral proved the decision was never permanent. Slip-gates are powerful precisely because they're reversible, but that also means they create cognitive dissonance: you make a hard call, then a few keystrokes undo it. Going forward, slip-gate decisions need explicit documentation that they're checkpoints, not verdicts.

## Technical Details

**Scope shipped (11 commands, matching registry's `planned` entries exactly):**

- **Stream** (5): `stream:library:{list,create}`, `stream:video:{list,upload,delete}` + per-library auth scope
- **Containers** (3): `containers:app:{list,create,delete}`
- **Scripting** (3): `scripting:{list,deploy,delete}`

**Deferred to v0.2** (consciously, not accidental):

- `stream:collection:*`, `stream:caption:*` (advanced media sub-resources)
- `containers:endpoint:*`, `containers:volume:*`, `containers:autoscale:*` (advanced container orchestration)
- `scripting:secret:*`, `scripting:variable:*` (environment / secret management)

The v0.1 surface covers daily ops (library/video CRUD, app creation, script deployment); granular sub-resource management deferred to v0.2.

**Key implementation detail — Stream uses TWO base URLs:**

- `api.bunny.net/videolibrary` for library CRUD (account API key scope)
- `video.bunnycdn.com/library/{id}/videos` for video CRUD (per-library `stream:<libraryId>` scope)

Both in a single `src/api/stream.ts` client that switches base + scope per method. The 4-key auth model from Phase 1 (account, storage password, stream key, account) made this zero-friction — adding a per-library scope required no new infrastructure.

**Scripting deploy dual-mode:** `scripting:deploy` creates new on first run, updates by id on subsequent (Firebase/Wrangler pattern). Uses `/compute/script/{id}/code` for code-only updates so metadata isn't re-sent.

**Test counts:** 13 new tests mocked via undici MockAgent (same pattern as Phases 3–4). All 104 tests green post-commit.

**Files added:** 11 command implementations + 3 core wrappers + 3 test modules + 5 API extensions = 22 total.

## What We Tried

Deferred Phase 5 mid-cook per slip-gate logic. When user asked to un-defer, I evaluated the reversal cost and found it near-zero because:

1. Registry entries stayed intact as `planned` (no discovery debt)
2. Phases 6–7 were already shipping on the same release (rc.2)
3. Command pattern was machine-learned from Phases 3–4 (no novel decisions)

Proceeded directly to implementation without re-planning.

## Root Cause Analysis

The underlying issue wasn't Phase 5's complexity — it was **context budget perception**. Midway through Phases 6–7, I'd overestimated the cognitive load of un-deferring Phase 5 later. Turned out, because the architectural boundary held inviolate across 49 prior commands, adding 11 more in a tight pattern was additive (low cognitive cost) rather than disruptive.

Slip-gates are useful, but I treated this one as more permanent than it was. The pattern should be: slip-gates are checkpoints for evaluating context *at that moment*, not irreversible verdicts. When context improves (user explicitly asks, or remaining work looks tractable), flip it.

## Lessons Learned

**Slip-gates are reversible checkpoints, not final verdicts.** Document them as such. When you defer a phase, note in the code (registry entry, phase doc, commit message) that it *may* be un-deferred if context permits. It costs nothing to leave the structure in place (registry entries as `planned`, no deleted code).

**Architectural patterns lower un-deferral cost.** Because Phases 1–4 established rock-solid command patterns, adding 11 more commands was mechanical. The boundary lint rule (commands never import api directly, only through core) made Phase 5 a pure-template exercise. Future phases should likewise invest in pattern clarity over feature breadth.

**Live integration test is zero for v0.1.** Stream / Containers / Scripting endpoints are best-effort implementations based on sparse Bunny docs. The test suite has zero live Bunny account usage (100% Nock + MockAgent). v0.1.x rollout will reveal mismatches; doc all assumptions in the edge-case handling.

## Next Steps

**v0.1.0 GA blocking items:**

1. npm name verification (`bunny-tools` may be taken; fallback `@bytekcorp/bunny-tools`)
2. Reserve `bytekcorp` GitHub org if not created
3. Manual smoke-test of `bunny mcp` against Claude Code
4. CI matrix validation (Node 20 + 22 × ubuntu + macos)
5. **CRITICAL:** Live integration test of stream/containers/scripting against a real Bunny account. Endpoint shapes for containers (`/mc/apps`) and scripting (`/compute/script`) are inferred from sparse docs. Zero live verification currently. One failed request reveals schema mismatches.

**v0.2 scope (locked):**

- Sub-resources: collections, captions, endpoints, volumes, autoscale, secrets, variables
- Live e2e harness (beyond Nock + MockAgent)
- HTTP/SSE MCP transport
- `bunny.json` `headers`/`rewrites`/`redirects` sugar (edge-rule sync)

**Slip-gate learning:** Document Phase 5's un-deferral pattern in `docs/design-guidelines.md` (reversible slip-gates section) so future phases know to leave registry entries intact when deferring.

**Commit chain:** `3db7fc1` (P1) → `9c01ba2` (P2) → `d2bec5b` (P3) → `a9c9a30` (P4) → `febc12a` (P6) → `ffa8e4c` (P7) → `6f7c8da` (P5 un-deferred).

Total elapsed Phase 5: ~30 min. Net state: 104/104 tests ✅, 60 active commands, 19 test files, 0.1.0-rc.2 ready for publish.
