# bunny-tools Codebase Summary

**Version:** v0.1.0-alpha.0 (Phase 1)  
**Last Updated:** 2026-05-02  
**Total Files:** 13 source + 5 test + 3 config files  
**Lines of Code (src/):** ~475 LOC  

---

## File Map

### Root Configuration

| File | Purpose |
|------|---------|
| `package.json` | Project metadata, scripts, dependencies, bin entry `bunny` → `dist/cli.js` |
| `tsconfig.json` | TypeScript strict mode, ES2022 target, NodeNext resolution |
| `tsconfig.build.json` | Build-specific overrides (noEmit: false, outDir: dist/) |
| `vitest.config.ts` | Test runner config; imports `test/setup.ts` for Nock initialization |
| `.eslintrc.cjs` | ESLint rules (no console.log, no api imports in commands/mcp, strict) |
| `.prettierrc` | Prettier formatting config (2-space indent) |
| `.gitignore` | Excludes node_modules, dist/, .bunny-state.json, credentials.json |

### Entry Point

**`src/cli.ts`** (116 lines)

Commander.js entry point. Reads `src/manifest/registry.ts`, builds dynamic CLI tree, intercepts `--help --json`, lazy-loads command implementations. Cold-start optimized; no eager command imports.

**Key exports:**
- `main()` → runs CLI, handles exit codes

**Dependencies:** commander, registry, logger, render-help

---

### Manifest (Registry & Help Rendering)

**`src/manifest/registry.ts`** (160+ lines)

★ **Single source of truth** for all v0.1 commands. Declarative list of 47 `CommandSpec` objects:
- 1 active (`manifest`)
- 46 planned stubs (phases 2–6)

Each entry carries:
- `name`, `summary`, `description`
- `args[]`, `flags[]` (with zod schemas in Phase 2+)
- `examples[]`
- `mcp?: {tool, description}` (MCP mapping)
- `status: 'active' | 'planned' | 'deprecated'`
- `phase: number`
- `load?: () => Promise<{run}>` (lazy loader, active commands only)

**Key insight:** All generated artifacts (help, JSON, AGENTS.md, schema, MCP defs) derive from this file.

**Dependencies:** none (pure data structure)

**`src/manifest/types.ts`** (65 lines)

TypeScript type definitions for registry:
- `CommandSpec` — full command definition
- `ArgSpec` — positional argument spec
- `FlagSpec` — flag spec (with short form, default value)
- `ExampleSpec` — usage example
- `McpToolSpec` — MCP tool mapping
- `Registry` — full CLI registry

**Dependencies:** none

**`src/manifest/render-help.ts`** (80+ lines)

Renders registry → human-readable help + JSON help.

**Key functions:**
- `renderTextHelp(registry, commandName?)` → string (markdown-ish)
- `renderJsonHelp(registry, commandName?)` → JSON object

Used by:
- CLI `--help` (text)
- CLI `--help --json` (JSON)
- `bunny manifest` command

**Dependencies:** registry, types

---

### Commands (Active & Planned)

**`src/commands/manifest.ts`** (35 lines)

Only active command in Phase 1. Outputs registry as JSON to stdout.

**Exports:**
```ts
export async function run({flags}: ParsedInvocation): Promise<number>
```

**Behavior:**
- Reads registry in-memory
- Serializes to JSON
- If `--pretty` flag, indents with 2-space
- Writes to stdout
- Returns 0 on success

**Used by:**
- `bunny manifest` CLI command
- AI agents for command discovery
- CI drift checks

**Dependencies:** registry, logger

---

### API Layer (HTTP Client & Errors)

**`src/api/http.ts`** (170+ lines)

Single point for all Bunny.net REST API calls.

**Key exports:**

```ts
// Types
type AuthScope = 
  | { kind: 'account' }
  | { kind: 'storage'; zone: string }
  | { kind: 'stream'; libraryId: string }
  | { kind: 'database'; name: string };

type CallOptions = {
  base: string;              // e.g., 'https://api.bunny.net'
  path: string;              // e.g., '/storagezone'
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, any>;
  body?: unknown;            // JSON → stringified; Buffer → binary
  scope: AuthScope;          // credential scope
  contentType?: string;
  retry?: { max?: number; baseMs?: number };
  signal?: AbortSignal;
  binary?: boolean;          // For storage downloads
};

// Main function
async function callBunny<T>(opts: CallOptions): Promise<T>;
```

**Features:**
- **Auth:** `AccessKey` header injected via credential resolver at call time
- **Retry:** 429, 502, 503, 504 → exponential backoff with ±25% jitter, max 5 attempts
- **Retry-After:** honors `Retry-After` header if present
- **Max backoff:** 30s cap
- **Timeout:** configurable per call, default 30s
- **Connection reuse:** persistent undici `Pool` per base URL
- **Error parsing:** all responses funnel through `parseBunnyErrorBody()`

**Dependencies:** undici, errors, logger, credential-resolver

**`src/api/errors.ts`** (50 lines)

Custom error types and Bunny error parser.

**Types:**
```ts
class BunnyApiError extends Error {
  statusCode: number;
  errorKey?: string;
  field?: string;
}

class AuthError extends Error {}
class ConfigError extends Error {}
class ValidationError extends Error {}
```

**Key function:**
```ts
function parseBunnyErrorBody(status: number, body: unknown): Error
```

Parses Bunny's `{ ErrorKey, Field, Message }` response → typed error.

**Dependencies:** none

---

### Configuration

**`src/config/bunny-json.ts`** (80 lines)

Project configuration loader (git-tracked).

**Zod schema:**
```ts
{
  deploy: {
    publicDir: string;                // Required
    ignore?: string[];                // gitignore patterns
    storageZone: string;              // Required
    region?: string;                  // Optional override
    concurrency?: number;             // Optional (default: 8)
    pullZones?: Array<{
      id: number;
      purge?: 'tag:...' | 'all' | 'none' | string[];
      tag?: string;
    }>;
  };
}
```

**Key function:**
```ts
async function loadBunnyJson(cwd: string): Promise<BunnyJson>
```

Walks up directory tree (cosmiconfig-style) until finds `bunny.json`.

**Dependencies:** zod, fs, logger, errors

**`src/config/bunnyrc.ts`** (50 lines)

Alias resolver (gitignored).

**Schema:**
```ts
{
  default?: string;
  aliases: Record<string, {
    storageZone?: string;
    pullZones?: number[];
  }>;
}
```

**Key function:**
```ts
function resolveActiveAlias(cliFlag?: string): string
```

Resolution order: CLI flag → `BUNNY_ALIAS` env → file default.

**Dependencies:** zod, fs, logger

**`src/config/credential-resolver.ts`** (175 lines)

4-step credential resolution chain + OS keychain wrapper.

**Key functions:**

```ts
// Main resolver
async function resolveCredential(scope: AuthScope): Promise<string>
// Chain: flag → scoped env → generic env → keychain → file → prompt

// Storage functions
async function setCredential(scope: AuthScope, value: string): Promise<{ storedIn: 'keychain' | 'file' }>
async function clearCredential(scope: AuthScope): Promise<void>
async function listCredentialScopes(): Promise<string[]>

// Helpers
function scopeToAccount(scope: AuthScope): string
function scopeToEnvVars(scope: AuthScope): string[]
function maskCredential(value: string): string
```

**Keychain integration:**
- Lazy imports `keytar` (optional native module)
- Graceful fallback to `~/.config/bunny-tools/credentials.json` if keytar unavailable
- File storage: atomic writes with mode 0600

**Dependencies:** keytar (optional), fs, logger, paths, errors

---

### Utilities

**`src/util/logger.ts`** (40 lines)

Structured logging to stderr (stdout reserved for JSON output).

**Exports:**
```ts
const logger = {
  debug(msg: string, ...args: unknown[]): void
  info(msg: string, ...args: unknown[]): void
  warn(msg: string, ...args: unknown[]): void
  error(msg: string, ...args: unknown[]): void
};
```

**Control:** `LOG_LEVEL` environment variable (debug|info|warn|error, default: error)

**Invariant:** Credentials never logged.

**Dependencies:** picocolors (optional; graceful fallback to plain text)

**`src/util/paths.ts`** (35 lines)

XDG-compliant config directory resolver.

**Exports:**
```ts
function configDir(): string;  // ~/.config/bunny-tools/
function credentialsFile(): string;  // ~/.config/bunny-tools/credentials.json
function stateFile(projectDir: string): string;  // ./.bunny-state.json
```

**Platform aware:** Respects `XDG_CONFIG_HOME` on Linux, `~/Library/Application Support` on macOS.

**Dependencies:** none (uses built-in path utils)

**`src/util/fs.ts`** (45 lines)

JSON file helpers with atomic writes.

**Exports:**
```ts
async function readJsonOrNull<T>(path: string): Promise<T | null>
async function atomicWriteJson(path: string, data: unknown, opts?: {mode?: number}): Promise<void>
```

**Atomic write pattern:** write-to-temp-then-rename (prevents corruption).

**Dependencies:** none (uses fs.promises)

---

### Core Layer (Placeholder)

**`src/core/README.md`** (23 lines)

Architectural invariant documentation (ships at runtime, no code).

**Key rules:**
- No `console.log`, `process.stdout.write`, `process.exit`
- No `prompts`, `ora`, `chalk` (UI lives in commands/mcp)
- Stable, typed API with explicit validation at boundaries
- Network calls via `src/api/*` only
- Rationale: CLI and MCP reuse same core logic

---

### Scripts (Build & Generation)

**`scripts/post-build.ts`** (20 lines)

Runs after TypeScript compilation. Triggers all 3 generators.

```bash
# Called by: npm run build (after tsc)
# Invokes:
tsx scripts/generate-manifest.mjs
tsx scripts/generate-agents.mjs
tsx scripts/generate-schema.mjs
```

**`scripts/generate-manifest.mjs`** (40 lines)

Reads `src/manifest/registry.ts` (via dynamic import of compiled JS), generates `manifest.json`.

**Output:** `manifest.json` with full registry (command tree, flags, examples, mcp mappings, phase).

**Checked in:** Yes (CI drift-checks against edits).

**`scripts/generate-agents.mjs`** (60 lines)

Reads registry, generates `AGENTS.md` skeleton.

**Output:** `AGENTS.md` with:
- Auto-generated command tree (grouped by phase)
- Human-curated "Quickstart for AI agents" section (preserved between markers)
- Common workflows, gotchas, MCP usage

**Checked in:** Yes (preserves human edits between markers).

**`scripts/generate-schema.mjs`** (50 lines)

Reads zod schemas from `src/config/bunny-json.ts`, generates `schema/bunny.schema.json`.

**Output:** JSON Schema for `bunny.json` (used by editors for autocomplete/validation).

**Checked in:** Yes (CI drift-checks).

---

### Tests

**`test/setup.ts`** (15 lines)

Vitest initialization. Disables all real HTTP via Nock.

```ts
import nock from 'nock';
nock.disableNetConnect();
afterEach(() => nock.cleanAll());
```

**Ensures:** No real network calls in tests; all responses must be explicitly mocked.

**`test/api/http.test.ts`** (120+ lines)

HTTP client tests covering:
- 200 success + response parsing
- 401 AuthError
- 429 with Retry-After (honored, then succeeds)
- 500 retried, succeeds
- 5× 429 (exhausts retries, throws)
- Binary uploads (Buffer body)

Mocked via Nock.

**`test/config/bunny-json.test.ts`** (80 lines)

Config loader tests covering:
- Valid bunny.json
- Missing `publicDir` (error)
- Invalid `region` (error)
- Tree walk (finds file in parent dir)

**`test/config/credentials.test.ts`** (120+ lines)

Credential resolver tests covering:
- CLI flag override
- Scoped env vars (BUNNY_ACCOUNT_KEY, etc.)
- Generic env fallback
- Keychain read (mocked)
- File store read/write (mode 0600 verified)
- No credentials logged (spy assertion)

**`test/manifest/registry.test.ts`** (50 lines)

Registry validation:
- All command names unique
- All commands have description
- All active commands have example
- Phase numbering consistent

**`test/manifest/render-help.test.ts`** (60 lines)

Help rendering tests:
- Text help is readable string
- JSON help is valid object
- Round-trip: registry → JSON → structure preserved

---

### Generated Artifacts (Checked In)

**`manifest.json`** (~8 KB)

Full registry as JSON. Used by:
- `bunny manifest` command output
- AI agents for discovery
- CI drift-check

**`AGENTS.md`** (5 KB)

AI-friendly documentation with:
- Command tree (auto-generated, grouped by phase)
- Quickstart for AI agents (human-curated)
- Common workflows, gotchas
- MCP usage instructions

Human edits preserved between `<!-- HANDCURATED:START/END -->` markers.

**`schema/bunny.schema.json`** (~3 KB)

JSON Schema for `bunny.json`. Published at:
```json
{
  "$schema": "https://unpkg.com/bunny-tools/schema/bunny.schema.json",
  "deploy": { ... }
}
```

Used by editors (VS Code, JetBrains) for autocomplete/validation.

---

## Key Metrics (Phase 1)

| Metric | Value | Target |
|--------|-------|--------|
| Cold-start `bunny --help` | ~22ms | <50ms ✓ |
| Test coverage (api/config/manifest) | ≥80% | ≥80% |
| Active commands | 1 | 1 ✓ |
| Total command stubs | 47 | 47 ✓ |
| Source files | 13 | lean ✓ |
| HTTP tests | 5 scenarios | comprehensive ✓ |
| CI passes | ✓ (ubuntu + macos, Node 20+22) | ✓ |

---

## Module Dependencies (Dependency Graph)

```
cli.ts
├─ manifest/registry.ts
├─ manifest/render-help.ts
└─ util/logger.ts

commands/manifest.ts
├─ manifest/registry.ts
└─ util/logger.ts

api/http.ts
├─ undici
├─ config/credential-resolver.ts
├─ api/errors.ts
└─ util/logger.ts

config/credential-resolver.ts
├─ keytar (optional)
├─ util/fs.ts
├─ util/paths.ts
├─ util/logger.ts
└─ api/errors.ts

config/bunny-json.ts
├─ zod
├─ util/fs.ts
├─ util/logger.ts
└─ api/errors.ts

config/bunnyrc.ts
├─ zod
├─ util/fs.ts
└─ util/logger.ts

manifest/render-help.ts
├─ manifest/types.ts
├─ manifest/registry.ts
└─ util/logger.ts

util/logger.ts
└─ picocolors (optional)

util/paths.ts
└─ (none — uses Node builtins)

util/fs.ts
└─ (none — uses Node promises)
```

**Observation:** Clean layering. Commands only → core/manifest/util/config. No circular deps.

---

## Development Workflow

### Adding a New Command (Phase 2+)

1. **Edit `src/manifest/registry.ts`:**
   ```ts
   {
     name: 'deploy',
     summary: 'Deploy to Bunny...',
     // ... flags, args, examples
     status: 'planned',  // or 'active'
     phase: 2,
     load: () => import('../commands/deploy.js'),
   }
   ```

2. **Create `src/commands/deploy.ts`:**
   ```ts
   export async function run({args, flags, raw}: ParsedInvocation): Promise<number> {
     // ... implementation
   }
   ```

3. **Add tests in `test/commands/deploy.test.ts`**

4. **Run `npm run build`:**
   - Compiles TypeScript
   - Runs generators → updates manifest.json, AGENTS.md, schema
   - CI drift-checks → passes (artifacts regenerated)

5. **Verify:**
   ```bash
   npm test
   npm run lint
   bunny --help
   bunny manifest | jq '.commands[] | select(.name=="deploy")'
   ```

### Building

```bash
npm run build
# 1. tsc -p tsconfig.build.json    → dist/cli.js (esbuild'd later if minification needed)
# 2. tsx scripts/post-build.ts     → runs 3 generators

npm run dev
# tsx src/cli.ts (hot reload via tsx)

npm test
# vitest run (all tests, coverage report)
```

### Publishing (Phase 7)

```bash
npm version minor  # 0.1.0-alpha.0 → 0.1.0-alpha.1
npm publish        # bunny-tools@0.1.0-alpha.1 on npm
git push origin    # triggers CI
```

---

## Deferred (Phase 2+)

| Component | Why Deferred | Lands In |
|-----------|-------------|----------|
| `src/core/deploy.ts` | Needs full http/config setup | P2 |
| `src/core/zones.ts` | Storage zone CRUD | P3 |
| `src/commands/init.ts`, `auth:*`, `use` | Part of deploy loop | P2 |
| `src/mcp/` (stdio server) | Depends on all commands | P6 |
| `.bunny-state.json` (cache) | Optional optimization | P2+ |
| Live e2e tests | Use Nock indefinitely | Never |

---

## References

- **Architecture:** `docs/system-architecture.md`
- **Code Standards:** `docs/code-standards.md`
- **PDR:** `docs/project-overview-pdr.md`
- **Phase 1 Plan:** `plans/260502-1748-bunny-tools-cli/phase-01-bootstrap-foundations.md`
