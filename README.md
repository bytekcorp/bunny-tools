# bunny-tools

> Bunny.net CLI — storage deploy, CDN purge, full resource management. Like `firebase-tools`, for Bunny.

[![CI](https://github.com/bytekcorp/bunny-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/bytekcorp/bunny-tools/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/bunny-tools.svg)](https://www.npmjs.com/package/bunny-tools)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Status:** Phase 1 (foundations) — pre-alpha. Daily-use deploy loop ships in `0.1.0-alpha.1`.

## Install

```bash
npm install -g bunny-tools
```

## Quickstart

```bash
bunny configure              # one-time global setup (like aws configure) — coming in 0.1.0-alpha.1
bunny init                   # per-project bunny.json
bunny deploy                 # storage sync + CDN purge
```

## What's here today (Phase 1)

- Project scaffolding (TypeScript, Commander, Vitest+Nock, undici, zod, keytar)
- HTTP client with `AccessKey` auth + 429 backoff
- Config loader (`bunny.json` + `.bunnyrc`) with zod validation
- Credential resolver chain: flag → env → keychain → file → prompt
- Manifest registry (single source for `--help --json`, `bunny manifest`, `AGENTS.md`, JSON Schema, MCP tool defs)
- `bunny manifest` command
- `bunny <any> --help --json` structured help
- Generator scripts + CI drift check

## What's coming

| Phase | Ships as | What |
|---|---|---|
| 2 | `0.1.0-alpha.1` | `init`, `configure`, `auth`, `use`, `deploy`, `purge` |
| 3 | `0.1.0-alpha.2` | `storage:*`, `storage-zone:*`, `pull-zone:*` |
| 4 | `0.1.0-alpha.3` | `dns:*` |
| 5 | `0.1.0-alpha.4` | `stream:*`, `containers:*`, `scripting:*` |
| 6 | `0.1.0-rc.1` | `bunny mcp` server, `AGENTS.md` polish |
| 7 | `0.1.0` GA | composite GitHub Action, `v1` floating tag |

See `plans/260502-1748-bunny-tools-cli/` for the implementation plan.

## License

MIT — see [LICENSE](./LICENSE).
