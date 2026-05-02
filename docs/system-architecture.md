# bunny-tools System Architecture

**Version:** v0.1.0-alpha.0 (Phase 1)  
**Last Updated:** 2026-05-02

---

## Architectural Overview

bunny-tools is a **registry-driven CLI + MCP server** that abstracts Bunny.net's REST API with honest credential scoping and rate-limit resilience. The architecture enforces a clean separation between CLI/MCP plumbing and core business logic.

```
┌────────────────────────────────────────────────────────────────┐
│ CLI (src/commands/*)         MCP Server (src/mcp/*, Phase 6)   │
│ ├─ manifest.ts               ├─ tools/manifest.ts              │
│ ├─ init.ts (P2)              ├─ tools/deploy.ts (P2)           │
│ └─ ... (P2–5)                └─ ... (P6+)                      │
│                                                                │
│ Both parse CLI args and JSON input, call src/core/*, render   │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ src/core/* (business logic, no UI, no network)                 │
│ ├─ (placeholder in Phase 1; populated P2–5)                   │
│ └─ Pattern: typed functions, zod validation, pure logic       │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ src/manifest/* (registry + code generation)                    │
│ ├─ registry.ts   ★ single source of truth                      │
│ ├─ types.ts      (CommandSpec, ArgSpec, FlagSpec)             │
│ └─ render-help.ts (text help + JSON help)                      │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ src/api/* (HTTP client, auth, errors)                         │
│ ├─ http.ts      (undici + retry + backoff + auth injection)   │
│ └─ errors.ts    (BunnyApiError, AuthError, ConfigError)       │
│                                                                │
│ Configuration:                                                 │
│ ├─ src/config/bunny-json.ts  (project config + zod schema)    │
│ ├─ src/config/bunnyrc.ts     (alias map)                      │
│ └─ src/config/credential-resolver.ts (4-step chain)           │
│                                                                │
│ Utilities:                                                     │
│ ├─ src/util/logger.ts        (stderr only, LOG_LEVEL env)     │
│ ├─ src/util/paths.ts         (XDG-compliant config dir)       │
│ └─ src/util/fs.ts            (atomic writes, JSON read/write) │
└────────────────────────────────────────────────────────────────┘
                              ↓
                    Bunny.net REST API
```

---

## Core Layers

### Layer 1: CLI Entry (`src/cli.ts`)

**Responsibility:** Parse CLI arguments, lazy-load command implementations, execute.

- Reads `src/manifest/registry.ts` at startup
- Builds Commander.js tree dynamically (no hand-wired subcommands)
- Intercepts `--help --json` → delegates to `src/manifest/render-help.ts`
- Lazy-loads `coreFn` only when command invoked (keeps cold-start <50ms)
- Never imports `src/api/*` directly; only `src/manifest/*`

**Entry point:** `dist/cli.js` → `bin: { bunny: dist/cli.js }` in package.json

---

### Layer 2: Manifest Registry (`src/manifest/registry.ts`)

**Responsibility:** Single source of truth for all command definitions.

The registry is a declarative list of `CommandSpec` objects. Every surface derives from it:
- **CLI help** (`--help`, `--help --json`)
- **`bunny manifest` JSON output** — full registry as JSON
- **`AGENTS.md` skeleton** — auto-generated command tree with human curated gotchas
- **`schema/bunny.schema.json`** — zod schemas → JSON Schema
- **MCP tool definitions** (Phase 6) — command → MCP tool mapping

**Phase 1 snapshot:**
- **Active:** `manifest` (1 command)
- **Planned (stubs only):** init, configure, auth:set/list/clear, use, deploy, purge, storage:*, storage-zone:*, pull-zone:*, dns:*, stream:*, containers:*, scripting:*, mcp (47 total)

Each command entry carries:
- `name`, `summary`, `description`
- `args[]`, `flags[]` with zod schemas (for Phase 2+)
- `examples[]`
- `mcp?: {tool, description}` (optional MCP mapping)
- `status: 'active' | 'planned' | 'deprecated'`
- `phase: number`
- `load?: () => Promise<{ run }>` (lazy import for active commands)

**Key invariant:** Commands NEVER imported at startup. Only registry consulted.

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

#### **Credential Resolver** (`src/config/credential-resolver.ts`)

4-step credential resolution chain per scope:

```ts
type AuthScope =
  | { kind: 'account' }
  | { kind: 'storage'; zone: string }
  | { kind: 'stream'; libraryId: string }
  | { kind: 'database'; name: string };

// Resolution order:
// 1. Explicit CLI flag (--account-key, --storage-password, etc.)
// 2. Scoped env var (BUNNY_ACCOUNT_KEY, BUNNY_STORAGE_PASSWORD_<ZONE>, etc.)
// 3. Generic env fallback (BUNNY_STORAGE_PASSWORD for all zones, etc.)
// 4. OS keychain via keytar (service: 'bunny-tools')
// 5. JSON file (~/.config/bunny-tools/credentials.json, mode 0600)
// 6. Interactive prompt (TTY only; CI fails fast with actionable error)

export async function resolveCredential(scope: AuthScope): Promise<string>;
```

**Key property:** Credentials NEVER logged, NEVER embedded in error messages.

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

### Boundary: Commands ↔ Core ↔ API

**MUST enforce via ESLint:**

```
src/commands/**  ├─ MAY import: src/core/*, src/manifest/*, src/util/*, src/config/
                 └─ MUST NOT import: src/api/*

src/mcp/**       ├─ MAY import: src/core/*, src/manifest/*, src/util/*, src/config/
                 └─ MUST NOT import: src/api/*

src/core/**      ├─ MAY import: src/api/*, src/util/*, src/config/*
                 └─ MUST NOT import: src/commands/*, src/mcp/*, src/manifest/*
```

**Why:** Commands and MCP tools are thin UI wrappers. Core is the substance. By enforcing this, both CLI and MCP reuse the same logic with zero duplication.

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
   - Invokes `renderManifest(registry, { pretty: true })`
   - Writes JSON to `stdout`
4. `renderManifest()`:
   - Serializes registry as JSON
   - If `--pretty`, indents
   - Returns string
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

## Phase 1 State (Current)

**Active Layers:**
- CLI entry (src/cli.ts) — wired
- Registry (src/manifest/registry.ts) — 47 commands declared; 1 active (manifest)
- Config loaders — wired (bunny-json, bunnyrc, credential-resolver)
- HTTP client — wired (undici, retry, auth injection)
- Error handling — wired
- Utilities — wired
- Manifest command (src/commands/manifest.ts) — wired

**Placeholder Layers:**
- `src/core/` — directory exists with README; populated in P2–5
- All other commands — registry stubs only, no implementations

---

## Future Layers (Phase 2+)

### Phase 2: Deploy Loop

```
src/core/deploy.ts
├─ walk()      → traverse local dir + gitignore
├─ diff()      → compare local vs remote (ETag + size)
├─ upload()    → parallel pool + 429 backoff
├─ purge()     → per-pull-zone (tag/all/none/url-list)
└─ state.ts    → .bunny-state.json checkpoint
```

### Phase 3: Storage + Zones

```
src/core/storage.ts
├─ upload / download / list / delete / sync
└─ zone-aware regional endpoint selection

src/core/zones.ts
├─ list / get / create / update / delete
└─ cache zone→region metadata
```

### Phase 6: MCP Server

```
src/mcp/
├─ server.ts         → stdio transport
├─ transport.ts      → JSON-RPC 2.0
├─ tools/
│  ├─ manifest.ts    → bunny.manifest tool
│  ├─ deploy.ts      → bunny.deploy tool
│  └─ ...
└─ resources/
   ├─ manifest        → read-only registry
   ├─ agents          → read-only AGENTS.md
   └─ config/current  → current active config (redacted)
```

---

## Testing Strategy

**Test pyramid:**
- **Unit (80% coverage):** api/http, config/*, manifest/* layers (no network, Nock mocked)
- **Integration:** Commands + core (future, P2+) calling api/http with Nock
- **E2E:** None in P1 (live e2e deferred post-GA)

**Nock enforcement:**
- `test/setup.ts` disables all real HTTP
- Nock allowlist: only responses explicitly mocked in tests pass
- CI verified: no network.enableNetConnect() calls

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
- `--account-key` flag for explicit pass-through (non-interactive `bunny configure`)
- No credentials in `bunny.json` or checked-in files
