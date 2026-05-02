# bunny-tools

> Bunny.net CLI — storage deploy, CDN purge, full resource management. Like `firebase-tools`, for Bunny. AI-friendly via MCP.

[![CI](https://github.com/bytekcorp/bunny-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/bytekcorp/bunny-tools/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/bunny-tools.svg)](https://www.npmjs.com/package/bunny-tools)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Install

```bash
npm install -g bunny-tools
```

## Quickstart

```bash
bunny configure              # one-time global setup (like aws configure)
bunny init                   # per-project bunny.json
bunny deploy                 # storage sync + CDN purge
```

## Commands at a glance

| Area | Commands |
|---|---|
| **Setup** | `configure`, `init`, `auth:set`, `auth:list`, `auth:clear`, `use` |
| **Deploy** | `deploy`, `purge` |
| **Storage** | `storage:upload`, `storage:download`, `storage:list`, `storage:delete`, `storage:sync` |
| **Zones** | `storage-zone:{list,get,create,update,delete}`, `pull-zone:{list,get,create,update,delete}`, `pull-zone:edge-rule:{list,add,delete}` |
| **DNS** | `dns:{list,get,create,delete}`, `dns:record:{list,add,update,delete}` |
| **Discovery** | `manifest`, `<any> --help-json` |
| **AI** | `mcp` (stdio MCP server) |

Run `bunny manifest --pretty` for the full machine-readable surface, or read [`AGENTS.md`](./AGENTS.md) for AI-agent guidance.

## GitHub Action

```yaml
- uses: bytekcorp/bunny-tools-deploy-action@v1
  with:
    account-key: ${{ secrets.BUNNY_ACCOUNT_KEY }}
    storage-password: ${{ secrets.BUNNY_STORAGE_PASSWORD }}
```

See [`action/README.md`](./action/README.md) for full inputs.

## MCP server (AI integration)

`bunny-tools` ships an MCP stdio server. Install for Claude Code:

```bash
claude mcp add bunny-tools npx -y bunny-tools mcp
```

Or for Claude Desktop, add to `claude_desktop_config.json`:

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

The server exposes ~10 high-level tools (`bunny.deploy`, `bunny.purge`, zone/dns CRUD), an escape hatch (`bunny.run`) for any CLI invocation, and three resources (`bunny://manifest`, `bunny://agents`, `bunny://config/current`).

## Configuration

`bunny.json` (per-project, git-tracked):

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

`.bunnyrc` (per-developer aliases, gitignored):

```json
{
  "default": "prod",
  "aliases": {
    "prod":    { "storageZone": "my-app",     "pullZones": [12345] },
    "staging": { "storageZone": "my-app-stg", "pullZones": [12346] }
  }
}
```

## Auth

Four credential scopes (all use the `AccessKey` HTTP header):

- `account` — Account API key
- `storage:<zone>` — Storage zone password (per zone)
- `stream:<lib>` — Stream library API key
- `database:<name>` — Database access key

Resolved per call site with this fallback chain: `--flag` → scoped env (e.g. `BUNNY_STORAGE_PASSWORD_MY_APP`) → generic env (e.g. `BUNNY_STORAGE_PASSWORD`) → OS keychain → `~/.config/bunny-tools/credentials.json` → interactive prompt.

## Development

```bash
git clone https://github.com/bytekcorp/bunny-tools
cd bunny-tools
npm ci
npm test
npm run dev -- manifest --pretty
```

## License

MIT — see [LICENSE](./LICENSE).
