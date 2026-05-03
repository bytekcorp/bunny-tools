---
type: brainstorm-summary
date: 2026-05-03
slug: cdn-storage-zone-rename
status: approved
target_version: 0.1.0-rc.17 → 0.1.0 GA
breaking: yes (pre-GA — acceptable)
---

# CDN + Storage Zone Rename — Design Summary

## Problem
Two command names misalign with how users mentally model bunny-tools:

1. **`pullzone`** — Bunny-specific jargon. The dashboard sidebar says **"CDN"** (everyone's term for this product class). New users coming from Cloudflare/Fastly know "CDN", not "pull zone."
2. **`storagezone`** as a top-level group artificially promotes admin-level CRUD to peer-level with file operations. The Bunny dashboard treats Storage as one section. Users want "storage things together" — not two parallel groups.

## Approved scope: full clean rename (Option C), pre-GA window

**No aliases retained.** Pre-GA is the right time to break — once 1.0 ships, breakage costs goodwill. Today the user base is small enough that ripping the band-aid is correct.

## Canonical rename mapping

### Pull Zone → CDN

| Before | After |
| --- | --- |
| `bunny pullzone list` | `bunny cdn list` |
| `bunny pullzone get <id>` | `bunny cdn get <id>` |
| `bunny pullzone create <name>` | `bunny cdn create <name>` |
| `bunny pullzone update <id>` | `bunny cdn update <id>` |
| `bunny pullzone delete <id>` | `bunny cdn delete <id>` |
| `bunny pullzone edgerule list <id>` | `bunny cdn edgerule list <id>` |
| `bunny pullzone edgerule add <id>` | `bunny cdn edgerule add <id>` |
| `bunny pullzone edgerule delete <id> <guid>` | `bunny cdn edgerule delete <id> <guid>` |

**Aliases dropped:** `pullzone`, `pull-zone`, `edge-rule`. New form only.

### Storage Zone → nested under storage

| Before | After |
| --- | --- |
| `bunny storagezone list` | `bunny storage zone list` |
| `bunny storagezone get <id\|name>` | `bunny storage zone get <id\|name>` |
| `bunny storagezone create <name>` | `bunny storage zone create <name>` |
| `bunny storagezone update <id>` | `bunny storage zone update <id>` |
| `bunny storagezone delete <id>` | `bunny storage zone delete <id>` |

File ops (`bunny storage upload/download/list/delete/sync`) unchanged. The `zone` subgroup nests under `storage` cleanly — matches `wrangler r2 bucket create` convention.

**Aliases dropped:** `storagezone`, `storage-zone`. New form only.

## MCP tool renames

| Before | After |
| --- | --- |
| `bunny.zones_list` | `bunny.storage_zones_list` |
| `bunny.zone_get` | `bunny.storage_zone_get` |
| `bunny.zone_create` | `bunny.storage_zone_create` |
| `bunny.zone_delete` | `bunny.storage_zone_delete` |

Pull-zone-side MCP tools (if any are explicit) get the `cdn` prefix on the same pattern.

## Group descriptions update

```
storage   — Storage product (file ops + zone management)
  └─ zone — Storage zone CRUD
cdn       — Bunny CDN (pull zones + edge rules)
  └─ edgerule — Edge rules subresource
```

## Files affected

### Code (~13 command paths in registry + 4-8 MCP tools)
- `src/manifest/registry.ts` — every renamed command spec + MCP `tool` keys
- No `src/cli.ts` change (registry-driven)
- No `src/core/*` change (internal — current names like `core/zones.ts` stay; public CLI is what's renamed)

### Tests
- `test/e2e/pull-zones.e2e.ts` → renamed to `test/e2e/cdn.e2e.ts`, content uses `cdn`
- `test/e2e/storage-zones.e2e.ts` → renamed to `test/e2e/storage-zone.e2e.ts`, content uses `storage zone`
- `test/e2e/edge-rules.e2e.ts` — content uses `cdn edgerule`
- `test/mcp/tools.test.ts` — MCP tool name assertions update
- `test/manifest/registry.test.ts` — any command-name assertions update

### Docs
- `README.md` — Pull Zones table → CDN table; Storage Zones section folded under Storage
- `AGENTS.md` — auto-regen
- `manifest.json` — auto-regen
- `schema/bunny.schema.json` — verify no impact (it's config schema, not command schema)
- `docs/codebase-summary.md`, `docs/system-architecture.md`, `docs/code-standards.md` — name refs
- `docs/e2e-testing.md` — service file names
- `docs/project-changelog.md` — add rc.17 entry calling out the breaking rename
- `action/README.md` — sweep for `pullzone`/`storagezone` references

### Plans (low-priority — keep historical)
- Existing rc.10/rc.12 plans + journals reference old names. Leave as historical record. Don't rewrite.

## Approaches considered

| Approach | Verdict |
| --- | --- |
| A — Aliases only, keep old canonicals | Rejected by user. Goodwill of clean surface > backward-compat for an alpha audience |
| B — Rename canonicals, keep old as aliases | Rejected by user. Aliases keep the legacy noise alive |
| **C — Clean rename, drop aliases** | **Approved.** Pre-GA window. Small user base. One disruption, no lingering ambiguity |
| D — Half-measures (rename pullzone but keep storagezone, or vice versa) | Rejected — we're paying the breaking-change cost; do it once |

## Risks

| Risk | Mitigation |
| --- | --- |
| Existing user scripts (rc.10–rc.16) break | Document the rename prominently in CHANGELOG. Pre-GA = expected. Provide a migration table |
| MCP-using AI agents have hardcoded tool names | MCP tool renames break. Mitigation: agents discover tools via `tools/list`, not hardcoded — most usage auto-adapts. Custom prompts referencing the old names need a one-line update |
| Drift between command name (`cdn`) and Bunny API endpoint (`/pullzone/*`) | Acceptable — internal mapping. Document in code-standards.md so contributors aren't confused |
| Test file renames break git blame for these files | Acceptable — pre-1.0, small history loss; `git log --follow` works fine |
| README will see significant churn | Already prepared for this — README has been rewritten 2x today; we know the patterns |

## Success criteria

1. `bunny pullzone *` and `bunny storagezone *` — both produce "unknown command" error after the change (clean break confirmed)
2. `bunny cdn list`, `bunny storage zone list` — both work and return real data
3. All 30 e2e tests still pass with renamed commands
4. AGENTS.md regenerated, drift-check green
5. README per-service tables show new names; legacy names absent
6. MCP tool names follow new structure; `tools/list` returns the new keys
7. `npm run gen:all` produces clean diff (just the renames)
8. Lint + typecheck + build clean
9. After publish to npm: `npm install -g bunny-tools@latest` → `bunny cdn list` works on a real account

## Effort estimate

- Registry edits + MCP renames: 30 min
- Test file renames + content: 30 min
- README + docs sweep: 45 min
- Live e2e verify: 5 min
- Build / publish: ~10 min
- **Total: ~2 hours**

## Implementation notes

- Single rc bump (`rc.16 → rc.17`) carrying the rename
- Document migration table prominently in changelog AND README's "What changed" section
- The 5 commits split:
  1. `feat!: rename pullzone → cdn` (registry + MCP + e2e file)
  2. `feat!: nest storagezone under storage` (registry + MCP + e2e file)
  3. `docs: README + docs sync for cdn/storage rename`
  4. `chore(release): 0.1.0-rc.17` (version + drift artifacts)

OR a single big commit with all of it. The user can pick.

## Out of scope for this brainstorm

- Bunny.json config field renames (`deploy.pullZones[]` array) — that's a config schema concern; if we're renaming, it'd be `deploy.cdnZones[]`. Worth doing in same window. Adds 15 min. Flag for follow-up question.
- Magic Containers / Stream / Scripting names — sidebar matches; no change needed
- Internal `src/core/zones.ts` filename — stays (private surface)

## Unresolved questions

1. Should `bunny.json`'s `deploy.pullZones[]` field also rename to `deploy.cdnZones[]`? Pre-GA = same window. Adds ~15 min.
2. What's the exact `cdn` group description for the help text? Suggest: `"Bunny CDN — pull zones, edge rules, configuration."`
