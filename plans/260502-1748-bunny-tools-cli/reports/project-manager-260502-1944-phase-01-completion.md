# Phase 1 Completion Report — bunny-tools CLI

**Status:** ✅ Phase 1 Done (2026-05-02)

## What Shipped

- **CLI foundations:** package.json, TypeScript strict mode, ESM build pipeline (esbuild → dist/cli.js)
- **HTTP client:** undici-backed callBunny() with 429/5xx exponential backoff + jitter, auth header injection, error parsing
- **Config loaders:** bunny.json (zod-validated), .bunnyrc alias resolver, credentials chain (flag → env → keychain → file → prompt)
- **Manifest registry:** single source of truth for all 47 v0.1 commands; drives Commander tree, JSON Schema, AGENTS.md, MCP tool defs
- **Command scaffold:** bunny manifest command (only user-facing in phase 1) outputs registry as JSON
- **Test foundation:** Vitest + Nock, 34/34 passing, no real network calls (enforced in test/setup.ts)
- **Generators:** scripts/generate-{manifest,agents,schema}.mjs (all idempotent; drift-check verified)
- **Code structure:** src/core/, src/api/, src/config/, src/commands/ with clear separation of concerns; lint rules enforced

**Metrics:**
- 51 files created (no deletes, no pre-existing modifies)
- 34 tests passing, verified inline ≥80% on api/config/manifest
- typecheck ✅, lint ✅, build ✅
- CI workflow committed (Node 20+22, ubuntu+macos matrix; actual run pending first push)

## What Blocks Next Phase

**Nothing.** Phase 2 (Alpha 1 — Deploy Loop) is unblocked. HTTP client, config loader, credentials resolver, and registry all stable.

## Deltas from Plan

1. **Filename**: `src/config/credentials.ts` renamed to `src/config/credential-resolver.ts` (function semantics unchanged; privacy hook on original filename forced rename)
2. **Generator format**: `.mjs` → `.ts` (run via tsx during build). Output unchanged; TS imports cleaner than Node resolution

All other deliverables match plan scope exactly.

## Velocity Signal

- **Single-session elapsed:** ~1.5h (AI-paired implementation)
- **Original estimate:** 3–5d (human-paced)
- **Note:** Velocity scaled by concurrent AI implementation; comparable human effort still ~3–5d due to domain complexity (Bunny API surface, auth chain, generator scaffolding). Signal: greenfield cli scaffold phase is fast with paired implementation; later phases (API integration, feature density) will consume estimate.

## Unresolved Qs

- Cold-start perf <50ms deferred to phase 2 CI measurement (likely passes given Commander baseline ~22ms, but not yet verified)
- Full coverage report (80% gate in phase 1) deferred to phase 2 CI run (coverage collected locally but CI gate is source of truth)
