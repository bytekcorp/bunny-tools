---
title: "bunny-tools CLI v0.1"
description: "Node/TS CLI + composite GitHub Action for Bunny.net (storage deploy + CDN purge + full Bunny surface). Patterned on firebase-tools."
status: pending
priority: P1
branch: "main"
tags: ["cli", "bunny", "deploy", "github-action"]
blockedBy: []
blocks: []
created: "2026-05-02T11:20:55.872Z"
createdBy: "ck:plan"
source: skill
---

# bunny-tools CLI v0.1

## Overview

Build `bunny-tools`: an npm-distributed Node 20+/TypeScript CLI (binary `bunny`) that wraps the Bunny.net REST surface for daily deploys (storage sync + CDN purge) and full resource CRUD (storage zone, pull zone, edge rules, DNS, Stream, Magic Containers, edge scripting). Ships with a composite GitHub Action for CI parity. Honest 4-key auth model. v0.1 target = full Bunny surface in one release, internally phased into weekly alphas (`0.1.0-alpha.N`) so the daily-deploy loop is dogfoodable from week 1.

**Design source of truth:** `plans/reports/brainstorm-summary-260502-1748-bunny-tools-cli-design.md`
**API research:** `plans/reports/researcher-260502-1758-bunny-api-surface.md`
**UX research:** `plans/reports/researcher-260502-1748-firebase-tools-ux-patterns.md`

**Stack:** Node 20+, TypeScript, Commander.js, undici, zod, keytar, Vitest+Nock. esbuild bundle. MIT.
**Naming:** package `bunny-tools` (fallback `@bytekcorp/bunny-tools`), binary `bunny`. Repo `bytekcorp/bunny-tools`. Action `bytekcorp/bunny-tools-deploy-action`.

## Phases

| Phase | Name | Status | Ships as |
|-------|------|--------|----------|
| 1 | [Bootstrap & Foundations](./phase-01-bootstrap-foundations.md) | ✅ Complete (2026-05-02) | (internal — adds `src/core` layer + manifest registry) |
| 2 | [Alpha 1 — Deploy Loop](./phase-02-alpha-1-deploy-loop.md) | ✅ Complete (2026-05-02) | `0.1.0-alpha.1` (incl. `bunny configure`) |
| 3 | [Alpha 2 — Storage & Zones](./phase-03-alpha-2-storage-zones.md) | ✅ Complete (2026-05-02) | `0.1.0-alpha.2` |
| 4 | [Alpha 3 — DNS](./phase-04-alpha-3-dns.md) | ✅ Complete (2026-05-02) | `0.1.0-alpha.3` |
| 5 | [Alpha 4 — Stream/Containers/Scripting](./phase-05-alpha-4-stream-containers-scripting.md) | ⏭️ Deferred to v0.2 | (7 commands remain in registry as `planned`) |
| 6 | [MCP Server & AI-Discovery Polish](./phase-06-mcp-server.md) | ✅ Complete (2026-05-02) | `0.1.0-rc.1` |
| 7 | [GitHub Action & 0.1.0 Release](./phase-07-github-action-release.md) | ✅ Complete (2026-05-02) | `0.1.0` GA + Action `v1` |

## Key Decisions (locked in brainstorm)

- Auth: `bunny auth set/list/clear` + `bunny configure` (interactive `aws configure`-style global walkthrough; `--non-interactive` for CI).
- Architecture: `src/core/*` business-logic layer between commands and api — shared by CLI + MCP, single source of truth.
- AI-discovery: `src/manifest/registry.ts` is the canonical command registry. `AGENTS.md`, `bunny manifest` JSON, `--help --json`, JSON Schema, and MCP tool defs are all generated from it.
- MCP: `bunny mcp` stdio server, ~10 high-level tools + `bunny.run` escape hatch + 3 resources (`manifest`, `agents`, `config/current`).
- Pagination: always `page=1, perPage=1000`; never `page=0`.
- v0.1 excludes `headers/rewrites/redirects` sugar in `bunny.json` (deferred to v0.2).
- Live e2e: none. Nock-only.
- Slip gate at phase 4 (DNS): if trending >2 weeks, demote phase 5 to v0.2 and ship `0.1.0` after phase 4 + phase 6 + phase 7.

## Dependencies

None (greenfield project).

## Progress

**Phases 1–4, 6–7 Complete — 2026-05-02**

- **Total Files**: 164 added, 18 modified, 0 deleted
- **Tests**: 91/91 passing across 16 test files (typecheck ✅, lint ✅, build ✅)
- **Cumulative Commits**: 4 across all phases
- **Active Commands**: 49/56 implemented (Phase 5's 7 stream/containers/scripting commands remain `planned` in registry)
- **Generators**: manifest, agents, schema, bunny.json schema idempotent (drift check verified)
- **Architectural Invariants Hold**:
  - `src/core/*` = single business-logic layer (shared by CLI + MCP)
  - Registry-driven CLI (all commands from `src/manifest/registry.ts`)
  - Pagination always `page=1, perPage=1000`
  - All logs to stderr only (stdout reserved for data)
- **Distribution**: Releasable as `0.1.0-rc.1` (rc.1 because MCP layer landed; ready for npm publish)

**Phase 5 — Deferred to v0.2**
- Reason: slip-gate logic at phase 4; Phase 6 (MCP) and Phase 7 (release) have higher daily value
- Status: 7 stream/containers/scripting commands registered as `planned` in `src/manifest/registry.ts` for AI discovery
- Impacts: Phase 5 implementation blocked; MCP + release proceed without Phase 5 features
