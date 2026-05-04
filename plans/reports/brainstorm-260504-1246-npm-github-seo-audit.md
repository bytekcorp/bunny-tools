# Brainstorm — npm + GitHub SEO Audit (v0.1.2)

Date: 2026-05-04
Outcome: Ship v0.1.2 patch — description + keywords + README hero + GH topics.

## Problem
v0.1.1 ranks #1 on niche terms (`bunny cli`, `bunny deploy`, `mcp bunny`) but is invisible for the canonical brand search `bunny.net` (top 5 = `bunny.net`, `@bunny.net/cli`, `@seshuk/...`, `bunny-sdk`, `@bunny.net/cli-linux-arm64`). Also #3 for `bunny cdn` behind two stale packages.

## Findings (live npm registry data)

| Term | Rank | Score | Verdict |
|---|---|---|---|
| `bunny` | #1 | 87.2 | own |
| `bunny cli` | #1 | 87.2 | own |
| `bunny deploy` | #1 | 90.2 | own |
| `mcp bunny` | #1 | 96.9 | own |
| `bunny cdn` | #3 | 94.2 | climb to #1 |
| `bunny.net` | not top 5 | — | unreachable #1 (org-name priority); aim for top 5 |
| `bunnycdn cli` | not top 5 | — | climb to top 3 |

## Competitor reality check
`@bunny.net/cli` v0.4.0 IS official Bunny.net CLI. Scope: Databases, Magic Containers, Edge Scripts only. Same binary name (`bunny`). bunny-tools is broader (Storage, CDN, DNS, Stream, Edge Scripting) + has MCP. "The CLI Bunny.net never shipped" tagline is now technically false — must drop.

## Decided fixes

### 1. package.json description
- Old: `Bunny.net CLI for storage deploy, CDN purge, and full resource management. AI-friendly via MCP.`
- New: `Bunny.net CLI + MCP server. Deploy static sites to Bunny Storage and purge CDN with one command. Manage Storage, Pull Zones, DNS, Stream, Edge Scripting from a single binary — plus AI-native MCP for Claude Code & Claude Desktop.`
- Why: front-load Bunny.net twice, claim MCP niche, list surface explicitly for keyword density.

### 2. Keywords (15 → 22)
Add: `bunny.net`, `static-site`, `static-deploy`, `cdn-purge`, `nodejs`, `typescript`, `firebase-deploy`.
Keep all existing 15.
Why: capture brand-with-dot search, capture intent terms (static-site, firebase-deploy), generic infra (nodejs, typescript).

### 3. README hero rewrite
- Drop: "The CLI Bunny.net never shipped" — false claim now.
- New: lead with "Broad-surface Bunny.net CLI + MCP server", explicit scope list, `firebase deploy` parallel.
- Add "Related" section after install pointing at `@bunny.net/cli` for honesty + cross-seeded SEO.

### 4. GitHub topics (11 → 16)
Add: `static-site-generator`, `nodejs`, `typescript`, `bunny.net`, `firebase-alternative`.
Why: cross-pollinate with npm keywords, capture firebase-alternative intent.

## Skipped (not worth it)
- Package rename (`bunny-cli`/`bunnycdn-cli`) — too costly post-GA, breaks installs, marginal SEO gain.
- Awesome-list submission — premature; do once weekly downloads >50.
- HN/Product Hunt — premature; needs at least one external user adopting first.

## Success metrics
- 24h post-publish: bunny-tools appears in top 5 for `bunny.net` query.
- 7d post-publish: rank improves for `bunny cdn` (currently #3).
- No regression for already-#1 terms.

## Unresolved questions
- Binary name `bunny` collides with `@bunny.net/cli`. Out of scope for SEO patch but worth tracking. Mitigation: most users only install one. v0.2 may add `--bin-name` install option.
