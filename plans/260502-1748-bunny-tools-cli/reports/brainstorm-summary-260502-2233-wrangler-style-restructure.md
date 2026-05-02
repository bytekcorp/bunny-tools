# Wrangler-style Restructure — Brainstorm Summary

**Date:** 2026-05-02 22:33
**Trigger:** User asked to clone wrangler's CLI structure.
**Status:** Design approved; ready for direct implementation in `0.1.0-rc.7` (hard break from rc.6).

**Source research:** `plans/260502-1748-bunny-tools-cli/reports/researcher-260502-2233-wrangler-cli-comparison.md`

---

## 1. Problem

User wants bunny-tools' CLI surface to feel closer to `wrangler`. Currently we use firebase-style colon-delimited subcommands (`bunny storage:upload`); wrangler uses space-delimited (`wrangler r2 bucket create`).

I pushed back hard — the "clone exactly" framing is wrong because (1) different problem domain, (2) Bunny has no OAuth, (3) third design pivot in three sessions. User picked the big restructure anyway.

## 2. Approved scope (overruling my recommendation)

**Two changes in one release (`0.1.0-rc.7`):**
1. Switch colon → space subcommands. Hard break from rc.6.
2. Add 6 wrangler-inspired patterns (`whoami`, `docs`, `-c/--cwd/-e` global flags, `init [dir]` positional).

## 3. Naming decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Top-level group hyphens | **Flatten** — `pullzone`, `storagezone` | More wrangler-exact; user explicit. |
| Sub-group hyphens | **Flatten** — `edgerule` | Consistency with top-level decision. |
| Three-level depth | **Keep** — `bunny pullzone edgerule add` | Commander.js handles natively. |
| Auth namespace | **Keep** — `bunny auth set/list/clear` | Already debated; `login` is misleading without OAuth. |
| Backwards compat | **Hard break** — colon form returns "unknown command" | rc.6 has effectively no users; no alias debt long-term. |

## 4. Final command tree (rc.7)

```
bunny init [dir]
bunny deploy [--dry-run --delete --concurrency=N --purge=... --only=... --json]
bunny purge <target>
bunny manifest [--pretty]
bunny mcp [--http]
bunny use <alias>
bunny auth set --scope=<...> --value=<...>
bunny auth list [--json]
bunny auth clear --scope=<...> [--yes]

bunny whoami                                      # NEW
bunny docs [topic]                                # NEW

bunny storage upload <local> <remote> --zone=...
bunny storage download <remote> <local> --zone=...
bunny storage list [path] --zone=... [--recursive --json]
bunny storage delete <path> --zone=... [--recursive --yes]
bunny storage sync <local> [remote] --zone=...

bunny storagezone list [--json]
bunny storagezone get <idOrName>
bunny storagezone create <name> [--region --replicate --tier]
bunny storagezone update <id> --body='<json>'
bunny storagezone delete <id> [--yes]

bunny pullzone list [--json]
bunny pullzone get <id>
bunny pullzone create <name> --origin=<url>
bunny pullzone update <id> --body='<json>'
bunny pullzone delete <id> [--yes]
bunny pullzone edgerule list <pullZoneId> [--json]
bunny pullzone edgerule add <pullZoneId> --rule='<json>'
bunny pullzone edgerule delete <pullZoneId> <ruleGuid>

bunny dns list [--json]
bunny dns get <id>
bunny dns create <domain>
bunny dns delete <id> [--yes]
bunny dns record list <zoneId> [--type --json]
bunny dns record add <zoneId> <type> <name> <value> [--ttl --priority --weight --port --flags --tag]
bunny dns record update <zoneId> <recordId> --body='<json>'
bunny dns record delete <zoneId> <recordId> [--yes]

bunny stream library list [--json]
bunny stream library create <name> [--replicate]
bunny stream video list <library> [--collection --json]
bunny stream video upload <library> <file> [--title --collection]
bunny stream video delete <library> <video> [--yes]

bunny containers app list [--json]
bunny containers app create <name> [--image --region --port]
bunny containers app delete <id> [--yes]

bunny scripting list [--json]
bunny scripting deploy <name> --file=<path> [--id --type]
bunny scripting delete <id> [--yes]
```

**Global flags (apply to all commands):**
- `-c, --config <path>` — point at non-default `bunny.json` (NEW)
- `--cwd <dir>` — run as if from this dir (NEW)
- `-e, --env <alias>` — one-shot `.bunnyrc` alias select (NEW)
- `-h, --help` / `-v, --version` (existing)
- `--help-json` (existing — emit help as JSON)

## 5. Implementation plan

### 5.1 Registry restructure

Today the registry has flat `name: 'storage:upload'`. Refactor to space-delimited `name: 'storage upload'` and let `src/cli.ts` split + build nested Commander commands.

Algorithm in cli.ts:
```ts
for (const cmd of registry.commands) {
  const parts = cmd.name.split(' ');
  let parent = program;
  for (let i = 0; i < parts.length - 1; i++) {
    const groupName = parts[i];
    let group = parent.commands.find(c => c.name() === groupName);
    if (!group) group = parent.command(groupName).description(`${groupName} commands`);
    parent = group;
  }
  // parent.command(parts.last()).action(...)
}
```

Commander.js handles per-group `--help` automatically when nested.

### 5.2 New commands

- **`src/commands/whoami.ts`** — calls `core.auth.listScopes()`, lists Bunny zones via `getStorageZoneByName` probe, prints account context.
- **`src/commands/docs.ts`** — opens browser to `https://docs.bunny.net/<topic_slug>` (`open` on macOS, `xdg-open` on linux, `start` on Windows). Topic table for popular shortcuts (`deploy`, `pullzone`, `dns`, etc.); fallback uses topic as path.

### 5.3 Global flags

Add to `src/cli.ts` `program.option(...)` calls. Plumbed to:
- `--config` → overrides bunny-json.ts config search default
- `--cwd` → `process.chdir(value)` early in cli.ts
- `--env` → injected into `bunnyrc.ts` resolver as a one-shot override

### 5.4 Files affected

| Layer | Change |
|---|---|
| `src/manifest/registry.ts` | Rewrite all entry names from `:` to space form. Ripple update to all `load: () => import(...)` paths (filesystem unchanged). |
| `src/cli.ts` | Build nested Commander tree from space-split names. Add 3 global flags. Fix arg parsing for nested commands. |
| `src/commands/whoami.ts` | New file (~30 LOC). |
| `src/commands/docs.ts` | New file (~30 LOC). |
| `src/commands/init.ts` | Accept positional `[dir]` arg. |
| `src/core/init.ts` | Honor optional `cwd` from input. |
| `test/manifest/registry.test.ts` | Update assertions for new names. |
| `test/mcp/tools.test.ts` | Tool names unchanged (`bunny.deploy` etc.) — no MCP test changes. |
| `README.md` | Update all command examples. |
| `AGENTS.md` | Auto-regenerate. |
| `manifest.json` | Auto-regenerate. |
| `docs/codebase-summary.md` | Update file map. |
| `docs/code-standards.md` | Update colon→space convention. |
| `docs/project-changelog.md` | Add `[0.1.0-rc.7]` BREAKING entry. |

### 5.5 Test plan

- All existing 111 tests still pass after registry refactor.
- Add 2 tests for `whoami` (with mocked listScopes + zone listing).
- Add 1 test for `docs` (mocked `open` invocation, verifies URL).
- Add 1 test that confirms `bunny storage:upload` fails with "unknown command" (the hard break).
- Add 3 tests for global flags (`-c` switches config path, `--cwd` switches dir, `-e` overrides alias).

## 6. Risks

| Risk | Mitigation |
|---|---|
| Commander.js per-group help formatting not as clean as wrangler's | Test help output during refactor; tweak via `program.configureHelp()` if needed. |
| MCP tool descriptions reference `bunny <X>` examples that now use space syntax | Regenerate manifest; existing AGENTS.md handcurated section update at end. |
| `--cwd` interferes with config search (which walks up from cwd) | Apply `--cwd` BEFORE config load. Test explicitly. |
| `-e/--env` precedence vs `bunny use` (file-stored default) | Flag wins for that invocation; document. |
| User scripts/aliases broken by hard break | rc.6 has no real users; fine. Document in CHANGELOG. |

## 7. Success criteria

- 111 existing tests + ~7 new tests all pass.
- `bunny --help` shows top-level groups (init, deploy, purge, auth, use, storage, storagezone, pullzone, dns, stream, containers, scripting, manifest, mcp, whoami, docs).
- `bunny storage --help` shows just storage subtree.
- `bunny pullzone edgerule --help` shows just edgerule subtree.
- Old `bunny storage:upload` returns "unknown command".
- All MCP tools still function (tool names unchanged).
- `npm i -g bunny-tools@0.1.0-rc.7` ships clean via OIDC.

## 8. Brutal honesty (carryover)

- This is your call against my recommendation. I pushed back twice; you confirmed twice. Logging it: I think the marginal UX win is small relative to churn cost.
- That said — once it lands, it's done. No more design pivots before GA.
- Recommend tagging `v0.1.0` as **the next release after rc.7** if rc.7 dogfoods cleanly. No more rc bumps unless something breaks.

## 9. Resolved (this round)

- Big restructure approved.
- Hyphens flattened at all levels (`pullzone`, `storagezone`, `edgerule`).
- 3-level depth retained.
- `auth set/list/clear` retained (no `login`).
- Hard break vs colon form (no migration shim).
- All 6 small wrangler wins included.

## 10. Open Items

- Should `bunny docs` use `open` (npm package) or shell out to platform-specific opener? (Recommendation: shell out — zero dep.)
- `whoami` — show all scopes (account/storage/stream) or just account? (Recommendation: all, masked.)
