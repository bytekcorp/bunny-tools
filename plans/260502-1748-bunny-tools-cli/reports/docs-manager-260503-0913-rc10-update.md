# Documentation Update Summary: rc.10 Live Release

**Date:** 2026-05-03 09:13  
**Status:** COMPLETE  
**Scope:** Comprehensive doc refresh for rc.2 through rc.10 (9 RC releases; all phases complete)

---

## Per-Document Changes

### 1. **project-overview-pdr.md** (204 LOC → from 187)
- Updated version: `v0.1.0-rc.10` (live on npm @alpha)
- Changed status: alpha → RC pending GA gate
- Updated release cadence table: added rc.2–rc.10 progression with dates + key changes
- Expanded command taxonomy: now documents all 49 commands split by phase (setup, storage, zones, DNS, stream, containers, scripting)
- Updated success metrics: 117 tests passing, 49 active commands, all phases shipped
- Added RC release history: 9 RCs, 2 breaking changes (rc.7 space-delimited, rc.9 auth→configure)

### 2. **system-architecture.md** (519 LOC)
- Updated header: version rc.10, status line with live on npm @alpha
- Enhanced Registry section: documented new `groups` field with descriptions + hyphen aliases (rc.10)
- Expanded Layer 1 (CLI): documented space-delimited command syntax, group descriptions, global flags, hyphenated aliases
- Added Credentials section: documented multi-account profile structure (rc.9+), active profile selection, auto-migration from rc.8
- Enhanced Credential Resolver: 6-step chain (flag > scoped env > generic env > keychain > file > prompt) per active profile
- Command tree example: added realistic 3-level deep examples (pullzone edgerule add)

### 3. **code-standards.md** (928 → 575 LOC; trimmed 40%)
- Updated header: version rc.10, status line
- Expanded naming conventions: added space-delimited registry names vs kebab-case filesystem paths + hyphenated aliases (rc.10+)
- Reorganized into subsections: Command Registration (new), Space-Delimited Syntax (new), Group Descriptions (new), Hyphen Aliases (new)
- Added Zone Defaults section (H1, rc.10): resolveActiveZone() helper, precedence order, practical examples
- Consolidated verbose sections: trimmed logging examples, removed verbose code review checklist, collapsed testing/build/performance into summaries
- Removed bloat: cut 350+ LOC of redundant examples while preserving essential patterns

### 4. **codebase-summary.md** (536 LOC; updated)
- Updated metrics: 49 active commands (up from 38), 117 tests (up from 91), 20 test files (up from 16), ~4,200 LOC (up from 2,400)
- Expanded Phase 2: documented configure restore + list/switch/remove subcommands (rc.9), whoami/docs additions (rc.8)
- Updated Phase 5: documented stream library get/delete (rc.10), all 11 Phase 5 commands now shipped
- Enhanced registry section: 500+ LOC entry (rc.10), full phase breakdown, new groups field with metadata
- Updated test file count: now 20 files (includes stream, containers, scripting)

### 5. **project-changelog.md** (473 LOC; expanded)
- Added rc.10 entry: UX polish (zone defaults, group descriptions, hyphen aliases, error detail, --names flag)
- Added rc.9 entry: Multi-account profiles, configure restore, auth removal (breaking), auto-migration
- Added rc.8 entry: Wrangler follow-up (whoami, docs, -p/--profile prep)
- Added rc.7 entry: Space-delimited syntax (BREAKING), global flags, whoami, docs
- Added rc.6 entry: First OIDC publish, repository.url, bin path fixes
- Added rc.3, rc.2 entries: Firebase-style init simplification, unified auth
- Consolidated all breaking changes: rc.7 (colon→space), rc.9 (auth→configure)

### 6. **project-roadmap.md** (409 LOC; expanded)
- Updated header: phases 1–7 complete, rc.10 live, GA pending live integration tests
- Replaced old timeline with RC progression table: rc.2–rc.10, dates, breaking changes, key features
- Added RC Progression section: 9 RCs documented with feature matrix + breaking change flags
- Updated executive summary: removed weekly phase references; focused on post-Phase-7 RC churn + current GA gate
- Added install command: `npm i -g bunny-tools@alpha` for users

---

## Metrics

| Document | Before | After | Change | Notes |
|----------|--------|-------|--------|-------|
| project-overview-pdr.md | 187 LOC | 204 LOC | +17 | RC history + command taxonomy expansion |
| system-architecture.md | ~450 LOC | 519 LOC | +69 | Profiles, space-delimited, aliases, credential detail |
| code-standards.md | 928 LOC | 575 LOC | -353 | Aggressive trim while preserving patterns |
| codebase-summary.md | ~480 LOC | 536 LOC | +56 | Metrics, Phase 5 commands, registry detail |
| project-changelog.md | ~250 LOC | 473 LOC | +223 | rc.2–rc.10 full entries |
| project-roadmap.md | ~350 LOC | 409 LOC | +59 | RC progression table, GA gate note |
| **Total** | ~2,645 LOC | **2,716 LOC** | **+71** | Net growth; all files <800 LOC |

---

## Key Factual Updates Verified Against Codebase

- **49 active commands:** Confirmed via `grep -c "status: 'active'" src/manifest/registry.ts`
- **117 tests passing:** Verified from test run output
- **20 test files:** Confirmed via `find test -name "*.test.ts" | wc -l`
- **Space-delimited syntax (rc.7+):** Confirmed in src/cli.ts walker (parts split on whitespace)
- **Groups field with descriptions + aliases (rc.10):** Confirmed in src/manifest/registry.ts (groups array with name, description, aliases)
- **Multi-account profiles (rc.9+):** Confirmed in src/config/credential-resolver.ts (profiles object, active field)
- **resolveActiveZone helper (rc.10):** Confirmed in src/core/storage-ops.ts
- **Zone auto-defaults:** Confirmed in all storage command handlers
- **Hyphenated aliases:** Confirmed in src/cli.ts (Commander .alias() calls)
- **Error detail surfacing:** Confirmed in src/util/logger.ts + error formatting

---

## Consistency Checks Performed

1. **Version consistency:** All docs now reference v0.1.0-rc.10 (was mixed rc.1 + rc.10 before)
2. **Command counts:** All docs agree on 49 active commands (Phase 5 un-deferred)
3. **Breaking changes:** rc.7 (space-delimited) + rc.9 (auth→configure) consistently documented across overview + roadmap + changelog
4. **Feature ownership:** Each major feature (profiles, zone defaults, aliases, group descriptions) traced to exact RC where shipped
5. **Profile system:** Documented consistently across system-architecture (JSON shape), code-standards (resolver chain), and project-overview (active selection)
6. **File paths:** All kebab-case paths verified against actual filesystem (src/commands/pull-zone/edge-rule/add.ts, etc.)

---

## Inconsistencies Resolved

| Issue | Resolution |
|-------|-----------|
| rc.1 doc said Phase 5 "deferred to v0.2"; rc.10 shipped it | Updated all refs: Phase 5 shipped rc.10, no v0.2 deferral now |
| Version refs scattered (v0.1.0, 0.1.0-rc.1, rc.1) | Standardized on v0.1.0-rc.10 everywhere |
| Changelog had only rc.1 entry, missing rc.2–rc.9 | Added full rc.2–rc.10 entries with breaking change flags |
| Roadmap had old "7 phases 7 weeks" timeline | Replaced with RC progression table + GA gate info |
| Code standards doc was 928 LOC (over 800) | Trimmed to 575 LOC while preserving critical patterns |

---

## Doc Size Status

All canonical docs now <800 LOC per docs.maxLoc setting:

- code-standards.md: 575 LOC ✓
- codebase-summary.md: 536 LOC ✓
- system-architecture.md: 519 LOC ✓
- project-changelog.md: 473 LOC ✓
- project-roadmap.md: 409 LOC ✓
- project-overview-pdr.md: 204 LOC ✓

---

## Related Artifacts (Not Updated)

The following are historical snapshots and were NOT modified (correct behavior):
- `docs/journals/` — 4 existing journals left as-is (260502-1830, 260502-1944, 260502-1958, 260502-2039)
- `plans/260502-1748-bunny-tools-cli/reports/` — brainstorm summaries + researcher reports left as-is

New permanent docs are the 6 files in `/Users/chien/Desktop/bunny-tools/docs/` (above).

---

## Testing & Validation

- ✓ All 6 canonical docs regenerated from live rc.10 codebase state
- ✓ Spot-checked 15+ code references (file paths, command names, types) against src/ tree
- ✓ Verified all breaking change dates align with brainstorm/completion reports
- ✓ Cross-referenced command counts, test counts, LOC metrics against actual codebase
- ✓ No stale TODO markers or TBD sections left
- ✓ All links to docs/ are internal (no external https references to rc.1 docs)

---

## Unresolved Questions

None. All RC.2–RC.10 facts are either:
1. Directly observable in codebase (registry.ts, cli.ts, core modules)
2. Documented in brainstorm reports + journal entries (user-approved designs)
3. Verified by test run counts + file structure inspection

---

## Next Steps (For Maintainers)

1. **Live integration testing (GA gate):** Run against real Bunny account to validate all 49 commands end-to-end
2. **Patch backlog (v0.2):** Consider H2 init prefill, H5 configure pull-zone step, M1 origin positional (some already shipped rc.10)
3. **Docs sync cadence:** Plan to regenerate codebase-summary.md on next major version (track test count, command count, LOC)
4. **Breaking change notes:** Add migration guide to changelog when GA ships (auth→configure migration + space-delimited syntax)

---

**Files modified:** 6 canonical docs in `/Users/chien/Desktop/bunny-tools/docs/`  
**Total lines changed:** +71 (net growth; aggressive trim on code-standards balanced by expansions elsewhere)  
**Status:** Ready for review + merge
