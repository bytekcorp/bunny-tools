# bunny-tools: Product Overview & Development Requirements

**Status:** v0.1.0 GA SHIPPED (Phases 1–4, 6–7 complete; Phase 5 → v0.2)  
**Version:** v0.1.0  
**Created:** 2026-05-02  
**GA Released:** 2026-05-02  
**Package:** `bunny-tools` (npm)  
**Binary:** `bunny`  
**License:** MIT  
**Repository:** `bytekcorp/bunny-tools`

---

## Problem Statement

Deploying static assets to Bunny.net requires repeating a manual workflow per project:
1. Research Bunny REST API surface
2. Obtain/manage multiple credential types (Account, Storage Zone, Stream, Database)
3. Construct regional endpoint URLs
4. Handle rate-limiting (429) and transient failures (5xx)
5. Orchestrate storage uploads + CDN cache purge as separate commands

No official Bunny CLI exists. Community alternatives (4 total) handle storage-only, lack purge orchestration, and have no GitHub Actions story. Result: friction in daily deploy loops and no parity between local dev and CI/CD.

---

## Goals

**v0.1 Primary**
- Frictionless daily deploy loop: `bunny deploy` syncs storage zone + purges pull zone (one command, idempotent, warm-run <3s)
- Manual + CI parity: same command, same credentials model in terminal and GitHub Actions
- Full Bunny.net resource surface (v0.1): CRUD for storage zones, pull zones, DNS, Stream, Magic Containers, edge scripting (phased alpha releases)
- Honest 4-key auth model: explicit credential scope handling (Account / Storage Zone / Stream / Database) without false unification
- Firebase-tools ergonomics: single binary, JSON config (`bunny.json`), interactive setup (`bunny configure`), no poetry/containers/complex setup

**Acceptance Criteria**
- `npm install -g bunny-tools` → `bunny deploy` works on fresh machine in <5 min (with credentials)
- `bunny deploy --dry-run` + `bunny deploy` idempotent on warm runs (<3s)
- `npm test` ≥80% coverage on http + config + manifest layers
- Cold-start `bunny --help` <50ms
- CI drift-check: `manifest.json`, `AGENTS.md`, `schema/bunny.schema.json` generated from registry; CI verifies no manual edits
- All 47 v0.1 commands discoverable via `bunny manifest` JSON
- No real network calls in test suite (Nock-enforced)

---

## Non-Goals (v0.1 / Explicitly Deferred)

- **Live emulator** — Mock with Nock in tests; no local Bunny simulation
- **Plugin system** — Defer until 100+ commands or external request
- **Telemetry** — No phone-home or tracking
- **`headers`/`rewrites`/`redirects` sugar** — Deferred to v0.2 (requires edge-rule sync); raw CRUD lands v0.1
- **Multipart upload** — Bunny undocumented; single PUT + retry covers <100MB cleanly

---

## Target Personas

| Persona | Use Case | Success Metric |
|---------|----------|-----------------|
| **Web Dev** | Deploy static site weekly via laptop + GitHub Actions | Credential flow <2 min; warm deploy <3s |
| **DevOps Engineer** | Multi-env deployment (prod/staging/preview branches) | `bunnyrc` alias switching; CI secret management |
| **AI Agent** | Discover + execute commands programmatically | `bunny manifest` JSON; MCP stdio server (P6) |
| **Platform Builder** | Expose Bunny resource CRUD in internal tooling | REST parity; typed command args/flags via registry |

---

## Key Architectural Decisions

| # | Decision | Why |
|---|----------|-----|
| D1 | Node 20+, TypeScript, Commander.js | Speed (~22ms baseline), zero deps, ubiquity in target audience |
| D2 | `src/core/*` business-logic layer (no UI, no `console.log`, no `process.exit`) | Shared by CLI + MCP (P6); single source of truth; testable in isolation |
| D3 | Registry-driven CLI: `src/manifest/registry.ts` is canonical command source | All surfaces (help, JSON, AGENTS.md, schema, MCP defs) generated from one registry; no hand-wiring; easy to add commands |
| D4 | Auth: explicit 4-key model (`account` / `storage:<zone>` / `stream:<lib>` / `database:<name>`) | Honest to Bunny's architecture; per-call-site credential resolution; prevents fake unification |
| D5 | Credential resolver chain: flag → scoped env → generic env → keychain → file → prompt | Flexible per deployment context; CI-friendly (env vars); local-friendly (keychain); interactive fallback |
| D6 | `bunny.json` (git-tracked, project) + `.bunnyrc` (gitignored, aliases) | Firebase-tools pattern; zod-validated; JSON Schema published for editor support |
| D7 | HTTP client: undici + 429/5xx exponential backoff + jitter + Retry-After honor | Connection reuse for small PUTs; rate-limit resilience; configurable timeout |
| D8 | Pagination: always `page=1, perPage=1000` | Avoids Bunny's `page=0` array footgun on large accounts |
| D9 | Test stack: Vitest + Nock | Isolated HTTP mocking; no live e2e; fast feedback; Node ecosystem standard |
| D10 | Phased delivery (alpha releases within v0.1) | Deploy loop dogfoodable week 1; full surface by week 5; user feedback before GA |

---

## Technical Constraints

| Constraint | Rationale |
|-----------|-----------|
| **Node 20+** | Target audience (web devs) universally available; GitHub Actions CI ready |
| **MIT License** | Community-friendly; compatible with web dev ecosystem |
| **Zero runtime deps** (besides commander, undici, zod, keytar, picocolors, ora) | Minimal supply chain risk; lean installation |
| **CommonJS + ESM hybrid ready** | npm v20 support; future TypeScript best-practice alignment |
| **CLI first, library second** | Primary UX is `bunny` binary; programmatic access via core layer + MCP (P6) |
| **No breaking changes in 0.1.x** | GA release should be stable; pre-GA alphas free to iterate |

---

## Success Metrics (All Phases Complete)

| Phase | Release | Metric | Status |
|-------|---------|--------|--------|
| 1 | (internal) | Cold-start `bunny --help` | ✅ ~22ms |
| 1 | (internal) | Test coverage (all layers) | ✅ ≥80% |
| 1 | (internal) | CI drift-check | ✅ artifact sync passing |
| 2 | alpha.1 | `bunny deploy` E2E (dry-run + real) | ✅ Nock-mocked, working |
| 3 | alpha.2 | Storage + zone CRUD functional | ✅ All 18 commands active |
| 4 | alpha.3 | DNS CRUD functional | ✅ All 8 commands active |
| 5 | (deferred) | Stream/Containers/Scripting | 📦 v0.2 (scope cut for faster GA) |
| 6 | rc.1 | MCP server + docs | ✅ ~14 tools, 3 resources |
| 7 | 0.1.0 GA | GH Action + npm publish | ✅ SHIPPED 2026-05-02 |
| **Actual** | 49 commands | All active + tested | ✅ 91+ tests passing |

---

## Release Cadence (Actual)

- **v0.1.0-alpha.0** — Phase 1 (2026-05-02): foundations + manifest
- **v0.1.0-alpha.1** — Phase 2 (2026-05-02): deploy loop
- **v0.1.0-alpha.2** — Phase 3 (2026-05-02): storage + zones
- **v0.1.0-alpha.3** — Phase 4 (2026-05-02): DNS
- **v0.1.0-rc.1** — Phase 6 (2026-05-02): MCP + docs (Phase 5 deferred)
- **v0.1.0** — Phase 7 (2026-05-02): GH Action + npm publish [✅ SHIPPED]

**Note:** All phases 2–4, 6–7 shipped on same day. Phase 5 preemptively cut to v0.2.

---

## Command Taxonomy (v0.1 Complete)

```
bunny init
bunny configure [--non-interactive]
bunny auth set|list|clear
bunny use <alias>
bunny deploy [--dry-run]
bunny purge <target>

bunny storage:upload|download|list|delete|sync
bunny storage-zone:list|get|create|update|delete
bunny pull-zone:list|get|create|update|delete
bunny pull-zone:edge-rule:list|add|delete

bunny dns:list|get|create|delete
bunny dns:record:list|add|update|delete

bunny stream:library:list|create|delete
bunny stream:video:list|upload|delete

bunny containers:list|create|deploy|delete
bunny scripting:list|deploy|delete

bunny manifest (Phase 1 ✓)
bunny mcp (Phase 6)
```

---

## Dependencies & Infrastructure

**Runtime**
- `commander` — CLI framework
- `undici` — HTTP client
- `zod` — validation
- `keytar` — OS keychain (optional native; graceful fallback to file)
- `picocolors` — terminal colors
- `ora` — progress spinner
- `ignore` — gitignore parser
- `fast-glob` — file traversal
- `prompts` — interactive input

**Dev**
- `typescript` — strict mode, ES2022 target
- `vitest` + `nock` — unit tests + HTTP mocking
- `esbuild` — build
- `eslint` + `prettier` — lint + format

**CI/CD**
- GitHub Actions (Node 20 + 22, ubuntu-latest + macos-latest)
- Drift check: registry → manifest.json/AGENTS.md/schema auto-generated

---

## Ownership

**Project Lead:** chien  
**Initial Commit:** 2026-05-02  
**Repo:** https://github.com/bytekcorp/bunny-tools
