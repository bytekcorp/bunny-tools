---
type: brainstorm-summary
date: 2026-05-03
slug: readme-ai-quickstart
status: approved
target_file: README.md
target_version: 0.1.x patch (post rc.13)
---

# README — AI-Quickstart Section Design

## Problem
README leads with CLI commands. The "talk to Claude with the MCP server installed" workflow is a first-class capability but invisible to a first-time visitor on npmjs.com. Users with the MCP installed have no signal that they can drive bunny-tools by natural language until they discover it themselves.

## Approved design

**Add a new `## Quickstart for AI agents` section immediately after the existing CLI Quickstart.** Linear flow: CLI users see CLI first, AI users find theirs one screen down. Don't restructure existing content.

### Section content (~30 LOC)

```markdown
## Quickstart for AI agents

With the MCP server installed (see [Install](#install)), Claude Code and Claude Desktop can drive every command. Drop into any project and try:

| What you say | What happens |
|---|---|
| **"Use bunny-tools to set up CI/CD for this project"** | Runs `bunny init`, writes `.github/workflows/deploy.yml` using the official action, lists the secrets you need to add |
| **"Deploy this site to Bunny"** | Reads existing `bunny.json`, runs `bunny deploy` (with dry-run preview) |
| **"Purge the CDN cache for tag release-2026-04"** | Calls `bunny.purge` with `tag:release-2026-04` |
| **"Show me what's on my Bunny account"** | Calls `bunny.whoami` + reachable zone counts |
| **"Add an A record for www → 1.2.3.4 on my Bunny DNS zone for chien.do"** | Resolves zone id, calls `bunny.dns_record_add` |

For best results in a new project, drop a 2-line hint into your project's `CLAUDE.md`:

\`\`\`markdown
## Deploy
This project uses bunny-tools. Run `bunny init` for first-time setup, then `bunny deploy`.
\`\`\`

This anchors Claude to bunny-tools for that project's deploy work.
```

### Why these 5 prompts

- **CI/CD setup** — the headline use case driving the user's question; directly answers "how do I onboard"
- **Deploy** — the daily-driver
- **Purge** — second most common ops task
- **Whoami** — read-only safe demo; teaches that the MCP can introspect, not just mutate
- **DNS record add** — proves the surface goes deeper than deploy/purge; covers a different service tier

Each prompt works TODAY with current MCP wiring + reasonable project context. No aspirational examples.

## Approaches considered

| Approach | Verdict |
| --- | --- |
| Two-column "CLI vs AI" same-outcome table at top | Rejected — markdown table with prose cells renders badly on npmjs.com; dual maintenance |
| Inline "ask Claude" hints under every service section | Rejected — ~80 LOC bloat; same prompt patterns repeat |
| **New section after CLI Quickstart** | **Approved** — KISS; preserves existing structure; one place to maintain |
| 8-example version | Rejected — diminishing returns past 5; extra rows are minor variations |
| 3-examples + link to docs file | Rejected — adds navigation step for the most common ops |

## Implementation considerations

- **Single-file edit.** README.md only. No code, no tests, no version bump.
- **Drift risk.** The 5 prompts will outdate if MCP tool names change. Mitigation: tools are stable post-Phase 6; drift detection harness will catch tool-rename regressions before users do.
- **Don't replicate AGENTS.md.** AGENTS.md is for AI agents loading it as context. README is for humans on npmjs.com. Same prompts can appear in both with different framing — that's not duplication, it's audience-targeting.
- **No new docs file.** The 5 examples fit the README. If we later need 15+ examples, spin up `docs/agents-quickstart.md` then.
- **Republish required to update npmjs.com.** Fold into next functional release (`0.1.0` GA tomorrow, or a `0.1.1` patch).

## Risks

| Risk | Mitigation |
| --- | --- |
| Prompts overpromise (Claude doesn't pick bunny-tools without hint) | The CLAUDE.md snippet immediately below the table explicitly handles this |
| Markdown rendering on npmjs.com | Bold-in-cell + simple two-column shape verified to render cleanly there (current README uses the pattern) |
| README hits 800 LOC cap | Currently ~338, projected ~370. Plenty of headroom |
| Future MCP tool drift breaks examples | Drift detection nightly catches; doc fixes follow |

## Success criteria

1. README has new `## Quickstart for AI agents` section with exactly 5 prompts + CLAUDE.md snippet
2. Section sits between current `## Quickstart` and `## Setup & Auth`
3. Total README LOC stays under 400
4. No markdown rendering glitches when viewed on npmjs.com (verify after publish)
5. Each prompt is action-verifiable — a reader could copy-paste it into Claude and see the described outcome (assuming MCP installed + reasonable project state)

## Next steps

1. Edit README.md per the section template above
2. Verify `wc -l README.md` < 400
3. Commit `docs: add Quickstart for AI agents section to README`
4. Push to `origin/main`
5. Folds into next published version (0.1.0 GA or 0.1.1 patch — README change alone doesn't require a new rc)

## Unresolved questions

None — all three layout/scope decisions made via AskUserQuestion. Ready for direct implementation.
