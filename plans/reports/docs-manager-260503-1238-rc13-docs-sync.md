# Documentation Sync: rc.10 → rc.13

**Date:** 2026-05-03 12:38 UTC  
**Scope:** Synced 5 core docs files to reflect rc.13 state  
**Files Updated:** project-overview-pdr.md, codebase-summary.md, system-architecture.md, project-roadmap.md, project-changelog.md, code-standards.md  
**Files Untouched:** e2e-testing.md (hand-written, canonical), design-guidelines.md, deployment-guide.md, README.md (recently rewritten)

---

## Changes Made

### 1. project-overview-pdr.md
- **Status header:** Updated from rc.10 to rc.13; GA gate changed from "Live integration testing" to "First scheduled cron run of e2e-nightly tomorrow ~03:00 UTC"
- **Success metrics table:** Updated test count from 117 to 122 unit + 30 e2e; GA gate flipped from ⏳ to e2e-nightly indicator
- **Release Cadence section:** Expanded from rc.2–rc.10 to rc.2–rc.13; added rc.11 (internal-only note), rc.12 (6 bug fixes detail), rc.13 (vitest + e2e harness detail). Repository visibility noted as PUBLIC.

### 2. codebase-summary.md
- **Version & metrics header:** Updated to rc.13; test count now explicitly 122 unit + 30 e2e; added nightly CI reference in e2e description
- Tests section already accurate (had mentioned e2e harness correctly)

### 3. system-architecture.md
- **Version header:** Updated from rc.10 to rc.13; test count updated 117→122 unit + 30 e2e; status line clarified e2e harness live
- **Registry current state note:** Added Phase 5 status line (stream/scripting active, containers create deferred rc.12)
- **Testing Strategy section:** Added "(vitest 4.x)" to unit tests; clarified e2e harness as "live" with nightly schedule ~03:00 UTC; noted 8 e2e service files + fixture location
- **Current State section:** Expanded "Deferred to v0.2" to include containers app create reason (Bunny v3 schema mismatch)

### 4. project-roadmap.md
- **Status header:** Updated from rc.10 to rc.13; install instructions changed to prefer `npm i -g bunny-tools` (latest) over @alpha; GA gate now e2e-nightly cron run
- **Executive Summary:** Expanded with rc.12 & rc.13 changes (bug fixes, containers demote, vitest bump, e2e harness live, repo PUBLIC)
- **Phase 5 subsection:** Status flipped from "📦 DEFERRED to v0.2" to "✅ COMPLETE (shipped rc.10; rc.12 fix)"; added containers create demote detail; clarified which 10 Phase 5 commands are active
- **RC Progression table:** Expanded from rc.2–rc.10 to rc.2–rc.13; added rc.11 (internal note), rc.12 (bug fixes), rc.13 (vitest + e2e harness + repo PUBLIC)
- **Metrics table:** Updated Phase 5 description from "(opt)" to ✅; metrics now show "10 active" + "(containers create → v0.2)"
- **GA Criteria section:** Changed from "npm @0.1.0 published" to "⏳ E2E drift-detection harness first run (~03:00 UTC tomorrow)" as gate; other criteria remain

### 5. project-changelog.md
- **Added rc.13 section:** Details vitest 4.x security bump (GHSA-67mh-4wv8-2f99), e2e drift-harness live (30 tests, 8 services, nightly CI at .github/workflows/e2e-nightly.yml, issue-on-fail), repo PUBLIC
- **Added rc.12 section:** Details 6 bug fixes (storage subdir 404, bare-arg crash, edge rule endpoint, scripting deploy --id re-fetch, stream library delete added, storagezone --region normalization). Notes containers app create demotion to planned
- **Added rc.11 section:** One-line note: internal-only, never published
- **Preserved rc.10 and earlier:** All existing changelog entries unchanged

### 6. code-standards.md
- **Version header:** Updated from rc.10 to rc.13; added e2e harness and vitest 4.x to status line
- Rest of file unchanged (no code standards changes between rc.10–rc.13)

---

## Verification

All updates cross-referenced against:
- ✅ `package.json` version field: confirmed 0.1.0-rc.13
- ✅ `npm test` output: confirmed 122 unit tests passing
- ✅ Test directory structure: confirmed test/e2e/ exists with 8 .e2e.ts files + helpers
- ✅ `.github/workflows/e2e-nightly.yml` exists and scheduled ~03:00 UTC
- ✅ Active command count: confirmed 49 via registry scan
- ✅ README.md rewrite: confirmed recent title/MCP changes; left untouched per user guidance

---

## What Was Already Correct

- `docs/e2e-testing.md` — canonical hand-written doc; untouched
- `docs/system-architecture.md` (most of it) — testing strategy section already referenced e2e harness
- `docs/code-standards.md` — engineering rules unchanged; no code pattern changes rc.10→rc.13
- `docs/design-guidelines.md` — no changes needed
- `docs/deployment-guide.md` — no changes needed

---

## What Was Left As-Is

- `README.md` — recently rewritten per user instruction; not touched
- `AGENTS.md` — auto-generated from registry; no direct edit needed
- `manifest.json` — auto-generated; will sync on next `npm run build`
- `schema/bunny.schema.json` — auto-generated; will sync on next `npm run build`
- `.env.example`, `.github/*` (except e2e-nightly.yml reference) — unchanged

---

## Notes

**Repository visibility:** Flipped PUBLIC on 2026-05-03; updated in rc.13 release notes.

**E2E harness gate:** First scheduled cron run of e2e-nightly is tomorrow ~03:00 UTC. This is the final GA gate; no manual testing needed, CI will auto-verify.

**Vitest bump rationale:** Security patch GHSA-67mh-4wv8-2f99 (esbuild dev-server CORS vulnerability) reached bunny-tools via vitest's vite dependency. Bumped vitest 2.x → 4.x + @vitest/coverage-v8 to match. npm audit now clean.

**Containers app create demotion:** Detected during rc.12 QA that Bunny v3 API schema changed for containers create endpoint. Moved to `planned` status in rc.12; will revisit after Bunny publishes v3 schema docs.

---

## Summary

All 6 core docs synced from rc.10 to rc.13 state. Versions, test counts, command status, vitest version, e2e harness details, and release history now current. No fabricated content; all changes tied to verifiable code state and recent commits. Docs ready for GA.

**Status:** DONE
