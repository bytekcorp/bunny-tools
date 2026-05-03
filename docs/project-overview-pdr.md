# bunny-tools: Product Overview & Development Requirements

**Status:** v0.1.0-rc.10 (Live on npm; alpha channel. GA pending live integration tests.)  
**Version:** 0.1.0-rc.10  
**Created:** 2026-05-02  
**Current Release:** 2026-05-03  
**Next Gate:** Live integration testing on real Bunny account  
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
- Frictionless ergonomics: single binary, JSON config (`bunny.json`), interactive setup (`bunny init`), no poetry/containers/complex setup

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
| D6 | `bunny.json` (git-tracked, project) + `.bunnyrc` (gitignored, aliases) | Per-project config + per-developer aliases; zod-validated; JSON Schema published for editor support |
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
| 5 | shipped rc.10 | Stream/Containers/Scripting | ✅ All 11 commands active |
| 6 | rc.1 | MCP server + docs | ✅ 15 tools, 3 resources |
| 7 | rc.10 | GH Action + npm publish (OIDC) | ✅ Tagged v0.1.0-rc.10 |
| **Live now** | npm/alpha | 49 commands + 117 tests | ✅ rc.2–rc.10 shipped |
| **GA gate** | — | Live integration testing | ⏳ Next phase |

---

## Release Cadence (rc.2 through rc.10)

All releases published to npm under `@alpha` dist-tag (via OIDC trusted publishing; no NPM_TOKEN).

- **v0.1.0-rc.2** (2026-05-02): Manual OTP. Unified init/configure (firebase-style feature picker).
- **v0.1.0-rc.3** (2026-05-02): init simplification followed. configure removed (moved to auth).
- **v0.1.0-rc.4/rc.5** (never published): OIDC setup / debugging; tombstones during GitHub token migration.
- **v0.1.0-rc.6** (2026-05-02): First OIDC publish. repository.url + bin path fixes.
- **v0.1.0-rc.7** (2026-05-02): Wrangler-style space-delimited subcommands (rc.6→rc.7 BREAKING). Added whoami, docs, global flags (-c, --cwd, -e, -p), init [dir] positional.
- **v0.1.0-rc.8** (2026-05-02): 6 wrangler wins follow-up. Global -p/--profile added; init [dir] finalized.
- **v0.1.0-rc.9** (2026-05-03): Multi-account profiles. configure restored (profile-aware). auth removed (rc.7→rc.9 BREAKING). Auto-migration from rc.8 flat credentials.json shape.
- **v0.1.0-rc.10** (2026-05-03): UX polish. Zone auto-defaults, group descriptions, hyphen aliases, error detail, --names flag. Phase 5 commands shipped (stream, containers, scripting).

All shipped same project (no split); 117 tests passing; 49 active commands.

---

## Command Taxonomy (v0.1.0-rc.10 — 49 Active Commands)

**Setup & Daily:**
- `bunny init [dir]` — auth + feature multi-select + per-feature config
- `bunny configure` — profile-aware credential walkthrough (rc.9+)
- `bunny configure list|switch|remove` — multi-account management (rc.9+)
- `bunny deploy [--dry-run]` — storage sync + CDN purge (the main command)
- `bunny purge <target>` — standalone cache purge by URL/tag/zone
- `bunny whoami` — show active credentials (rc.8+)
- `bunny docs [topic]` — quick help (rc.8+)

**Storage (with auto-default zone rc.10+):**
- `bunny storage upload|download|list|delete|sync`

**Zones (space-delimited syntax rc.7+; hyphen aliases rc.10+):**
- `bunny storagezone list|get|create|update|delete` (aliases: storage-zone)
- `bunny pullzone list|get|create|update|delete` (aliases: pull-zone)
- `bunny pullzone edgerule list|add|delete` (aliases: edge-rule)

**DNS:**
- `bunny dns list|get|create|delete`
- `bunny dns record list|add|update|delete`

**Stream (Phase 5, shipped rc.10):**
- `bunny stream library list|create|get|delete` (get/delete rc.10+)
- `bunny stream video list|upload|delete`

**Magic Containers (Phase 5, shipped rc.10):**
- `bunny containers app list|create|delete`

**Edge Scripting (Phase 5, shipped rc.10):**
- `bunny scripting list|deploy|delete`

**Discovery & Config:**
- `bunny manifest [--pretty --names]` (--names rc.10+)
- `bunny mcp` — MCP stdio server
- `bunny use <alias>` — alias switching


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
