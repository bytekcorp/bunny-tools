# bunny-tools System Architecture

**Version:** v0.1.0-rc.24  
**Last Updated:** 2026-05-03
**Status:** 51 active commands, 129 unit tests + 44 e2e tests, 15 MCP tools, live on npm (latest & alpha), MCP e2e harness + DNS REDIRECT e2e live

---

## Architectural Overview

bunny-tools is a **registry-driven CLI + MCP server** that abstracts Bunny.net's REST API with honest credential scoping, resilience, and zero duplication between CLI and MCP.

```
┌─────────────────────────────────────────────────────────────────┐
│ CLI Layer (src/commands/*)    MCP Server (src/mcp/*, P6)       │
│ ├─ auth, configure, init      ├─ server.ts (stdio)              │
│ ├─ deploy, purge              ├─ tools.ts (~14 tools)           │
│ ├─ storage:*, storage-zone:*  └─ 3 resources (manifest,         │
│ ├─ pull-zone:*, dns:*            agents, config)               │
│ └─ manifest (P1), mcp (P6)                                      │
│                                                                 │
│ Both layers:                                                    │
│  • Parse input (flags, args, JSON)                              │
│  • Call src/core/* for business logic                           │
│  • Render output (stderr, tables, colors)                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Core Logic (src/core/*, src/deploy/*)    [P2–4, 6–7 shipped]  │
│                                                                 │
│ Business layer (no UI, no side effects):                        │
│ ├─ src/core/deploy.ts (walk, diff, upload orchestration)       │
│ ├─ src/core/purge.ts (tag/URL/zone purge)                      │
│ ├─ src/core/storage-ops.ts (upload/download/list/sync)         │
│ ├─ src/core/zones.ts (zone CRUD, regional selection)           │
│ ├─ src/core/dns.ts (DNS CRUD, zod-validated types)             │
│ ├─ src/core/auth.ts, configure.ts, init.ts, aliases.ts         │
│ │                                                              │
│ │ Deploy subsystem (internal):                                │
│ ├─ src/deploy/walk.ts (gitignore-aware traversal)              │
│ ├─ src/deploy/diff.ts (local vs remote comparison)             │
│ ├─ src/deploy/upload-queue.ts (parallel pool + retry)          │
│ ├─ src/deploy/remote-list.ts (pagination)                      │
│ └─ src/deploy/state.ts (cache + state management)              │
│                                                                 │
│ UI helpers (for commands):                                      │
│ ├─ src/ui/progress.ts (spinner, progress bar)                  │
│ ├─ src/ui/prompt.ts (interactive input)                        │
│ └─ src/ui/table.ts (formatted lists)                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Registry & Metadata (src/manifest/*)        [P1 canonical]     │
│ ├─ registry.ts   ★ single source of truth (49 commands)        │
│ ├─ types.ts (CommandSpec, ArgSpec, FlagSpec, McpToolSpec)      │
│ └─ render-help.ts (text + JSON help from registry)             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ HTTP Client + Auth (src/api/*)             [P1 core, P3+ ext]  │
│ ├─ http.ts (undici + 429/5xx retry + Retry-After + auth)       │
│ ├─ account.ts (account-level endpoints)                         │
│ ├─ storage.ts (storage endpoints)                               │
│ └─ errors.ts (BunnyApiError, AuthError, ConfigError)           │
│                                                                 │
│ Configuration (src/config/)                                     │
│ ├─ bunny-json.ts (project config, zod schema)                  │
│ ├─ bunnyrc.ts (alias map)                                       │
│ └─ credential-resolver.ts (flag → env → keychain → file)       │
│                                                                 │
│ Utilities (src/util/)                                           │
│ ├─ logger.ts (stderr only, LOG_LEVEL env)                       │
│ ├─ paths.ts (XDG-compliant dirs)                                │
│ ├─ fs.ts (atomic JSON writes)                                   │
│ └─ content-type.ts (MIME detection)                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    Bunny.net REST API
```

---

## Core Layers

### Layer 1: CLI Entry (`src/cli.ts`)

**Responsibility:** Parse CLI arguments, lazy-load command implementations, execute.

- Reads `src/manifest/registry.ts` at startup
- Builds Commander.js tree dynamically (no hand-wired subcommands)
- **Space-delimited syntax (rc.7+):** Command names split on whitespace, walk up tree
  - E.g., `pullzone edgerule add` → create subgroup `pullzone` → subgroup `edgerule` → leaf `add`
  - **Hyphenated aliases (rc.10–rc.17):** `pull-zone`, `storage-zone`, `edge-rule` worked via Commander.alias(); **DROPPED in rc.18** (canonical flat form only; `cdn` alias retained for `pullzone` group)
- **Group descriptions (rc.10+):** Groups display descriptions in `--help` (not `pullzone commands`); **help layout (rc.19+):** wrangler-style TITLE → USAGE → COMMANDS (grouped) → FLAGS, no emoji
- **Global flags:** `-c/--config <path>`, `--cwd <dir>`, `-e/--env <alias>`, `-p/--profile <name>` (rc.8+)
  - Applied via preAction hook; `--cwd` chdir's first so config search is relative to new cwd
- Intercepts `--help --json` → delegates to `src/manifest/render-help.ts`
- Lazy-loads `load()` only when command invoked (keeps cold-start <50ms)
- Never imports `src/api/*` directly; only `src/manifest/*`

**Entry point:** `dist/cli.js` → `bin: { bunny: dist/cli.js }` in package.json

**Example command tree (rc.10):**
```
bunny init|deploy|purge|whoami|docs|mcp|use|manifest|configure          (leaf commands)
bunny storage upload|download|list|delete|sync                           (nested: storage/…)
bunny storagezone list|get|create|update|delete                          (nested: storagezone/…)
bunny pullzone list|get|create|update|delete                             (nested: pullzone/…)
  └─ bunny pullzone edgerule list|add|delete                             (3-level deep)
bunny dns list|get|create|delete                                         (nested: dns/…)
  └─ bunny dns record list|add|update|delete                             (3-level deep)
bunny stream library|video (subgroups)                                    (nested: stream/…)
bunny containers app (subgroup)                                          (nested: containers/…)
bunny scripting list|deploy|delete                                       (nested: scripting/…)
```

---

### Layer 2: Manifest Registry (`src/manifest/registry.ts`)

**Responsibility:** Single source of truth for all command definitions.

The registry is a declarative list of `CommandSpec` objects. Every surface derives from it:
- **CLI help** (`--help`, `--help --json`)
- **`bunny manifest` JSON** — full registry as JSON
- **`AGENTS.md`** — auto-generated command tree + human-curated gotchas
- **`schema/bunny.schema.json`** — zod schemas → JSON Schema
- **MCP tool definitions** — command → MCP tool mapping (P6)

**Current state (rc.24):**
- **Active:** 51 commands (all phases 1–7 shipped; Phase 5 un-deferred rc.10; new rc.19/rc.24: `install mcp`, `update`, DNS REDIRECT/FLATTEN/PULLZONE/PTR/SCRIPT types)
- **Deferred to v0.2:** only advanced features (containers app create due to Bunny v3 schema issue, headers/rewrites sugar, live emulator, plugins)
- **Phase 5 status:** Stream library, stream video, scripting all fully active; containers app create demoted to `planned` (Bunny v3 schema mismatch; defer to v0.2)

Each entry carries:
- `name`, `summary`, `description`
- `args[]`, `flags[]` with zod schemas
- `examples[]` (all active commands)
- `mcp?: {tool, description}` (MCP mapping for all active)
- `status: 'active' | 'planned' | 'deferred'`
- `phase: 1–7`
- `load?: () => Promise<{ run }>` (lazy import)
- `groups?: { name, description, aliases? }` (rc.10: group descriptions + hyphen aliases)

**Key invariant:** Commands NEVER imported at startup; registry read once, cached.

---

### Layer 3: Configuration (`src/config/*`)

#### **bunny.json** (`src/config/bunny-json.ts`)

Project-level configuration (git-tracked).

```ts
type BunnyJsonSchema = {
  $schema?: string;
  deploy: {
    publicDir: string;              // Required: source directory
    ignore?: string[];              // gitignore patterns (default: standard ignores)
    storageZone: string;            // Required: zone name
    region?: string;                // Optional: override region detection
    concurrency?: number;            // Optional: upload parallelism (default: 8)
    pullZones?: Array<{
      id: number;
      purge?: 'tag:<name>' | 'all' | 'none' | string[];
      tag?: string;                 // Cache-Tag if purge=tag
    }>;
  };
};
```

Loaded via `loadBunnyJson(cwd)` walks up directory tree (cosmiconfig-style).

#### **.bunnyrc** (`src/config/bunnyrc.ts`)

Alias map (gitignored, optional).

```ts
type BunnyrcSchema = {
  default?: string;
  aliases: Record<string, {
    storageZone?: string;
    pullZones?: number[];
    // ... future: dns domains, regions
  }>;
};
```

Resolves active alias via CLI flag → env `BUNNY_ALIAS` → file default.

#### **Credentials** (`~/.config/bunny-tools/credentials.json`, rc.9+ multi-account)

Profile-based storage (mode 0600):

```json
{
  "active": "default",
  "profiles": {
    "default": {
      "account": "abc123...",
      "storage:my-app": "pw-xyz...",
      "stream:42": "lib-key..."
    },
    "work": {
      "account": "def456...",
      "storage:work-zone": "..."
    }
  }
}
```

**Active profile selection (rc.9+):**
1. `-p/--profile` CLI flag (one-shot override)
2. `BUNNY_PROFILE` env var
3. File's `active` field
4. Default to `default` profile

**Auto-migration (rc.9):** rc.8 flat shape automatically wrapped into `default` profile on first read.

#### **Credential Resolver** (`src/config/credential-resolver.ts`)

6-step credential resolution chain per scope, per active profile:

```ts
type AuthScope =
  | { kind: 'account' }
  | { kind: 'storage'; zone: string }
  | { kind: 'stream'; libraryId: string }
  | { kind: 'database'; name: string };

// Resolution order (per active profile):
// 1. Explicit CLI flag (--account-key, --storage-password, etc.)
// 2. Scoped env per profile (BUNNY_ACCOUNT_KEY_<PROFILE>, BUNNY_STORAGE_PASSWORD_<PROFILE>_<ZONE>)
// 3. Generic env fallback (BUNNY_STORAGE_PASSWORD — treated as active profile)
// 4. OS keychain at <profile>:<scope> (service: 'bunny-tools')
// 5. JSON file profiles[active_profile][scope]
// 6. Interactive prompt (TTY only; CI fails fast with actionable error)

export async function resolveCredential(scope: AuthScope, profile?: string): Promise<string>;
```

**Key property:** Credentials NEVER logged, NEVER embedded in error messages. Masked as `****…<last4>`.

---

### Layer 4: HTTP Client (`src/api/http.ts`)

**Responsibility:** Single point for all Bunny API calls with auth, retry, error handling.

```ts
type CallOptions = {
  base: string;                      // e.g., 'https://api.bunny.net'
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, any>;
  body?: unknown;                    // JSON-stringified; Buffer for binary
  scope: AuthScope;                  // Resolved at call time
  contentType?: string;
  retry?: { max?: number; baseMs?: number };
  signal?: AbortSignal;
  binary?: boolean;                  // For storage downloads
};

export async function callBunny<T>(opts: CallOptions): Promise<T>;
```

**Features:**
- **Auth injection:** `AccessKey` header added via credential resolver
- **Retry logic:** 429, 502, 503, 504 → exponential backoff with ±25% jitter, max 5 attempts
- **Retry-After honor:** If response includes `Retry-After`, uses that instead of computed backoff
- **Max backoff:** 30s cap
- **Other 4xx:** Throw immediately
- **Timeout:** Configurable per call; defaults to 30s
- **Connection reuse:** Persistent undici `Pool` per base URL

**Error handling:** All HTTP responses parsed through `parseBunnyErrorBody()` → typed `BunnyApiError` with `{ ErrorKey, Field, Message }` unpacking.

---

### Layer 5: Error Handling (`src/api/errors.ts`)

Custom error types:

```ts
class BunnyApiError extends Error {
  readonly statusCode: number;
  readonly errorKey?: string;
  readonly field?: string;
  // Bunny returns structured JSON; parsed here
}

class AuthError extends Error {}
class ConfigError extends Error {}
class ValidationError extends Error {}
```

All HTTP errors funnel through `parseBunnyErrorBody()` before throwing.

---

### Layer 6: Utilities

#### **Logger** (`src/util/logger.ts`)
- Writes to `stderr` only (stdout reserved for JSON output + MCP transport)
- `LOG_LEVEL` env controls verbosity (debug, info, warn, error)
- No `console.log` anywhere in codebase (eslint enforced)

#### **Paths** (`src/util/paths.ts`)
- XDG-compliant: `~/.config/bunny-tools/`
- Credentials file: `~/.config/bunny-tools/credentials.json`
- State file (future): `.bunny-state.json` (per-project, gitignored)

#### **File System** (`src/util/fs.ts`)
- Atomic JSON writes (write-temp-then-rename pattern)
- JSON read with fallback to null
- Mode enforcement (e.g., 0o600 for credentials)

---

## Architectural Invariants

### Boundary: Commands/MCP ↔ Core ↔ API (ESLint Enforced)

```
src/commands/**  ├─ MAY import: core, manifest, util, config, ui
                 └─ MUST NOT import: api

src/mcp/**       ├─ MAY import: core, manifest, util, config
                 └─ MUST NOT import: api

src/core/**      ├─ MAY import: api, util, config, deploy (internal)
                 └─ MUST NOT import: commands, mcp, manifest

src/deploy/**    ├─ MAY import: api, util, config
                 └─ MUST NOT import: commands, mcp, manifest, core
```

**Rationale:** Commands/MCP are thin UI wrappers calling core. Core is the logic. Both reuse core via api. Zero duplication between CLI and MCP.

**Enforcement:** ESLint rule `no-restricted-imports` on every commit + CI gate.

### No Side Effects in Core

`src/core/*` functions:
- Accept typed inputs (validated with zod at boundary)
- Return typed outputs
- Throw or return; never `process.exit()`
- Never call `console.log`, `process.stdout.write`
- Never spawn UI (`ora`, `chalk`, `prompts`)
- All network goes through `src/api/http.ts`

UI rendering lives in `src/commands/*` and `src/ui/*` (future).

### Registry Canonicity

Every command's surface is derived from `src/manifest/registry.ts`:
- **Help text** — from `description` + `flags` + `examples`
- **JSON help** — from `CommandSpec` directly
- **Validation** — from `args[].schema` + `flags[].schema` (zod, future)
- **MCP tools** — from `mcp` mapping

**Consequence:** To add a command, edit registry once. Help, JSON, AGENTS.md, schema, MCP defs all auto-generate on build.

---

## Data Flow Example: `bunny manifest`

1. User runs: `bunny manifest --pretty`
2. CLI entry (`src/cli.ts`):
   - Reads `registry`
   - Finds `manifest` command
   - Parses `--pretty` flag
   - Lazy-loads `src/commands/manifest.js`
3. Command executor (`src/commands/manifest.ts`):
   - Calls `run({ flags: { pretty: true }, ... })`
   - Invokes `renderRegistryHelpJson(registry)` from `src/manifest/render-help.ts`
   - Writes JSON to `stdout` via `JSON.stringify(data, null, pretty ? 2 : 0)`
4. `--names` mode (rc.10):
   - Filters `registry.commands` to `status === 'active'`
   - Writes one command name per line to `stdout`
5. CLI writes to stdout (command reserved, not logging layer)

**Zero network calls.** Registry in-memory already.

---

## Data Flow Example: `bunny deploy` (Phase 2, mocked here)

1. User runs: `bunny deploy --dry-run`
2. CLI:
   - Parses flags
   - Lazy-loads `src/commands/deploy.js`
3. Deploy command:
   - Loads `bunny.json` + active `.bunnyrc` alias
   - Resolves account credential (chain: flag → env → keychain → file → prompt)
   - Calls `core.deploy({ config, credential, dryRun: true, ... })`
4. `src/core/deploy.ts` (Phase 2):
   - Walks local directory (honoring ignores)
   - Calls `api.http.callBunny(...)` to list remote
   - Diffs: computes new/changed/orphan
   - Returns deployment plan (no side effects)
5. Deploy command:
   - Renders plan (ora spinner, table, etc.)
   - If `--dry-run`, stops
   - Else calls `core.deploy({ ... executeUploads: true })`
6. `src/core/deploy.ts`:
   - Parallel upload pool (default 8, respects 429 backoff)
   - Calls `core.purge(...)` per pull-zone
   - Returns result
7. Deploy command:
   - Renders success + timing summary
   - Exits with code 0

**All state decisions made in core; all rendering in command layer.**

---

## Current State (Phases 1–7 All Shipped; rc.24)

**Active:**
- CLI entry (src/cli.ts) with **ESM main detection fix (rc.15)**, **help layout polish (rc.19)**
- Registry (src/manifest/registry.ts) — **51 active commands** (all phases 1–7; new rc.19/rc.24: `install mcp`, `update`, 5 DNS types)
- Config loaders (bunny-json, bunnyrc, credential-resolver)
- HTTP client (undici, retry, auth injection, P1; account/storage endpoints P3+)
- Core logic (deploy, purge, storage-ops, zones, dns, auth, configure, init, aliases, stream, scripting)
- Deploy subsystem (walk, diff, upload-queue, remote-list, state)
- MCP server (server.ts, tools.ts with 15 tools + 3 resources; **e2e harness rc.23**, **stdio fix rc.23**)
- UI helpers (progress, prompt, table)
- Error handling, logging, paths, filesystem, content-type
- **Help renderer (format-help.ts, rc.19)** — Wrangler-style layout; no emoji; TITLE → USAGE → COMMANDS → FLAGS
- All **51 active command implementations** (all working, ≥80% test coverage)
- Vitest 4.x (upgraded rc.13 for security patch GHSA-67mh-4wv8-2f99); **129 unit + 44 e2e tests**

**Deferred to v0.2:**
- Containers app create (Bunny v3 schema mismatch detected rc.12; defer to v0.2)
- Headers/rewrites/redirects sugar in bunny.json
- Live e2e emulator (Nock mocking sufficient for v0.1)
- Plugin system

**Breaking Changes (locked in pre-GA):**
- **rc.18:** Hyphen aliases (`pull-zone`, `storage-zone`, `edge-rule`) dropped; canonical flat form only. **`cdn` alias retained** for `pullzone` group.

---

## Testing Strategy (All Phases; rc.13: Vitest 4.x)

**Unit tests (129 tests, 80%+ coverage, all phases, Nock-mocked, vitest 4.x):**
- `test/api/*` — HTTP client, auth, retry, error handling
- `test/cli/*` — CLI main detection (rc.15+), entry point validation
- `test/config/*` — Config loaders, credential chain, validation
- `test/core/*` — Deploy, purge, zones, DNS, auth, configure, init, stream, scripting
- `test/deploy/*` — Walk, diff, upload queue, state, remote list
- `test/manifest/*` — Registry, help rendering, format-help (rc.19+)
- `test/mcp/*` — MCP tools, resources
- **New (rc.24):** 7 unit tests for DNS routing types (REDIRECT, FLATTEN, PULLZONE, PTR, SCRIPT)

**Integration (via Nock mocking):**
- Commands calling core calling api (no real network)
- Credential chain resolution (flag → env → keychain → file → prompt)
- Error propagation (HTTP errors → typed exceptions)

**E2E Drift-Detection Harness (44 tests, real Bunny, nightly CI, vitest 4.x):**
- Located at `test/e2e/*.e2e.ts` with helpers + test fixture (test/e2e/fixtures/sample.mp4)
- Gated on environment variable `BUNNY_E2E=1` (safe to skip locally; local: `npm run test:e2e` only if enabled)
- Runs nightly via `.github/workflows/e2e-nightly.yml` against real Bunny account (~03:00 UTC)
- **Purpose:** Detect when Bunny API contracts change (schema drift, endpoint breakage, status codes)
- **Coverage:** 10 e2e service files (account, storage zones/files, pull zones, edge rules, DNS, streams, scripting, deploy, MCP)
  - **New (rc.23):** `test/e2e/mcp.e2e.ts` (13 active tools + 2 skipped) + `test/e2e/helpers/mcp-client.ts` (MCP SDK Client wrapper)
  - **New (rc.24):** DNS REDIRECT routing type round-trip test + 7 unit tests for new types
- **Resource cleanup:** All test resources prefixed `bt-e2e-*` for easy identification; cleanup via `afterAll` + 24h stale sweep
- **Failure mode:** Opens GitHub issue labeled `e2e,drift` on failure
- See `docs/e2e-testing.md` for provisioning + adding new services

---

## Deployment & Distribution

**NPM package:**
- Binary: `bunny` → `dist/cli.js` (esbuild bundled)
- Versioning: `0.1.0-alpha.N` until GA
- Artifacts checked in: `manifest.json`, `AGENTS.md`, `schema/bunny.schema.json` (CI drift-checked)

**GitHub Action (Phase 7):**
- Composite action wrapping `npx bunny-tools@<version> deploy`
- Inputs: account-key, storage-password, concurrency, working-directory
- Transparent: user can pin to any npm version

---

## Cold-Start Analysis

| Component | Time | Budget |
|-----------|------|--------|
| Node startup | ~5ms | — |
| TS → JS (bundled) | ~5ms | — |
| Require imports | ~7ms | — |
| Registry parse | ~3ms | — |
| Commander tree build | ~2ms | — |
| `--help` render | ~0.5ms | — |
| **Total** | ~22ms | <50ms ✓ |

Commander.js baseline alone is ~22ms; we stay under budget with lazy command loading.

---

## Credential Security

**Never logged:**
- No credential echoing in debug logs
- No credential in error messages
- Masking: `maskCredential(value)` → `***1234` (last 4 digits only)

**Storage security:**
- File credentials: `~/.config/bunny-tools/credentials.json` mode 0600
- Keychain credentials: OS-managed encryption
- In-memory: credentials only live during API call; not cached mid-process

**CI security:**
- Credentials via env vars (GitHub Secrets)
- `--account-key` flag for explicit pass-through (`bunny init --non-interactive`)
- No credentials in `bunny.json` or checked-in files
