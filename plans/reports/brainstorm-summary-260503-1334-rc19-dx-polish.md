---
type: brainstorm-summary
date: 2026-05-03
slug: rc19-dx-polish
status: approved
target_version: 0.1.0-rc.19 → 0.1.0 GA
---

# rc.19 — Four DX-polish wins before GA

## Goals
Bundle four small DX improvements into the last rc before 0.1.0 GA so the launch surface is as polished as possible. Each item is independent; together they materially improve first-run experience and ongoing usability.

## Approved scope

### 1. `bunny init` writes `AGENTS.md` deploy hint

**Problem:** After init, Claude/Cursor/Windsurf in future sessions don't know "this project uses bunny-tools." User has to spell it out every time.

**Solution:** After successful init (bunny.json written), append/create `AGENTS.md` with:

```markdown
## Deploy

This project uses bunny-tools. Run `bunny deploy` to push to Bunny.net storage and purge the CDN cache. See `bunny manifest --pretty` for the full command surface.
```

**Why AGENTS.md (not CLAUDE.md):** cross-tool standard (https://agents.md). Read by Claude Code 2.x+, growing tool ecosystem support. Cursor/Windsurf users benefit when they adopt the convention. Tools that don't read it ignore it harmlessly.

**Behaviour:**
- Idempotent: grep for `## Deploy.*bunny-tools` first; skip if present
- Append if file exists, create if not
- Opt-out: `--no-agents-md` flag (default behaviour: write)
- Interactive init also asks confirmation (default Y)

**Files:** `src/commands/init.ts`, `src/manifest/registry.ts` (new flag)

**LOC:** ~30

### 2. `bunny install mcp`

**Problem:** Users have to remember `claude mcp add bunny-tools npx -y bunny-tools mcp`. Onboarding friction.

**Solution:** New `install` group with `mcp` subcommand. Spawns the `claude mcp add` command for the user.

**Why `install` (not `mcp install`):** `bunny mcp` already boots the stdio server (existing claude_desktop_config invocation). Restructuring `mcp` to a group breaks every existing config in the wild. New `install` group is forward-friendly: future `bunny install action`, `bunny install ci` fit naturally.

**Behaviour:**
- `bunny install mcp` — runs `claude mcp add bunny-tools npx -y bunny-tools mcp`
- If `claude` CLI not on PATH: print install link + manual instructions for Cursor/Windsurf/etc.
- Print success message with verification step: `bunny install mcp && claude mcp list | grep bunny-tools`

**Cross-tool support:** v1 is Claude-only. Future flags `--cursor`, `--windsurf` land in 0.1.x patches once we know which clients matter most. Print prominent "for other tools, see docs/install-mcp.md" when claude CLI is missing.

**Files:** `src/commands/install/mcp.ts` (new), `src/manifest/registry.ts`, README, optionally `docs/install-mcp.md` for non-Claude tools

**LOC:** ~60

### 3. `bunny update` self-update

**Problem:** Users running rc.10 don't know they need to upgrade. Manual `npm install -g bunny-tools@latest` is friction.

**Solution:** New top-level command that runs the npm upgrade automatically.

**Behaviour:**
- Default: spawn `npm install -g bunny-tools@latest`
- Detect npx-mode (binary path inside `~/.npm/_npx/...`): print "you're using npx, no install — npx always pulls latest. Just rerun your command."
- On EACCES: print exact retry command (`sudo npm install -g bunny-tools@latest` OR `npm install -g --prefix=$HOME/.local bunny-tools@latest`)
- Show before/after version

**Edge cases NOT supported in v1:** pnpm/yarn-global, Homebrew. Document in error message that user should use the equivalent for their package manager.

**Files:** `src/commands/update.ts` (new), `src/manifest/registry.ts`

**LOC:** ~60

### 4. Wrangler-style help formatter

**Problem:** Commander's default help shows `Options:` first then `Commands:`. Wrangler's layout (COMMANDS first, GLOBAL FLAGS second, uppercase headings, grouped commands) is materially better for scanability — especially as the CLI surface grows.

**Solution:** Override `program.configureHelp({ formatHelp: customFormatter })` on the root program. Custom formatter:

- Title: `bunny — <description>`
- USAGE block
- COMMANDS section: grouped by workflow domain, blank line between groups, aligned descriptions
- GLOBAL FLAGS section: alphabetical, aligned descriptions
- Footer: `Run \`bunny <command> --help\` for more details.`

**Group order (by workflow/domain):**
1. Setup: init, configure, configure list/switch/remove, use, whoami, docs
2. Daily ops: deploy, purge
3. Storage: upload, download, list, delete, sync
4. Storage zones: list, get, create, update, delete
5. Pull zones (CDN): list, get, create, update, delete + edgerule list/add/delete
6. DNS: list, get, create, delete + record list/add/update/delete
7. Stream: library list/create/delete + video list/upload/delete
8. Scripting: list, deploy, delete
9. Discovery & AI: manifest, mcp, install mcp, update
10. (Magic Containers: list, delete — skipped from help by default since create is `planned`)

**No emoji.** Wrangler uses them; we don't.

**Subcommand help:**
- Group help (`bunny storage --help`): description + USAGE + COMMANDS (subcommands) + GLOBAL FLAGS
- Leaf help (`bunny storage upload --help`): description + USAGE (with args) + FLAGS (command-local) + GLOBAL FLAGS

**Behaviour preservation:**
- `--help-json` continues to work (separate code path)
- Default action (bare `bunny` → help on stdout) continues to work
- `NO_COLOR` env respected (no ANSI codes when set)

**Files:** `src/cli.ts` (configureHelp), `src/manifest/registry.ts` (group ordering metadata if needed)

**LOC:** ~80

## Total scope

| Task | LOC | Effort |
| --- | --- | --- |
| 1. AGENTS.md from init | 30 | 20 min |
| 2. `bunny install mcp` | 60 | 30 min |
| 3. `bunny update` | 60 | 30 min |
| 4. Wrangler-style help | 80 | 45 min |
| Tests + docs sweep + verify | 50 | 30 min |
| **Total** | **~280** | **~2.5 h** |

## Implementation order

1. **Help formatter first** — biggest visual change; everything else lands ON TOP of the better help layout. Easier to verify each new command's help output looks right.
2. **AGENTS.md** — extends init, no new commands.
3. **`install mcp`** — new command + new group.
4. **`update`** — new command, top-level.

Each can be verified with a unit test (formatHelp output snapshot, init AGENTS.md write, install spawn mock, update spawn mock) and a manual smoke (`bunny --help`, run init in a temp dir, `bunny install mcp` against a real Claude CLI, `bunny update` against the real npm).

## Tests

- `test/cli-help-format.test.ts` — snapshot the root `--help` output, verify section order + group structure
- `test/commands/install-mcp.test.ts` — mock spawn, assert command + args
- `test/commands/update.test.ts` — mock spawn + npx-detection logic
- `test/commands/init.test.ts` (extend) — assert AGENTS.md content after init in a tmpdir

## Risks

| Risk | Mitigation |
| --- | --- |
| Help format snapshot breaks on every new command | Snapshot is the EXPECTED format; updates are intentional. Lock down structure but allow content drift |
| `bunny install mcp` fails silently when `claude` not on PATH | Explicit detection + helpful error message; never silent |
| `bunny update` clobbers a user's pnpm-global install | Detect via `which bunny` path inspection; warn before running npm |
| AGENTS.md auto-write annoys users with curated AGENTS.md files | `--no-agents-md` opt-out + idempotency check |
| Help formatter renders weirdly on narrow terminals | Detect $COLUMNS; fall back to 2-line wrap on <80 cols |

## Success criteria

1. `bunny --help` matches the wrangler-style layout with COMMANDS first, GLOBAL FLAGS second, uppercase headings, grouped by domain
2. `bunny init` writes AGENTS.md with the deploy hint, idempotent on re-run
3. `bunny install mcp` runs `claude mcp add ...` end-to-end on a machine with Claude CLI; prints helpful message otherwise
4. `bunny update` upgrades to latest npm version OR prints the npx-mode hint OR prints an EACCES retry command
5. All 124 unit tests + 30 e2e tests still pass
6. New `test/cli-help-format.test.ts` locks down the help layout
7. README updated with new commands listed in the AI Quickstart and command-reference tables
8. AGENTS.md autoregen reflects new commands
9. rc.19 publishes successfully; promotes to `latest` cleanly
10. Bare `bunny` still prints help to stdout (rc.16 invariant preserved)

## Next steps

1. Write report (this file) ✓
2. Implement task 4 (help formatter) — sets the visual baseline
3. Implement task 1 (AGENTS.md from init)
4. Implement task 2 (install mcp)
5. Implement task 3 (update)
6. Tests + lint + typecheck + build
7. Bump rc.18 → rc.19, regen artifacts, commit, tag, push
8. Watch CI; promote to `latest` after npm propagation

## Unresolved questions

None — all four tasks fully spec'd and ordered.
