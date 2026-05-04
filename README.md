# bunny-tools

> Broad-surface Bunny.net CLI + MCP server. 60 commands across Storage, CDN, DNS, Stream, and Edge Scripting - drive them from your shell or from any AI agent (Claude Code, Claude Desktop). If you've used `firebase deploy`, `bunny deploy` will feel familiar - one command for static-site upload + CDN purge.

[![npm](https://img.shields.io/npm/v/bunny-tools.svg)](https://www.npmjs.com/package/bunny-tools)
[![npm downloads](https://img.shields.io/npm/dm/bunny-tools.svg)](https://www.npmjs.com/package/bunny-tools)
[![CI](https://github.com/bytekcorp/bunny-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/bytekcorp/bunny-tools/actions/workflows/ci.yml)
[![e2e nightly](https://github.com/bytekcorp/bunny-tools/actions/workflows/e2e-nightly.yml/badge.svg)](https://github.com/bytekcorp/bunny-tools/actions/workflows/e2e-nightly.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Package:** `bunny-tools` &middot; **Binary:** `bunny` &middot; **Node:** ≥20

## Why bunny-tools

Bunny.net's official CLI ([`@bunny.net/cli`](https://www.npmjs.com/package/@bunny.net/cli)) covers Databases, Magic Containers, and Edge Scripts. bunny-tools is the broader surface - Storage, CDN, DNS, Stream, Edge Scripting - for teams that mostly need static-site deploy + CDN management. One binary replaces a folder of curl scripts and stale dashboard tabs:

- **`bunny deploy` for static sites.** Familiar ergonomics if you've used `firebase deploy` - walk public dir → SHA-cached diff → parallel upload → CDN purge, in one command.
- **`bunny.json` is your single source of truth.** Versioned in git. Every command honors it. JSON Schema published at `unpkg.com/bunny-tools/schema/bunny.schema.json`.
- **AI-native via MCP.** AI agents see the same surface you do - no separate plugin per agent. `bunny install mcp` registers it with Claude Code in one shot.
- **Verified end-to-end.** 185 unit tests + nightly drift detection against a real Bunny account. We catch Bunny API changes before they break your deploys.

## Install

### As a CLI

```bash
npm install -g bunny-tools
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
2. Feature multi-select - Storage+CDN, DNS, Stream, Magic Containers, Edge Scripting
3. Per-feature config (e.g. for Storage+CDN: public dir, storage zone, password, pull zone, purge strategy)

Non-interactive form for CI:

```bash
bunny init --non-interactive --features=storage \
  --api-key=$BUNNY_API_KEY \
  --storage-zone=my-app \
  --storage-password=$BUNNY_STORAGE_PASSWORD \
  --pull-zone=12345
```

Add `--ci` to also generate `.github/workflows/bunny-deploy.yml` for GitHub Actions.

## Quickstart for AI agents

With the MCP server installed (see [Install](#install)), Claude Code and Claude Desktop can drive every command. Drop into any project and try:

| What you say | What happens |
| --- | --- |
| **"Use bunny-tools to set up CI/CD for this project"** | Runs `bunny init`, writes `.github/workflows/deploy.yml` using the official action, and lists the secrets you need to add |
| **"Deploy this site to Bunny"** | Reads existing `bunny.json`, runs `bunny deploy` (with dry-run preview first) |
| **"Purge the CDN cache for tag release-2026-04"** | Calls `bunny.purge` with `tag:release-2026-04` |
| **"Show me what's on my Bunny account"** | Calls `bunny.whoami` + lists reachable zone counts |
| **"Add an A record for www → 1.2.3.4 on my Bunny DNS zone for example.com"** | Resolves the zone id, calls `bunny.dns_record_add` |

For best results in a new project, drop a 2-line hint into the project's `CLAUDE.md`:

```markdown
## Deploy
This project uses bunny-tools. Run `bunny init` for first-time setup, then `bunny deploy`.
```

This anchors Claude to bunny-tools for that project's deploy work.

---

## Setup & Auth

| Command | Description |
| --- | --- |
| `bunny init` | Interactive setup - auth + feature picker + bunny.json |
| `bunny configure` | Walkthrough - store credentials in a named profile |
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
| `bunny storage sync <local-dir>` | Mirror local dir to zone - SHA-cached diff, parallel upload |

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


## Pull Zones (CDN)

> **Tip:** `bunny cdn ...` works everywhere `bunny pullzone ...` does - Bunny's dashboard calls these "CDN", so the alias is there for muscle memory. Canonical name follows Bunny's API (`pullzone`).

| Command | Description |
| --- | --- |
| `bunny pullzone list` (or `bunny cdn list`) | List pull zones |
| `bunny pullzone get <id>` | Get a pull zone |
| `bunny pullzone create <name>` | Create a pull zone |
| `bunny pullzone update <id> --body=<json>` | Update a pull zone (raw JSON body) |
| `bunny pullzone delete <id>` | Delete a pull zone |
| `bunny pullzone edgerule list <id>` | List edge rules on a pull zone |
| `bunny pullzone edgerule add <id> --rule=<json>` | Add an edge rule (raw JSON rule) |
| `bunny pullzone edgerule delete <id> <rule-id>` | Delete an edge rule |
| `bunny pullzone hostname list <id>` | List custom hostnames linked to a pull zone |
| `bunny pullzone hostname add <id> <hostname>` | Link hostname + provision Let's Encrypt cert + ForceSSL. Idempotent. `--no-force-ssl` opts out of HTTP→HTTPS redirect |
| `bunny pullzone hostname remove <id> <hostname>` | Unlink a custom hostname |


**Example**

```bash
bunny cdn edgerule list 12345

# Wire DNS to a pull zone (2 steps - `add` does link + cert + ForceSSL
# in one idempotent call; the DNS record points at the wired-up PZ):
bunny pullzone hostname add 5780316 example.com           # ~2-90s
bunny dns record add 783181 PULLZONE @ --pull-zone=5780316

# Or do everything in one shot via the atomic Connect Domain command:
bunny domain connect 5780316 example.com --dns-zone=783181
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

**Supported record types:** standard `A`, `AAAA`, `CNAME`, `TXT`, `MX`, `SRV`, `CAA`, `NS` plus Bunny routing types `REDIRECT`, `PULLZONE`, `PTR`, `SCRIPT`. `PULLZONE` and `SCRIPT` need `--link-name=<id>` (the linked pull zone / script id). For `PULLZONE` you can use the convenience flag `--pull-zone=<id>` instead and the CLI will fill in both the value and link-name from the pull zone's metadata. (`FLATTEN` is documented in Bunny's OpenAPI spec but the live API rejects it; dropped from supported types - re-add when Bunny enables it server-side.)

**Examples**

```bash
# Standard A record
bunny dns record add 783181 A www 1.2.3.4 --ttl=300

# Redirect www → https://example.com
bunny dns record add 783181 REDIRECT www https://example.com

# Wire DNS to a pull zone - auto-fills value + link-name
bunny dns record add 783181 PULLZONE "" --pull-zone=5780316

# Or raw form if you already know the pz name
bunny dns record add 783181 PULLZONE "" my-pz-name --link-name=5780316
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

> `containers app create` is deferred to v0.2 - Bunny's v3 schema requires `runtimeType` + `containerTemplates[]` + `autoScaling` which the current CLI surface doesn't yet model. Manage creation via the Bunny dashboard for now.

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
| `bunny manifest --names` | One command name per line - handy for shell completion |
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

- `account` - Account API key
- `storage:<zone>` - Storage zone password (per zone)
- `stream:<lib>` - Stream library API key (per library)
- `database:<name>` - Database access key

**Resolver chain (per call site):** `--flag` → scoped env (e.g. `BUNNY_STORAGE_PASSWORD_MY_APP`) → generic env (`BUNNY_STORAGE_PASSWORD`) → OS keychain (`<profile>:<scope>` keys) → `~/.config/bunny-tools/credentials.json` → interactive prompt.

## GitHub Actions

`bunny init --ci` generates a workflow that uses npm-install + `bunny deploy`:

```yaml
- name: Install bunny-tools
  run: npm install -g bunny-tools
- name: Deploy
  env:
    BUNNY_API_KEY: ${{ secrets.BUNNY_API_KEY }}
    BUNNY_STORAGE_PASSWORD_MY_APP: ${{ secrets.BUNNY_STORAGE_PASSWORD_MY_APP }}
  run: bunny deploy
```

A composite action wrapper (`bytekcorp/bunny-tools-deploy-action@v1`) is on the v0.2 roadmap for tighter ergonomics. The npm-install form above is the canonical path for v0.1.

## MCP server (AI integration)

Install steps are at the top under [Install → As an MCP server](#as-an-mcp-server-recommended-for-ai-workflows). Once configured, the server exposes:

**Tools (15):** `bunny.deploy`, `bunny.purge`, `bunny.init`, `bunny.manifest`, `bunny.whoami`, storage zone CRUD, pull zone CRUD, DNS zone + record CRUD, plus `bunny.run` as an escape hatch for any CLI invocation.

**Resources (3):**
- `bunny://manifest` - full command registry as JSON
- `bunny://agents` - AGENTS.md (workflows, gotchas, conventions for AI agents)
- `bunny://config/current` - resolved config from `bunny.json` + active alias

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
npm run build
npm test
npm run dev -- manifest --pretty
```

For end-to-end testing against a real Bunny account (drift detection), see [`docs/e2e-testing.md`](docs/e2e-testing.md).

For release instructions, see [`docs/deployment-guide.md`](docs/deployment-guide.md).

## License

MIT - see [LICENSE](./LICENSE).
