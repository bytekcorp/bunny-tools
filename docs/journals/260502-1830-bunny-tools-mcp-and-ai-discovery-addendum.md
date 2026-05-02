# MCP Server & AI-Discovery Scope Folded Into v0.1

**Date**: 2026-05-02 18:30
**Severity**: Medium (scope expansion, but doable)
**Component**: v0.1 Architecture & Roadmap
**Status**: Resolved

## What Happened

Post-brainstorm round-two. Three orthogonal requests hit in a single conversation:
1. Interactive UX like `aws configure` for first-time setup.
2. MCP server so Claude Desktop / Code / Cursor can invoke bunny-tools natively.
3. AI-readable discovery surface (manifest, schema, agent docs) so AI agents can use the CLI correctly without trial-and-error.

All three folded into v0.1 scope. No v0.2 deferrals. This triggered a non-trivial architectural shift — and a phase-count bump (Phase 6 inserted, old Phase 6 → Phase 7).

## The Brutal Truth

Initial reaction: "This is scope creep that could derail the timeline." But the deeper I dug, the architectural leverage was too good to ignore. Adding a `src/core/*` layer in Phase 1 costs ~3 days upfront but saves a painful retrofit in v0.2 when MCP demands it anyway. The business-logic → UI separation is *right*, and doing it now is cheap.

That said, the MCP surface (10 tools + escape hatch) forced a hard conversation: 1:1 mapping CLI commands to MCP tools is bloat and hurts Claude's tool-selection accuracy. Stopped at 10 + `bunny.run`. Not negotiable. The temptation to expose 40+ tools will surface in reviews — kill it early.

## Technical Details

**Architectural Shift**: Added `src/core/*` layer.

```
Before: src/commands/* → src/api/*
After:  src/commands/* → src/core/* → src/api/*
        src/mcp/tools/* → src/core/* → src/api/*
```

Lint boundary enforced: `src/commands/**` and `src/mcp/**` cannot import `src/api/**`. Forces all business logic into `src/core/*`.

**Single Source of Truth**: `src/manifest/registry.ts` declares every command (name, description, args as zod, examples, optional mcp.tool mapping). Drives:
- Commander tree
- `bunny manifest` JSON output
- `--help --json` on every command
- `AGENTS.md` command tree section
- `bunny.schema.json`
- MCP tool definitions

CI drift-check fails if any generated artifact stops matching the registry. (This alone prevents the hand-curated docs rot we've seen in other CLIs.)

**MCP Hard Limits** (locked):
- ~10 high-level tools (deploy, purge, storage list/upload/delete, zones list/get/create/delete, dns records/set/delete, manifest).
- 1 escape hatch: `bunny.run({args[], format?})` — any CLI subcommand, returns parsed output.
- 3 resources: `bunny://manifest`, `bunny://agents`, `bunny://config/current` (masked).
- Stdio only (no HTTP/SSE in v0.1).

Tool selection accuracy matters. 40 tools = Claude drifts to tool-call errors. 10 + escape hatch = tight, accurate, power-user compatible.

**New v0.1 Commands**:
- `bunny configure` — interactive walkthrough (account key → storage zones → pull zones → auth method). AWS-style.
- `bunny configure --non-interactive --account-key=... --storage-zone=... --storage-password=...` — CI variant.
- `bunny manifest [--pretty]` — dumps registry as JSON. AI clients hydrate from this.
- `bunny mcp` — stdio MCP server. Boots in <300ms.
- `bunny <any-cmd> --help --json` — structured help on every command.

**Phase Reorganization**:
- Phase 6 (new): MCP server + `AGENTS.md` final polish. Releases as `0.1.0-rc.1`.
- Phase 7 (was Phase 6): GitHub Action + npm publish + schema to unpkg + final `0.1.0` GA.

Slip gate: if Phase 4 (deploy loop) trends >2 weeks, demote Phase 5 (rest of CRUD). Phases 6 + 7 still ship on time.

## What We Tried

1. **Defer MCP to v0.2** — Rejected. MCP changes the shape of auth (server boots once, caches creds) and error handling (no process.exit from tools). Retrofitting breaks the code organization.

2. **Auto-generate MCP tools 1:1 from CLI commands** — Rejected. Bloats tool list to 40+. Claude's tool-selection accuracy tanks. Tested mentally against real usage: most AI workflows need ~10 verbs.

3. **Sibling package (`@bytekcorp/bunny-tools-mcp`)** — Rejected. Over-engineered, maintenance burden, ecosystem fragmentation. Built-in subcommand wins.

4. **Hand-curate `AGENTS.md` from scratch** — Rejected. Will drift. Auto-generate from registry (with hand-curated prose in marked sections), CI drift-check enforces it.

## Root Cause Analysis

Why did this land in round-two and not round-one?

1. **Round-one brainstorm scope was "daily-loop CLI"** — auth + deploy + purge. That's a shipped tool. Didn't ask "how do AI agents use this?"

2. **User brought fresh perspective** — "easy first-time UX" (aws configure), "MCP server" (AI integration), "AI-discovery surface" (structured manifest). Three orthogonal asks revealed a missing concern: *the CLI itself is now a public API that AI agents call*.

3. **Architectural consequence wasn't obvious until articulated** — Once you have both CLI commands AND MCP tools, they must share business logic. That forces a middle layer. Not doing it in Phase 1 means painful extraction in v0.2.

The lesson: ask "who calls this?" not just "what does this do?" In this case, humans use the CLI, AI agents use the MCP server, and both call the same business logic underneath.

## Lessons Learned

1. **Separation of concerns in Phase 1 pays for itself** — Adding `src/core/*` costs ~3 days now. Retrofitting it in v0.2 costs 1-2 weeks (rewriting tests, moving code, resolving circular imports). Do the boring architecture early.

2. **Single source of truth for public surface** — A registry that drives CLI + docs + MCP definitions + schema + drift-check is non-negotiable. Hand-curated docs rot. Generated + marked sections for prose = best balance.

3. **Tool surface design is about accuracy, not coverage** — 40 tools = Claude fails to pick the right one 30% of the time. 10 + escape hatch = accurate selection, power users unblocked. This applies to any LLM tool integration, not just MCP.

4. **`aws configure` UX exists for a reason** — `bunny init` (per-project) and `bunny configure` (global) serve different needs. Don't merge them. Users expect both.

5. **MCP server != just an HTTP wrapper around the CLI** — Stdio server has different error handling, credential lifecycle, and resource-discovery semantics. It's not a thin layer; it's a proper architectural layer.

## Next Steps

1. **Phase 1 implementation** — Start with `src/core/*` skeleton, registry, manifest plumbing, generators. This unblocks everything downstream.

2. **Phase 2** — Implement `bunny configure` + routes all commands through `src/core/*`. High-visibility UX change; dogfood immediately.

3. **Phase 6 (new) scheduling** — If Phase 4 or 5 slip >1 week, assess whether Phase 6 should compress to `0.1.0-beta.1` (MCP unstable, docs lighter). Final GA gate stays at Phase 7.

4. **Lint rule + CI check** — ESLint rule `src/commands/**` ∌ `src/api/**` imports. Add to pre-commit or GH Actions before Phase 2.

5. **MCP SDK version** — Pin `@modelcontextprotocol/sdk` to exact version in `package.json` + monthly review for security patches. Isolate in `src/mcp/` for swap-ability.

6. **Manual smoke-test target** — Phase 6 acceptance includes: Claude Code with `bunny-tools` MCP server installed, calling `bunny.deploy({dry_run: true})` against a real `bunny.json`, getting back structured results. Not just happy-path; test credential masking on `bunny://config/current` resource.

7. **Revisit `bunny configure` auto-trigger** — Current decision: no auto-trigger on first run (surprising in CI). Explicit invocation only. Re-evaluate after internal dogfooding (week 2).

---

**Artifacts**:
- Addendum source: `plans/reports/brainstorm-summary-260502-1748-bunny-tools-cli-design.md` §14
- Updated plan structure: `plans/260502-1748-bunny-tools-cli/` (now 7 phases)
- New phase file: `plans/260502-1748-bunny-tools-cli/phase-06-mcp-server.md`
- Renamed: `plans/260502-1748-bunny-tools-cli/phase-07-github-action-release.md`

**Open Items**:
- Exact version of `@modelcontextprotocol/sdk` to pin (defer to Phase 6 implementation).
- Which Claude clients to manually smoke-test against (Claude Code primary; Desktop + Cursor optional based on dogfooding feedback).
- Whether `bunny configure` should prompt for missing global creds on `bunny init` if none detected (current: no; revisit after week 1 dogfooding).
