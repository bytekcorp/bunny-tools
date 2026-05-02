---
phase: 6
title: "MCP Server & AI-Discovery Surface Polish"
status: pending
priority: P1
effort: "4-6d"
dependencies: [5]
---

# Phase 6: MCP Server & AI-Discovery Surface Polish

## Overview

Add `bunny mcp` subcommand — a stdio MCP server exposing ~10 high-level tools backed by the same `src/core/*` modules the CLI uses. Finalize AI-discovery surface (`AGENTS.md`, `bunny manifest`, `--help --json`) — the registry-driven scaffolding lands in phase 1, but final polish, examples, and end-to-end Claude/Cursor integration testing happens here. Releasable as `0.1.0-rc.1` (release candidate before GA).

## Context Links

- Brainstorm addendum (post-2026-05-02-1830 round) in `plans/reports/brainstorm-summary-260502-1748-bunny-tools-cli-design.md` §14+
- MCP spec: https://modelcontextprotocol.io
- `@modelcontextprotocol/sdk` (TypeScript)

## Requirements

**Functional**
- `bunny mcp` boots an MCP stdio server. `--http` flag deferred to v0.2 (stdio is sufficient for Claude Desktop / Claude Code / Cursor / continue.dev).
- Tools (~10 high-level + 1 escape hatch):
  - `bunny.deploy({only?, purge?, dry_run?, concurrency?})` — full deploy.
  - `bunny.purge({target: url|tag:|pull-zone:|all})` — standalone purge.
  - `bunny.storage_list({path, zone?, recursive?})`, `bunny.storage_upload({local, remote, zone?})`, `bunny.storage_delete({path, zone?, recursive?})`.
  - `bunny.zones_list({type: storage|pull})`, `bunny.zone_get({type, id_or_name})`, `bunny.zone_create({type, ...})`, `bunny.zone_delete({type, id})`.
  - `bunny.dns_records({zone})`, `bunny.dns_record_set({zone, type, name, value, ...})`, `bunny.dns_record_delete({zone, record_id})`.
  - `bunny.manifest()` — returns full registry JSON.
  - `bunny.run({args[], format?: "json"|"text"})` — escape hatch: shells out to CLI, returns parsed output.
- Resources:
  - `bunny://manifest` — registry JSON.
  - `bunny://agents` — `AGENTS.md` content.
  - `bunny://config/current` — masked current credentials/aliases (so AI can introspect what's set without leaking secrets).
- Tool docs derived from `src/manifest/registry.ts` (single source of truth).
- All tools return structured JSON; never print to stdout (which is the MCP transport).
- Auth resolution identical to CLI (env → keychain → file). Server fails fast with actionable error if account key missing.
- Polish AI-discovery surface from phase 1 scaffolding:
  - `AGENTS.md` — finalized with curated examples, gotchas, MCP install snippet (`claude mcp add bunny-tools npx -y bunny-tools mcp`).
  - `bunny manifest` JSON validated against an internal schema; CI verifies it stays in sync.
  - `--help --json` covers every command including `mcp`.

**Non-functional**
- MCP server cold-start <300ms.
- Zero `console.log` from server code (all output through MCP framing or stderr).
- Tool descriptions <500 chars each; argument schemas valid JSON Schema draft 7.
- Smoke-tested with Claude Code (manual) before tagging.

## Architecture

```
src/mcp/
├── server.ts            → stdio bootstrap, server lifecycle
├── tools/
│   ├── deploy.ts
│   ├── purge.ts
│   ├── storage.ts
│   ├── zones.ts
│   ├── dns.ts
│   ├── manifest.ts
│   └── run.ts           → escape hatch
├── resources.ts         → manifest, agents.md, current-config
└── tool-registry.ts     → reads src/manifest/registry → MCP tool defs

# Each MCP tool calls into src/core/* — no CLI plumbing in MCP path.
```

**Why a thin wrapper, not a fat one**
- `src/core/*` is shared. CLI commands and MCP tools both call it. No duplicated logic.
- `bunny.run` is the escape hatch for advanced/uncommon commands without bloating the tool list.

## Related Code Files

**Create**
- `src/mcp/server.ts`, `src/mcp/tool-registry.ts`, `src/mcp/resources.ts`
- `src/mcp/tools/{deploy,purge,storage,zones,dns,manifest,run}.ts`
- `src/commands/mcp.ts` — CLI entry that boots the server
- `test/mcp/{server,tools}.test.ts`
- Final hand-curated `AGENTS.md` polish (extend the auto-generated draft from phase 1)

**Modify**
- `src/cli.ts` — register `bunny mcp` command.
- `src/manifest/registry.ts` — add `mcp.tool` field per command (which MCP tool exposes it, if any).
- `package.json` — add `@modelcontextprotocol/sdk` dep.
- `README.md` — MCP install + Claude Code/Desktop snippets.
- `docs/system-architecture.md` — show MCP layer.

## File Ownership

`src/mcp/**`, `src/commands/mcp.ts`, `test/mcp/**`. Extends `src/cli.ts`, `src/manifest/registry.ts`, `package.json`, `README.md`, `docs/system-architecture.md`, `AGENTS.md`.

## Implementation Steps

1. Add `@modelcontextprotocol/sdk` dep; pin to a stable version.
2. `src/mcp/server.ts` — boot stdio server using SDK; register tools + resources from registry.
3. `src/mcp/tool-registry.ts` — map each registry entry's `mcp.tool` field to an SDK tool definition; auto-generate JSON Schema for args from zod.
4. `src/mcp/tools/*.ts` — each one is ~20 lines: parse args (zod), call `src/core/*`, return result.
5. `src/mcp/resources.ts` — three resources: manifest, agents (read AGENTS.md), current-config (mask secrets).
6. `src/commands/mcp.ts` — Commander entry: `bunny mcp [--http]` (HTTP mode throws "v0.2").
7. End-to-end manual smoke: `claude mcp add bunny-tools npx -y bunny-tools mcp` → ask Claude to list zones → confirm tool call works.
8. Tests:
   - Unit: each tool's argument validation + happy-path call into mocked core.
   - Integration: spawn `bunny mcp` as subprocess, send JSON-RPC `tools/list`, `tools/call deploy`, `resources/read bunny://manifest`. Use `@modelcontextprotocol/sdk` test client.
   - Resource read returns valid JSON / valid markdown.
9. Finalize `AGENTS.md`:
   - Top: 1-paragraph "what bunny-tools does + how to use it as an AI"
   - Workflows: 5 canonical recipes (deploy, configure, purge by tag, list+create zone, dns record).
   - Command tree (auto-injected from registry).
   - MCP install snippet for Claude Code, Claude Desktop, Cursor, continue.dev.
   - Gotchas (regional storage, 4-key auth, page=0 footgun, Cache-Tag origin requirement).
10. CI step: regenerate manifest + AGENTS.md + JSON Schema; fail if checked-in versions drift.

## Success Criteria

- [ ] `bunny mcp` boots <300ms; passes `tools/list` + `resources/list` round-trip in test client.
- [ ] Manual: Claude Code with `bunny-tools` MCP server installed can run `bunny.deploy({dry_run: true})` against a real bunny.json and report results back.
- [ ] All 10 tools covered by tests; each has at least one validation-failure case (zod rejects bad args before any HTTP).
- [ ] No CLI logic duplicated in `src/mcp/`; every tool body fits in <30 lines.
- [ ] `AGENTS.md` < 500 lines, sections in registry's canonical order.
- [ ] CI fails if `manifest.json`, `AGENTS.md`, or `bunny.schema.json` drift from registry.
- [ ] `bunny://config/current` resource never returns plaintext credentials (keys masked).
- [ ] Releases as `0.1.0-rc.1`.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| MCP SDK breaking changes | Pin exact version; isolate in `src/mcp/`; smoke-test on every dep bump. |
| Tool surface bloats LLM context | Cap at 10 tools + 1 escape hatch. Periodic review against actual usage. |
| Auth fails silently inside MCP server | Server logs to stderr (not stdout — would break transport); CLI wrapper inspects stderr on failure. |
| Resource exposure leaks secrets | `current-config` resource hand-tested against credential masking unit test. Refuse to start if secret-handling unit test fails. |
| MCP tool naming collides with future Bunny APIs | Namespace under `bunny.*`; reserve `bunny.run` as escape hatch. |
| Hand-curated `AGENTS.md` drifts from reality | Auto-generated `## Command Tree` section; CI diff-check on the generated portion. |

## Code Review Checklist

- [ ] No `console.log` anywhere in `src/mcp/`.
- [ ] Every tool calls into `src/core/*`; no direct API calls in MCP layer.
- [ ] Argument schemas are zod-derived JSON Schema; tools reject malformed input.
- [ ] `bunny://config/current` masks all secret values (assertion in test).
- [ ] `bunny.run` validates `args[]` shape (no shell injection — args[] is passed to Commander, never to `sh -c`).
- [ ] Resources are read-only; no MCP tool exposes credential write.

## Docs Updates

- `AGENTS.md` (final, not auto-only).
- `README.md` — MCP section: install snippets per client, tool list, escape-hatch example.
- `docs/system-architecture.md` — diagram showing CLI / MCP both calling into `src/core/*`.
- `docs/codebase-summary.md` — `src/mcp/` overview.
- `docs/code-standards.md` — "no console.log in mcp/", "no api/* import outside core".

## Next Steps

→ Phase 7 (GitHub Action & 0.1.0 Release): final polish, schema publish, GA tag.
