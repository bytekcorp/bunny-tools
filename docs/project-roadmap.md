# bunny-tools Project Roadmap

**Status:** Phase 1 Complete ✓  
**Current Version:** v0.1.0-alpha.0  
**Target GA:** v0.1.0 (week 7)  
**Last Updated:** 2026-05-02

---

## Executive Summary

bunny-tools v0.1 ships the complete Bunny.net CLI surface in 7 phases over 7 weeks, with internal alpha releases every week. Phase 1 (this sprint) delivers foundations: registry-driven CLI, HTTP client with rate-limit resilience, config system, and credential resolution. Users can dogfood deploy loop in week 2 (Phase 2 alpha.1).

**Slip gate:** If Phase 4 (DNS) extends >2 weeks, Phase 5 (Stream/Containers/Scripting) demotes to v0.2; Phase 7 ships 0.1.0 after Phase 4 + 6.

---

## Phase Breakdown

### Phase 1: Bootstrap & Foundations ✅ COMPLETE

**Duration:** 2–3 days (completed 2026-05-02)  
**Ships as:** (internal — no public release)  
**Status:** ✅ Complete

**Deliverables:**
- Registry-driven CLI architecture (`src/manifest/registry.ts`)
- HTTP client with 429/5xx retry + exponential backoff + Retry-After honor (`src/api/http.ts`)
- Config loaders: `bunny.json` + `.bunnyrc` (zod-validated)
- Credential resolver chain (flag → env → keychain → file → prompt)
- `bunny manifest` command (registry as JSON)
- Test suite: http, config, manifest layers (≥80% coverage)
- CI/CD: GitHub Actions (Node 20+22, ubuntu+macos)
- Generated artifacts: `manifest.json`, `AGENTS.md` skeleton, `schema/bunny.schema.json`

**Success Criteria Met:**
- ✅ `npm run build` → `dist/cli.js` executable
- ✅ `npm test` ≥80% coverage on api/config/manifest
- ✅ Cold-start <50ms (`bunny --help` ~22ms)
- ✅ `bunny manifest` outputs valid JSON
- ✅ Manifest.json/AGENTS.md/schema auto-generated; CI drift-check passes
- ✅ CI green on Node 20 + 22, ubuntu + macos
- ✅ No real network calls in tests (Nock enforced)
- ✅ Credentials never logged

**Tech Stack Locked:**
- Node 20+, TypeScript, Commander.js
- undici (HTTP), zod (validation), keytar (keychain)
- Vitest + Nock (testing)
- esbuild (bundling)

---

### Phase 2: Alpha 1 — Deploy Loop

**Duration:** 1 week (week 2)  
**Ships as:** v0.1.0-alpha.1  
**Priority:** P0 (highest)  
**Status:** 🔴 Pending

**Scope:**
- `bunny init` — interactive setup wizard
- `bunny configure` — global credential setup (like `aws configure`)
- `bunny auth set/list/clear` — credential management
- `bunny use <alias>` — alias switching
- `bunny deploy` — storage sync + CDN purge (the money command)
- `bunny purge` — standalone cache purge by URL/tag/zone

**Core Components:**
- `src/core/deploy.ts` — business logic (walk, diff, upload pool, purge)
- `src/core/state.ts` — `.bunny-state.json` cache (optional warm-run optimization)
- Command implementations (6 commands, all active)
- Expanded tests for deploy loop (Nock-mocked)

**Validation:**
- User can `bunny init && bunny configure && bunny deploy` on fresh machine in <5 min
- Warm deploy <3s (after first run)
- Dry-run matches actual upload
- 429 backoff + retry tested
- Tag-based purge, full purge, per-URL purge all work

**Success Criteria:**
- ✅ `bunny deploy --dry-run` shows plan without side effects
- ✅ `bunny deploy` idempotent on unchanged files
- ✅ Warm run <3s (measured locally)
- ✅ Credentials from configure used by deploy
- ✅ 429 retried with backoff, succeeds
- ✅ Tests cover all paths (80%+ coverage extended)

**Risk:** Scope creep (init wizard complexity). Mitigation: hardcode sensible defaults; keep prompts to min.

---

### Phase 3: Alpha 2 — Storage & Zones

**Duration:** 1 week (week 3)  
**Ships as:** v0.1.0-alpha.2  
**Priority:** P1  
**Status:** 🔴 Pending

**Scope:**
- `bunny storage:upload/download/list/delete/sync` (5 commands)
- `bunny storage-zone:list/get/create/update/delete` (5 commands)
- `bunny pull-zone:list/get/create/update/delete` (5 commands)
- `bunny pull-zone:edge-rule:list/add/delete` (3 commands)

**Core Components:**
- `src/core/storage.ts` — zone-aware uploads/downloads + regional endpoint selection
- `src/core/zones.ts` — storage-zone + pull-zone CRUD, ETag caching
- Command implementations (18 commands, all active)
- Comprehensive CRUD tests

**Validation:**
- All 18 commands callable; `--help --json` valid for each
- Storage upload to multiple zones works
- Pull zone creation + edge rule CRUD functional
- Zone metadata cached to warm future calls

**Success Criteria:**
- ✅ All 18 commands implemented + tested (≥80% coverage)
- ✅ No manual edge cases ignored (error handling comprehensive)
- ✅ `bunny storage-zone:list` paginated correctly (page=1, perPage=1000)

---

### Phase 4: Alpha 3 — DNS

**Duration:** 1 week (week 4, slip gate trigger)  
**Ships as:** v0.1.0-alpha.3  
**Priority:** P1  
**Status:** 🔴 Pending

**Scope:**
- `bunny dns:list/get/create/delete` (4 commands)
- `bunny dns:record:list/add/update/delete` (4 commands)

**Core Components:**
- `src/core/dns.ts` — DNS zone + record CRUD
- Command implementations (8 commands, all active)
- Tests for DNS operations

**Validation:**
- All 8 commands callable
- Record create/update/delete idempotent
- TTL handling correct

**Slip Gate Decision:**
- **On time or early:** Proceed to Phase 5 as planned
- **>2 weeks elapsed:** Demote Phase 5 (Stream/Containers/Scripting) to v0.2; promote Phase 6 (MCP + docs) + Phase 7 (GA) to ship v0.1.0 after Phase 4 complete

**Rationale:** Deploy loop + storage + DNS cover 80% of user workflows. Stream/containers are nice-to-have; don't let them block GA.

---

### Phase 5: Alpha 4 — Stream / Containers / Scripting

**Duration:** 1 week (week 5, may demote to v0.2)  
**Ships as:** v0.1.0-alpha.4 OR deferred  
**Priority:** P2 (demotable)  
**Status:** 🔴 Pending

**Scope (if Phase 4 on time):**
- `bunny stream:library:list/create/delete` (3 commands)
- `bunny stream:video:list/upload/delete` (3 commands)
- `bunny containers:list/create/deploy/delete` (4 commands)
- `bunny scripting:list/deploy/delete` (3 commands)

**Core Components:**
- `src/core/stream.ts` — Stream library + video CRUD
- `src/core/containers.ts` — Magic Containers CRUD
- `src/core/scripting.ts` — Edge scripting CRUD
- 13 command implementations

**Validation:**
- All commands callable + tested
- Video upload works (multipart would be nice but not required; single PUT sufficient)

**Note:** If Phase 4 slipped >2 weeks, this phase defers to v0.2. v0.1.0 ships without it.

---

### Phase 6: MCP Server & AI-Discovery Polish

**Duration:** 1 week (week 6)  
**Ships as:** v0.1.0-rc.1  
**Priority:** P1 (or P2 if P5 demoted)  
**Status:** 🔴 Pending

**Scope:**
- `bunny mcp` — stdio server (MCP protocol)
- MCP tools mapping (all active commands → tools)
- MCP resources: `manifest`, `agents`, `config/current`
- AGENTS.md handcurated polish (quickstart, workflows, gotchas, MCP setup)
- Docs: system-architecture, code-standards, codebase-summary

**Core Components:**
- `src/mcp/server.ts` — stdio transport, JSON-RPC 2.0
- `src/mcp/tools/` — tool implementations (wrap core functions)
- `src/mcp/resources/` — read-only resources
- Final AGENTS.md + docs polish

**Validation:**
- `bunny mcp` boots, responds to tool calls
- `bunny manifest` JSON matches MCP tool list
- All tools accessible via Claude Code with `claude mcp add`
- AGENTS.md human-curated sections (quickstart, workflows) present + helpful

**Success Criteria:**
- ✅ MCP server registered in Claude Code
- ✅ Docs complete + accurate
- ✅ RC1 ready for beta testing

---

### Phase 7: GitHub Action & v0.1.0 GA Release

**Duration:** 1 week (week 7)  
**Ships as:** v0.1.0 (stable)  
**Priority:** P0  
**Status:** 🔴 Pending

**Scope:**
- Composite GitHub Action (`bytekcorp/bunny-tools-deploy-action@v1`)
- npm publish: `bunny-tools@0.1.0`
- Floating tag: `v1` points to `v0.1.0`
- Public documentation (README polish)

**Action Deliverable:**
```yaml
- uses: bytekcorp/bunny-tools-deploy-action@v1
  with:
    version: 0.1.0
    account-key: ${{ secrets.BUNNY_ACCOUNT_KEY }}
    storage-password: ${{ secrets.BUNNY_STORAGE_PASSWORD }}
```

**Release Artifacts:**
- npm package: `bunny-tools@0.1.0`
- GH Releases page: tarball, CHANGELOG
- Action: `v1` tag (floating, updates minor/patch)

**Validation:**
- Action runs in CI; deploys successfully
- npm install globally works
- README examples work
- No security issues in dependencies

**Success Criteria:**
- ✅ npm package public + installable
- ✅ Action published + discoverable in GitHub Marketplace
- ✅ CI/CD complete + green
- ✅ Changelog complete + links work
- ✅ Docs links all valid

---

## Timeline

```
Week 1 (May 2–8)      Phase 1: Bootstrap & Foundations       ✅ COMPLETE
                      → v0.1.0-alpha.0 internal

Week 2 (May 9–15)     Phase 2: Deploy Loop                   🔴 Pending
                      → v0.1.0-alpha.1 release

Week 3 (May 16–22)    Phase 3: Storage & Zones               🔴 Pending
                      → v0.1.0-alpha.2 release

Week 4 (May 23–29)    Phase 4: DNS (SLIP GATE)               🔴 Pending
                      → v0.1.0-alpha.3 release
                      
                      DECISION POINT:
                      On time? → continue Phase 5
                      >2w late? → skip Phase 5, go to Phase 6

Week 5 (May 30–Jun 5) Phase 5: Stream/Containers (optional)  🔴 Pending/Deferred
                      → v0.1.0-alpha.4 release (if on track)

Week 6 (Jun 6–12)     Phase 6: MCP + Docs Polish             🔴 Pending
                      → v0.1.0-rc.1 release

Week 7 (Jun 13–19)    Phase 7: Action + GA                   🔴 Pending
                      → v0.1.0 STABLE release
```

---

## Metrics & Success

### Per-Phase Success Criteria

| Phase | Deliverable | Metric |
|-------|-------------|--------|
| 1 ✅ | Foundations | Cold-start <50ms, ≥80% coverage, CI green |
| 2 | Deploy loop | `bunny deploy` <5 min setup, warm run <3s |
| 3 | Storage CRUD | All 18 commands callable, paginated correctly |
| 4 | DNS CRUD | All 8 commands callable, idempotent |
| 5 (opt) | Stream/Containers | All 13 commands callable |
| 6 | MCP + Docs | MCP server boots, docs complete |
| 7 | GA Release | npm installable, action published, green CI |

### Release Criteria

**Per alpha:**
- ✅ All commands for phase callable
- ✅ All tests passing (80%+ coverage)
- ✅ CI green (Node 20+22)
- ✅ No unresolved TODOs in code
- ✅ Version bumped

**v0.1.0 GA:**
- ✅ All phases 1–4 complete (5 optional, 6 required)
- ✅ npm @0.1.0 published
- ✅ GH Action v1 published
- ✅ Docs complete (README, architecture, code standards)
- ✅ Security audit passed (no secrets in repo, keychain optional)
- ✅ Performance targets met (cold-start <50ms, warm deploy <3s)

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Bunny API changes mid-phase | Low | Medium | Weekly API check; vendor API responses in tests |
| Rate limit (429) tuning | Medium | Low | Default concurrency 8; document tuning; configurable |
| keytar native build fails | Medium | Low | Graceful fallback to file; wrap in try/catch |
| npm name `bunny-tools` taken | Medium | High | Verify before phase 2 publish; fallback `@bytekcorp/bunny-tools` |
| Slip gate triggers; scope grows | High | High | **Strict phase gating:** no phase starts until prior ships. Phase 5 explicitly demotable. |
| GH Action marketplace approval | Low | Low | Composite action (no build pipeline); pre-approve with GH Team |

---

## Future (v0.2+)

**Explicitly deferred:**
- **Edge rule sugar** (`headers`, `rewrites`, `redirects` in bunny.json) — needs edge-rule sync
- **Live emulator** — Nock mock sufficient
- **Plugin system** — revisit at 100+ commands
- **Telemetry** — no plans
- **HTTP/SSE MCP transport** — stdio sufficient for v0.1; consider HTTP in v0.2
- **Multipart upload** — single PUT covers <100MB; revisit if real demand

**Nice-to-haves (if time allows in v0.1):**
- Warm-run state caching (`.bunny-state.json` hash-based skip)
- Per-region metadata caching
- GH Action caching (actions/setup-node + npm cache)

---

## Ownership

| Phase | Lead | Status |
|-------|------|--------|
| 1 | chien | ✅ Complete |
| 2 | (TBD) | 🔴 Pending |
| 3 | (TBD) | 🔴 Pending |
| 4 | (TBD) | 🔴 Pending (SLIP GATE) |
| 5 | (TBD) | 🔴 Pending (demotable) |
| 6 | chien | 🔴 Pending |
| 7 | chien | 🔴 Pending |

---

## Key Decisions Locked In

✅ **Architecture:** Registry-driven CLI + core + api layers  
✅ **Tech Stack:** Node 20+, TS, Commander, undici, zod, keytar  
✅ **Auth Model:** Honest 4-key; explicit credential scope per call  
✅ **Pagination:** Always page=1, perPage=1000 (avoid Bunny footgun)  
✅ **Retry:** 429/5xx exponential backoff + Retry-After honor, max 5 attempts  
✅ **Release cadence:** Internal alphas weekly; GA in week 7  
✅ **v0.1 Scope:** Full REST surface (phases 1–4 required; 5 demotable)  
✅ **CI:** GitHub Actions matrix (Node 20+22, ubuntu+macos)  
✅ **Testing:** Vitest + Nock; no live e2e  

---

## References

- **PDR:** `docs/project-overview-pdr.md`
- **Architecture:** `docs/system-architecture.md`
- **Code Standards:** `docs/code-standards.md`
- **Codebase Summary:** `docs/codebase-summary.md`
- **Phase 1 Plan:** `plans/260502-1748-bunny-tools-cli/phase-01-bootstrap-foundations.md`
- **Design Brainstorm:** `plans/reports/brainstorm-summary-260502-1748-bunny-tools-cli-design.md`
