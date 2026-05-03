---
type: brainstorm-summary
date: 2026-05-03
slug: readme-per-service-rewrite
status: approved
target_version: 0.1.0-rc.10 (no version bump)
target_file: README.md
---

# README Per-Service Rewrite — Design Summary

## Problem
npm landing page (README.md, 140 LOC) is stale. Renders unclear / wrong for users coming from npmjs.com.

**Concrete defects:**
1. **Wrong syntax everywhere.** Uses rc.2 colon form (`auth:set`, `storage:upload`, `pull-zone:edge-rule:list`). Real rc.10 syntax is space-delimited (`bunny configure`, `bunny storage upload`, `bunny pullzone edgerule list`).
2. **References dead commands.** `auth:set/list/clear` deleted in rc.9. Replaced by `bunny configure` family.
3. **Missing 11 commands.** Phase 5 (Stream / Magic Containers / Edge Scripting) un-deferred and shipped — README doesn't mention them.
4. **MCP undercount.** Says "~10 tools"; actual = 15 tools + 3 resources.
5. **Coarse single table.** "Commands at a glance" lumps Storage file ops + Storage zones + Pull zones into one row each. User cannot scan per-service.
6. **No multi-account profile section.** rc.9 brought AWS-style profiles; README is silent.
7. **Hyphen aliases undocumented.** rc.10 added `pull-zone`, `storage-zone`, `edge-rule` aliases. Users typing those forms won't find them.

## Approved Design

**Scope:** README.md only. `docs/*.md` and `AGENTS.md` left untouched (already accurate; AGENTS.md is registry-generated).

**Structure (~280 LOC, up from 140):**

| Section | Purpose |
| --- | --- |
| Header + Install + Quickstart | Keep, minor polish |
| `bunny init` walkthrough | Keep |
| **Setup & Auth** | NEW table: `init`, `configure`, `configure list/switch/remove`, `use`, `whoami`, `docs` |
| **Deploy & Purge** | NEW table: `deploy`, `purge` |
| **Storage (file ops)** | NEW table: `storage upload/download/list/delete/sync` |
| **Storage Zones** | NEW table: `storagezone list/get/create/update/delete` (alias note: `storage-zone`) |
| **Pull Zones (CDN)** | NEW table: `pullzone list/get/create/update/delete` + `pullzone edgerule list/add/delete` (aliases: `pull-zone`, `edge-rule`) |
| **DNS** | NEW table: `dns list/get/create/delete` + `dns record list/add/update/delete` |
| **Stream** | NEW table: `stream library list/create` + `stream video list/upload/delete` |
| **Magic Containers** | NEW table: `containers app list/create/delete` |
| **Edge Scripting** | NEW table: `scripting list/deploy/delete` |
| **Discovery & AI** | NEW table: `manifest --pretty`, `manifest --names` (rc.10 M5), `--help-json`, `mcp` |
| GitHub Action | Keep (8 lines) |
| MCP server | Fix "10" → "15 tools, 3 resources" |
| Configuration | Add multi-account profile subsection |
| Auth model | Note `BUNNY_PROFILE` env + profile-scoped keychain keys |
| Development | Keep |
| License | Keep |

**Table format:** 2 columns `Command | Description`. One example code block per service section under the table. No "key flags" or "example" columns (avoids horizontal scroll on npmjs.com).

**Phase 5 services (Stream / Containers / Scripting):** First-class sections, no "beta" callout. User decision — they're in the registry as `active`, treat them as such.

**Hyphen aliases:** Single line `> Alias: ...` blockquote under affected services, not a separate section.

## Approaches considered

| Approach | Verdict |
| --- | --- |
| Keep single "Commands at a glance" table, just fix syntax | Rejected — doesn't solve the per-service-clarity complaint |
| Per-service sections with 3-col tables (cmd + desc + flags) | Rejected — pushes to ~320 LOC, horizontal scroll on mobile npmjs view |
| Per-service sections with 4-col tables (cmd + desc + flags + example) | Rejected — ~360 LOC, dense, painful diffs |
| **Per-service sections with 2-col tables + one example block** | **Approved** — KISS, scannable, mobile-readable |
| Roll Phase 5 into combined "Other resources" table | Rejected — they're shipped, deserve equal treatment |

## Implementation considerations

- **Single file edit.** No code touched. No tests touched.
- **Drift risk.** Manual command list duplicates registry. Acceptable cost for a static README. If drift becomes a problem in v0.2, generate the README sections from `bunny manifest` (out of scope today).
- **No version bump needed.** README is not part of the published API surface — npm just shows latest.
- **Republish required to update npmjs.com.** README change → bump rc.11 OR fold into 0.1.0 GA. Recommendation: fold into GA (next published version) rather than burn an rc just for docs.

## Risks

- **Bigger maintenance footprint.** Per-service tables = more places to update on each new command. Mitigation: single `wc -l` check, plus drift-check on registry could be extended later.
- **Over-promising on Stream/Containers/Scripting.** No live verification. Mitigation: the existing limitation is documented in `docs/project-roadmap.md` and `docs/codebase-summary.md`. README does not need to flag this — npm users rarely read docs/, and the surface IS shipped.

## Success criteria

1. Every command listed in `bunny manifest --names` appears in README under its service section
2. Zero references to `auth:` family
3. Zero colon-syntax (`auth:set`, `pull-zone:edge-rule`) — only space + hyphen-alias forms
4. README under 320 LOC
5. MCP section says "15 tools, 3 resources"
6. Multi-account profile subsection present
7. `docs/codebase-summary.md` and `AGENTS.md` untouched (verify via git diff)

## Next steps
1. Write README rewrite (single-file edit)
2. Verify against `bunny manifest --names` output
3. Commit as `docs: rewrite README with per-service command tables`
4. Defer republish until 0.1.0 GA (do not burn rc.11 on docs)

## Unresolved questions
None.
