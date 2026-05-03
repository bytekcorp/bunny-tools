# Bunny CLI and MCP Server

> Bunny.net CLI for storage deploy, CDN purge, and full resource management. Ships with an MCP stdio server so AI agents (Claude Code, Claude Desktop) can drive every command.

[![CI](https://github.com/bytekcorp/bunny-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/bytekcorp/bunny-tools/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/bunny-tools/alpha.svg)](https://www.npmjs.com/package/bunny-tools)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Package name on npm:** `bunny-tools` &middot; **Binary:** `bunny`

## Install

### As a CLI

```bash
npm install -g bunny-tools@alpha
```

### As an MCP server (recommended for AI workflows)

For Claude Code:

```bash
claude mcp add bunny-tools npx -y bunny-tools mcp
```

For Claude Desktop, add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bunny-tools": {
      "command": "npx",
      "args": ["-y", "bunny-tools", "mcp"]
    }
  }
}
```

Once installed, any Claude session can use 15 high-level tools (`bunny.deploy`, `bunny.purge`, zone/dns CRUD) plus 3 resources (`bunny://manifest`, `bunny://agents`, `bunny://config/current`) without needing prior context. See [MCP server](#mcp-server-ai-integration) below for the full tool surface.

## Quickstart

```bash
bunny init                   # interactive: auth + feature picker + bunny.json
bunny deploy --dry-run       # preview
bunny deploy                 # storage sync + CDN purge
```

`bunny init` walks you through:

1. Bunny account API key (skipped if already in env or keychain)
2. Feature multi-select — Storage+CDN, DNS, Stream, Magic Containers, Edge Scripting
3. Per-feature config (e.g. for Storage+CDN: public dir, storage zone, password, pull zone, purge strategy)

Non-interactive form for CI:

```bash
bunny init --non-interactive --features=storage \
  --account-key=$BUNNY_ACCOUNT_KEY \
  --storage-zone=my-app \
  --storage-password=$BUNNY_STORAGE_PASSWORD \
  --pull-zone=12345
```

---

## Setup & Auth

| Command | Description |
| --- | --- |
| `bunny init` | Interactive setup — auth + feature picker + bunny.json |
| `bunny configure` | Walkthrough — store credentials in a named profile |
| `bunny configure list` | List all credential profiles + scopes (masked) |
| `bunny configure switch <name>` | Set the active profile |
| `bunny configure remove <name> [scope]` | Remove a profile, or a single scope inside one |
| `bunny use [alias]` | Switch active alias from `.bunnyrc` (or list aliases) |
| `bunny whoami` | Show current account context + reachable zone counts |
| `bunny docs [topic]` | Open Bunny.net docs in browser |

**Example**

```bash
bunny configure --profile=staging
bunny configure switch staging
```

## Deploy & Purge

| Command | Description |
| --- | --- |
| `bunny deploy` | Sync public dir to storage zone and purge CDN cache |
| `bunny purge <target>` | Purge by URL, `tag:<name>`, or `pullzone:<id>` |

**Example**

```bash
bunny deploy --dry-run
bunny purge tag:release-2026-05
```

## Storage (file operations)

| Command | Description |
| --- | --- |
| `bunny storage upload <local> <remote>` | Upload a single file to the active zone |
| `bunny storage download <remote> <local>` | Download a single file from a zone |
| `bunny storage list [path]` | List a storage-zone path |
| `bunny storage delete <path>` | Delete a file or path (use `--recursive` for dirs) |
| `bunny storage sync <local-dir>` | Mirror local dir to zone — SHA-cached diff, parallel upload |

**Example**

```bash
bunny storage sync ./dist --zone=my-app
```

## Storage Zones

| Command | Description |
| --- | --- |
| `bunny storagezone list` | List storage zones |
| `bunny storagezone get <id\|name>` | Get a storage zone |
| `bunny storagezone create <name>` | Create a storage zone |
| `bunny storagezone update <id> --body=<json>` | Update a storage zone (raw JSON body) |
| `bunny storagezone delete <id>` | Delete a storage zone |

> Hyphenated alias also works: `storage-zone`.

## Pull Zones (CDN)

| Command | Description |
| --- | --- |
| `bunny pullzone list` | List pull zones |
| `bunny pullzone get <id>` | Get a pull zone |
| `bunny pullzone create <name>` | Create a pull zone |
| `bunny pullzone update <id> --body=<json>` | Update a pull zone (raw JSON body) |
| `bunny pullzone delete <id>` | Delete a pull zone |
| `bunny pullzone edgerule list <id>` | List edge rules on a pull zone |
| `bunny pullzone edgerule add <id> --rule=<json>` | Add an edge rule (raw JSON rule) |
| `bunny pullzone edgerule delete <id> <rule-id>` | Delete an edge rule |

> Hyphenated aliases also work: `pull-zone`, `edge-rule`.

**Example**

```bash
bunny pullzone edgerule list 12345
```

## DNS

| Command | Description |
| --- | --- |
| `bunny dns list` | List DNS zones |
| `bunny dns get <id\|domain>` | Get a DNS zone |
| `bunny dns create <domain>` | Create a DNS zone |
| `bunny dns delete <id>` | Delete a DNS zone |
| `bunny dns record list <zone>` | List records on a zone |
| `bunny dns record add <zone> <type> <name> <value>` | Add a record (positional args) |
| `bunny dns record update <zone> <record-id> --body=<json>` | Update a record |
| `bunny dns record delete <zone> <record-id>` | Delete a record |

**Example**

```bash
bunny dns record add 783181 A www 1.2.3.4 --ttl=300
```

## Stream

| Command | Description |
| --- | --- |
| `bunny stream library list` | List Stream libraries |
| `bunny stream library create <name>` | Create a Stream library |
| `bunny stream library delete <id>` | Delete a Stream library |
| `bunny stream video list <library>` | List videos in a library |
| `bunny stream video upload <library> <file>` | Upload a video to a library |
| `bunny stream video delete <library> <video-id>` | Delete a video |

**Example**

```bash
bunny stream video upload 42 ./demo.mp4 --title="My demo"
```

## Magic Containers

| Command | Description |
| --- | --- |
| `bunny containers app list` | List container apps |
| `bunny containers app delete <id>` | Delete a container app |

> `containers app create` is deferred to v0.2 — Bunny's v3 schema requires `runtimeType` + `containerTemplates[]` + `autoScaling` which the current CLI surface doesn't yet model. Manage creation via the Bunny dashboard for now.

## Edge Scripting

| Command | Description |
| --- | --- |
| `bunny scripting list` | List edge scripts |
| `bunny scripting deploy <name> --code=<file>` | Create or update a script (dual-mode) |
| `bunny scripting delete <id>` | Delete a script |

**Example**

```bash
bunny scripting deploy my-router --code=./worker.js
```

## Discovery & AI

| Command | Description |
| --- | --- |
| `bunny manifest --pretty` | Full registry as JSON (machine-readable surface) |
| `bunny manifest --names` | One command name per line — handy for shell completion |
| `bunny <any-command> --help-json` | Help for any command as JSON |
| `bunny mcp` | Boot MCP stdio server (15 tools, 3 resources) |

See [`AGENTS.md`](./AGENTS.md) for AI-agent guidance.

---

## Global flags

Apply to any command:

| Flag | Effect |
| --- | --- |
| `-c, --config <path>` | Override `bunny.json` location |
| `--cwd <dir>` | Run as if launched from this directory |
| `-e, --env <alias>` | One-shot `.bunnyrc` alias |
| `-p, --profile <name>` | One-shot credential profile |

**Example**

```bash
bunny --profile=staging deploy
```

## Configuration

**`bunny.json`** (per-project, git-tracked):

```jsonc
{
  "$schema": "https://unpkg.com/bunny-tools/schema/bunny.schema.json",
  "deploy": {
    "publicDir": "dist",
    "ignore": ["bunny.json", ".bunnyrc", "**/.*", "**/node_modules/**"],
    "storageZone": "my-app",
    "region": "ny",
    "concurrency": 8,
    "pullZones": [{ "id": 12345, "purge": "all" }]
  }
}
```

**`.bunnyrc`** (per-developer aliases, gitignored):

```json
{
  "default": "prod",
  "aliases": {
    "prod":    { "storageZone": "my-app",     "pullZones": [12345] },
    "staging": { "storageZone": "my-app-stg", "pullZones": [12346] }
  }
}
```

**Multi-account profiles** (`~/.config/bunny-tools/credentials.json`):

```jsonc
{
  "active": "default",
  "profiles": {
    "default": { "account": "...", "storage:my-app": "..." },
    "staging": { "account": "...", "storage:my-app-stg": "..." }
  }
}
```

Switch the active profile with `bunny configure switch <name>`, or one-shot with `bunny --profile=<name> <cmd>` or `BUNNY_PROFILE=<name>`.

## Auth model

Four credential scopes (all use the `AccessKey` HTTP header):

- `account` — Account API key
- `storage:<zone>` — Storage zone password (per zone)
- `stream:<lib>` — Stream library API key (per library)
- `database:<name>` — Database access key

**Resolver chain (per call site):** `--flag` → scoped env (e.g. `BUNNY_STORAGE_PASSWORD_MY_APP`) → generic env (`BUNNY_STORAGE_PASSWORD`) → OS keychain (`<profile>:<scope>` keys) → `~/.config/bunny-tools/credentials.json` → interactive prompt.

## GitHub Action

```yaml
- uses: bytekcorp/bunny-tools-deploy-action@v1
  with:
    account-key: ${{ secrets.BUNNY_ACCOUNT_KEY }}
    storage-password: ${{ secrets.BUNNY_STORAGE_PASSWORD }}
```

See [`action/README.md`](./action/README.md) for full inputs.

## MCP server (AI integration)

Install steps are at the top under [Install → As an MCP server](#as-an-mcp-server-recommended-for-ai-workflows). Once configured, the server exposes:

**Tools (15):** `bunny.deploy`, `bunny.purge`, `bunny.init`, `bunny.manifest`, `bunny.whoami`, storage zone CRUD, pull zone CRUD, DNS zone + record CRUD, plus `bunny.run` as an escape hatch for any CLI invocation.

**Resources (3):**
- `bunny://manifest` — full command registry as JSON
- `bunny://agents` — AGENTS.md (workflows, gotchas, conventions for AI agents)
- `bunny://config/current` — resolved config from `bunny.json` + active alias

**Cross-project usage.** With the MCP server installed, drop a 2-line hint into any new project's `CLAUDE.md` to anchor Claude to bunny-tools for that project:

```markdown
## Deploy
This project uses bunny-tools. Run `bunny init` for first-time setup, then `bunny deploy`. See `bunny manifest --pretty` for the full command surface.
```

## Development

```bash
git clone https://github.com/bytekcorp/bunny-tools
cd bunny-tools
npm ci
npm test
npm run dev -- manifest --pretty
```

For end-to-end testing against a real Bunny account (drift detection), see [`docs/e2e-testing.md`](docs/e2e-testing.md).

## License

MIT — see [LICENSE](./LICENSE).
