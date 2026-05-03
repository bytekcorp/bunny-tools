# bunny-tools Project Roadmap

**Status:** Phases 1–7 Complete ✓ | v0.1.0-rc.13 Live | E2E Drift-Detection Harness Live ✓
**Current Version:** v0.1.0-rc.13 (shipped 2026-05-03)  
**Install:** `npm i -g bunny-tools` (latest) or `@alpha` (same as latest)
**Next Gate:** v0.1.0 GA (first scheduled e2e-nightly cron run tomorrow ~03:00 UTC)
**Last Updated:** 2026-05-03

---

## Executive Summary

bunny-tools v0.1.0-rc.13 ships all 49 commands live on npm (latest & alpha dist-tags). Phases 1–7 complete. Two breaking changes shipped (rc.7: space-delimited syntax; rc.9: auth → configure with multi-account profiles). Phase 5 commands shipped rc.10 (stream, containers, scripting). 

**New in rc.12:** Six bug fixes (storage subdir 404, bare-arg crash, edge rule endpoint, scripting deploy --id re-fetch, stream library delete command, storagezone --region normalization). Containers app create demoted to `planned` (Bunny v3 schema mismatch → v0.2).

**New in rc.13:** Vitest security bump (2.x → 4.x; GHSA-67mh-4wv8-2f99 esbuild CORS fix). E2E drift-detection harness live (30 real-API tests, 8 services, nightly CI at .github/workflows/e2e-nightly.yml, first run ~03:00 UTC tomorrow). All unit tests pass (122), e2e tests cover storage, pull zones, DNS, stream, scripting, deploy.

**Next gate:** v0.1.0 GA release (all phases + e2e harness live). GA gate: first scheduled e2e-nightly cron run. Current backlog for v0.2: containers app create, headers/rewrites/redirects sugar, live e2e emulator.

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
**Status:** ✅ Complete (2026-05-02)

**Scope:**
- `bunny init` — unified interactive bootstrap (auth + feature multi-select + project config)
- `bunny auth set/list/clear` — low-level credential management
- `bunny use <alias>` — alias switching
- `bunny deploy` — storage sync + CDN purge (the money command)
- `bunny purge` — standalone cache purge by URL/tag/zone

**Core Components:**
- `src/core/deploy.ts` — business logic (walk, diff, upload pool, purge)
- `src/core/state.ts` — `.bunny-state.json` cache (optional warm-run optimization)
- Command implementations (6 commands, all active)
- Expanded tests for deploy loop (Nock-mocked)

**Validation:**
- User can `bunny init && bunny deploy` on fresh machine in <5 min
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
**Status:** ✅ Complete (2026-05-02)

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
**Status:** ✅ Complete (2026-05-02)  
**Slip Gate Decision:** On time! Phase 5 proceeds to v0.2 (no delay).

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

**Duration:** 1 week (week 5)  
**Ships as:** v0.1.0-rc.10 (un-deferred)  
**Priority:** P2 (was demotable, now shipped)  
**Status:** ✅ COMPLETE (shipped rc.10; rc.12 fix: containers app create demoted to `planned`)

**Scope (shipped rc.10):**
- `bunny stream library list|create|get|delete` (4 commands — get/delete added rc.10)
- `bunny stream video list|upload|delete` (3 commands)
- `bunny scripting list|deploy|delete` (3 commands)
- `bunny containers app list|create|delete` (3 commands; `create` demoted rc.12 → v0.2 due to Bunny v3 schema mismatch)

**Changes in rc.12:**
- Containers app create moved to `planned` (Bunny v3 API schema incompatibility; defer to v0.2)
- Stream library delete command added (was missing in rc.10)
- All other Phase 5 commands remain active and functional

**Rationale:** Deploy loop (P2) + storage (P3) + DNS (P4) cover 80% of user workflows; adding Stream + Scripting (P5) covers remaining use cases without blocking GA. Containers create deferred due to Bunny v3 compatibility issue detected in rc.12.

**v0.2 Roadmap (Tentative):**
- Containers app create (schema fix pending Bunny v3 update)
- Headers/rewrites/redirects sugar in bunny.json
- Live e2e emulator (optional, for development)
- Possible HTTP MCP transport (for CLI integration via web)

---

### Phase 6: MCP Server & AI-Discovery Polish

**Duration:** 1 week (week 6)  
**Ships as:** v0.1.0-rc.1  
**Priority:** P1  
**Status:** ✅ Complete (2026-05-02)

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
**Status:** ✅ Complete (2026-05-02)

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

## RC Progression (rc.2 through rc.13)

Post-Phase-7, 12 release candidates shipped to npm (latest & alpha dist-tags) via OIDC trusted publishing.

| RC | Date | Key Changes | Breaking? |
|----|----|---|---|
| rc.2 | 2026-05-02 | Unified init (firebase-style feature picker). Manual OTP publish. | — |
| rc.3 | 2026-05-02 | Init simplification; removed `configure` (briefly). | Yes |
| rc.4/5 | — | Tombstones (OIDC setup, never published). | — |
| rc.6 | 2026-05-02 | First OIDC publish. repository.url, bin path fixes. | — |
| rc.7 | 2026-05-02 | **Wrangler-style space-delimited** `pullzone edgerule add`. Global `-c/--cwd/-e/-p` flags. `whoami`, `docs`, `init [dir]`. | **Yes** (colon → space) |
| rc.8 | 2026-05-02 | Wrangler wins follow-up. Global `-p/--profile` multi-account prep. | — |
| rc.9 | 2026-05-03 | **Multi-account profiles.** `configure` restored (profile-aware). `auth` removed. Auto-migration rc.8→rc.9. | **Yes** (auth → configure) |
| rc.10 | 2026-05-03 | UX polish. Zone auto-defaults (H1). Group descriptions (H3). Hyphen aliases (H4). Error detail (M4). `--names` flag. **Phase 5 shipped** (stream, containers, scripting). | — |
| rc.11 | 2026-05-03 | Internal-only. Transient version during rc.12 fix work; never tagged or published. | — |
| rc.12 | 2026-05-03 | **Six bug fixes:** storage subdir 404 (joinPath trailing slash), bare-arg crash (cli.ts positional slice), edge rule subresource endpoint, scripting deploy --id re-fetch post-204, stream library delete command, storagezone --region uppercases. Containers app create demoted to `planned` (Bunny v3 schema mismatch → v0.2). | — |
| rc.13 | 2026-05-03 | **Vitest security bump (2.x → 4.x)** GHSA-67mh-4wv8-2f99 esbuild dev-server CORS fix. **E2E drift-detection harness live** (8 services, 30 tests, real Bunny, nightly CI). Repository flipped PUBLIC. | — |

**Install:** `npm i -g bunny-tools` (latest) or `npm i -g bunny-tools@alpha` (same as latest)

---

## Timeline (Phases Completed 2026-05-02; RCs through 2026-05-03)

```
Week 1 (May 2–8)      Phase 1: Bootstrap & Foundations       ✅ COMPLETE
                      → v0.1.0-alpha.0 internal

Week 2 (May 9–15)     Phase 2: Deploy Loop                   ✅ COMPLETE
                      → v0.1.0-alpha.1 release (SHIPPED)

Week 3 (May 16–22)    Phase 3: Storage & Zones               ✅ COMPLETE
                      → v0.1.0-alpha.2 release (SHIPPED)

Week 4 (May 23–29)    Phase 4: DNS (SLIP GATE)               ✅ COMPLETE
                      → v0.1.0-alpha.3 release (SHIPPED)
                      
                      DECISION: Phase 4 on time!
                      Phase 5 defers to v0.2 (preemptive scope cut)

Week 5 (May 30–Jun 5) Phase 5: Stream/Containers (deferred)  📦 → v0.2
                      (no v0.1.0-alpha.4 release)

Week 6 (Jun 6–12)     Phase 6: MCP + Docs Polish             ✅ COMPLETE
                      → v0.1.0-rc.1 release (SHIPPED)

Week 7 (Jun 13–19)    Phase 7: Action + GA                   ✅ COMPLETE
                      → v0.1.0 STABLE release (SHIPPED 2026-05-02)

---

**ACCELERATED TIMELINE:** All 7 phases shipped in 1 week (2026-05-02).
Phases 2–4, 6–7 completed. Phase 5 deferred to v0.2.
```

---

## Metrics & Success

### Per-Phase Success Criteria

| Phase | Deliverable | Metric |
|-------|-------------|--------|
| 1 ✅ | Foundations | Cold-start <50ms, ≥80% coverage, CI green |
| 2 ✅ | Deploy loop | `bunny deploy` <5 min setup, warm run <3s |
| 3 ✅ | Storage CRUD | All 18 commands callable, paginated correctly |
| 4 ✅ | DNS CRUD | All 8 commands callable, idempotent |
| 5 ✅ | Stream/Scripting | All 10 active commands callable (containers create → v0.2) |
| 6 ✅ | MCP + Docs | MCP server boots, docs complete |
| 7 ✅ | GA Release | npm installable, action published, green CI |

### Release Criteria

**Per alpha:**
- ✅ All commands for phase callable
- ✅ All tests passing (80%+ coverage)
- ✅ CI green (Node 20+22)
- ✅ No unresolved TODOs in code
- ✅ Version bumped

**v0.1.0 GA (gate: first e2e-nightly cron run):**
- ✅ All phases 1–7 complete
- ⏳ E2E drift-detection harness first run (~03:00 UTC tomorrow)
- ⏳ No regressions detected in 30 e2e tests
- 📋 Pre-GA: npm @0.1.0 publishing (OIDC ready)
- 📋 Pre-GA: GH Action v1 published
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

## v0.2 Roadmap (Post-GA)

**Priority features deferred from v0.1:**
- **Stream library + video CRUD** (13 commands)
- **Magic Containers CRUD** (4 commands)
- **Edge scripting CRUD** (3 commands)
- **Headers/rewrites/redirects sugar** (`headers`, `rewrites`, `redirects` in bunny.json)
- **HTTP/SSE MCP transport** (CLI integration via web; stdio sufficient for v0.1)
- **Live e2e harness** (Nock coverage sufficient for v0.1)
- **Warm-run state caching** (`.bunny-state.json` hash-based optimization)

**Out of scope (maybe never):**
- Plugin system (revisit at 100+ commands)
- Telemetry (no plans)
- Multipart upload (single PUT covers <100MB cleanly)

---

## Ownership

| Phase | Lead | Status |
|-------|------|--------|
| 1 | chien | ✅ Complete |
| 2 | chien | ✅ Complete |
| 3 | chien | ✅ Complete |
| 4 | chien | ✅ Complete (SLIP GATE: on time!) |
| 5 | — | 📦 Deferred to v0.2 |
| 6 | chien | ✅ Complete |
| 7 | chien | ✅ Complete (GA shipped) |

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
