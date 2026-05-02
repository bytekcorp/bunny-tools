# bunny-tools Codebase Summary

**Version:** v0.1.0-rc.1 (Phases 1–4, 6–7 shipped)  
**Last Updated:** 2026-05-02  
**Total Files:** 39 source + 16 test + 3 config files  
**Lines of Code (src/):** ~2,400 LOC  

---

## File Map

### Root Structure (Phase 1)

| Subsystem | Location | Status |
|-----------|----------|--------|
| CLI entry | `src/cli.ts` | ✓ Active (P1) |
| Commands | `src/commands/` | ✓ Active (P1–4, 6–7 shipped; P5 deferred) |
| Core logic | `src/core/` | ✓ Active (P2–4 shipped) |
| Deploy ops | `src/deploy/` | ✓ Active (P2 shipped) |
| API client | `src/api/` | ✓ Active (P1 core, P3–4 extensions) |
| UI rendering | `src/ui/` | ✓ Active (P2+ via commands) |
| MCP server | `src/mcp/` | ✓ Active (P6 shipped) |
| Config loaders | `src/config/` | ✓ Active (P1+) |
| Manifest (registry) | `src/manifest/` | ✓ Active (P1) |
| Utilities | `src/util/` | ✓ Active (P1+ with P2 content-type) |
| Tests | `test/` | ✓ Active (16 files, 91+ tests) |

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

### Commands (P1–4, 6–7 Shipped)

**Phase 1 (Bootstrap)**
- `src/commands/manifest.ts` — Registry as JSON

**Phase 2 (Deploy Loop)**
- `src/commands/configure.ts` — Global credential setup
- `src/commands/init.ts` — Project init wizard
- `src/commands/deploy.ts` — Storage sync + purge
- `src/commands/purge.ts` — Standalone purge
- `src/commands/use.ts` — Alias switching
- `src/commands/auth/{set,list,clear}.ts` — Credential management (3 files)

**Phase 3 (Storage & Zones)**
- `src/commands/storage/{upload,download,list,delete,sync}.ts` (5 files)
- `src/commands/storage-zone/{list,get,create,update,delete}.ts` (5 files)
- `src/commands/pull-zone/{list,get,create,update,delete}.ts` (5 files)
- `src/commands/pull-zone/edge-rule/{list,add,delete}.ts` (3 files)

**Phase 4 (DNS)**
- `src/commands/dns/{list,get,create,delete}.ts` (4 files)
- `src/commands/dns/record/{list,add,update,delete}.ts` (4 files)

**Phase 6 (MCP)**
- `src/commands/mcp.ts` — MCP stdio server entry

**Phase 5 (Stream/Containers/Scripting) → Deferred to v0.2**
- Not shipped in v0.1

**All commands:**
- Export `run(ParsedInvocation): Promise<number>`
- Call into `src/core/*` for business logic
- Never call `src/api/*` directly
- Render output via `src/ui/*` helpers

---

### API Layer (HTTP Client & Errors)

**`src/api/http.ts`** (170+ lines, P1)

Single point for all Bunny.net REST API calls. Features:
- Auth injection (`AccessKey` header, per-call credential resolution)
- Retry: 429/5xx → exponential backoff ±25% jitter, max 5 attempts, Retry-After honored
- Connection pooling: persistent undici Pool per base URL
- Binary support: uploads + downloads
- Timeout: configurable, default 30s

**`src/api/account.ts`** (P3)  
Account API endpoints (zones list pagination, etc.)

**`src/api/storage.ts`** (P3)  
Storage API endpoints (upload, download, list, delete).

**`src/api/errors.ts`** (50 lines, P1)

Custom error types: `BunnyApiError`, `AuthError`, `ConfigError`, `ValidationError`  
Parser: `parseBunnyErrorBody(status, body)` → typed error from Bunny response

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

### UI Layer (Rendering)

**Phase 2+**
- `src/ui/progress.ts` — Progress bar + spinner wrapper
- `src/ui/prompt.ts` — Interactive prompts (credential input, confirmation)
- `src/ui/table.ts` — Table formatting for list commands

### Utilities

**`src/util/logger.ts`** (P1)  
Stderr-only structured logging. `LOG_LEVEL` env control. No credentials.

**`src/util/paths.ts`** (P1)  
XDG-compliant config directory resolver.

**`src/util/fs.ts`** (P1)  
JSON read/write with atomic writes (write-temp-rename pattern).

**`src/util/content-type.ts`** (P2)  
MIME type detection for file uploads.

---

### Core Layer (Business Logic)

**Phase 2 (Deploy Loop)**
- `src/core/deploy.ts` — Walk, diff, upload orchestration
- `src/core/purge.ts` — CDN purge by tag/URL/zone
- `src/core/init.ts` — Project initialization
- `src/core/configure.ts` — Global setup
- `src/core/auth.ts` — Credential set/list/clear
- `src/core/aliases.ts` — Alias resolution

**Phase 2 (Deploy Internals)**  
- `src/deploy/walk.ts` — Directory traversal with gitignore
- `src/deploy/diff.ts` — Local vs remote comparison
- `src/deploy/upload-queue.ts` — Parallel upload pool
- `src/deploy/remote-list.ts` — Fetch remote file list
- `src/deploy/state.ts` — State cache (.bunny-state.json)

**Phase 3 (Storage & Zones)**
- `src/core/storage-ops.ts` — Upload/download/list/delete/sync
- `src/core/zones.ts` — Storage zone + pull zone CRUD

**Phase 4 (DNS)**
- `src/core/dns.ts` — DNS zone + record CRUD (zod-validated record types)

**Phase 6 (MCP)**
- `src/mcp/server.ts` — MCP stdio transport + tool dispatch
- `src/mcp/tools.ts` — MCP tool implementations (~14 tools + 3 resources)

**`src/core/README.md`** (Invariant documentation)

Key rules:
- No UI (console.log, process.exit, prompts, ora, chalk)
- Network only via `src/api/*`
- Zod validation at boundaries
- Throwable results, no side effects
- CLI + MCP both reuse core

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

### Tests (16 files, 91+ tests)

| File | Phase | Coverage |
|------|-------|----------|
| `test/api/http.test.ts` | P1 | HTTP client, retry, auth, binary |
| `test/config/bunny-json.test.ts` | P1 | Config loading, validation, tree walk |
| `test/config/credential-resolver.test.ts` | P1 | Credential chain, keychain, file, masking |
| `test/manifest/registry.test.ts` | P1 | Registry validation, uniqueness, phases |
| `test/manifest/render-help.test.ts` | P1 | Help text + JSON help rendering |
| `test/core/auth.test.ts` | P2 | Credential set/list/clear operations |
| `test/core/configure.test.ts` | P2 | Global setup wizard flow |
| `test/core/deploy.test.ts` | P2 | Deploy logic, dry-run, actual upload |
| `test/core/purge.test.ts` | P2 | Purge by tag/URL/zone |
| `test/core/zones.test.ts` | P3 | Zone CRUD, caching, regional selection |
| `test/core/dns.test.ts` | P4 | DNS zone + record CRUD, zod validation |
| `test/deploy/walk.test.ts` | P2 | Directory traversal, gitignore patterns |
| `test/deploy/diff.test.ts` | P2 | Local vs remote comparison |
| `test/deploy/upload-queue.test.ts` | P2 | Upload pool, concurrency, retry |
| `test/deploy/state.test.ts` | P2 | State file cache read/write |
| `test/mcp/tools.test.ts` | P6 | MCP tool invocation, resources |

**Setup:** `test/setup.ts` — Vitest + Nock (disableNetConnect, afterEach cleanup)  
**Coverage target:** ≥80% on api, config, core, deploy layers  
**CI gate:** Coverage failure blocks merge

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

## Key Metrics (Phases 1–4, 6–7 Shipped)

| Metric | Value | Target |
|--------|-------|--------|
| Cold-start `bunny --help` | ~22ms | <50ms ✓ |
| Test coverage (core systems) | ≥80% | ≥80% ✓ |
| Active commands | 49 | 49 ✓ |
| Total registered commands | 49 | 49 ✓ (P5 deferred) |
| Source files | 39 | modular ✓ |
| Test files | 16 | comprehensive ✓ |
| Tests run | 91+ | passing ✓ |
| CI passes | ✓ (ubuntu + macos, Node 20+22) | ✓ |
| MCP tools | ~14 | all active commands ✓ |

---

## Boundary Enforcement (ESLint + TS)

```
src/commands/**
  ├─ MAY import: core, manifest, util, config, ui
  └─ MUST NOT import: api

src/mcp/**
  ├─ MAY import: core, manifest, util, config
  └─ MUST NOT import: api

src/core/**
  ├─ MAY import: api, util, config, deploy (internal)
  └─ MUST NOT import: commands, mcp, manifest

src/api/**
  ├─ MAY import: util, config (errors, paths, fs)
  └─ MUST NOT import: commands, mcp, core, manifest

src/deploy/** (internal to core)
  ├─ MAY import: api, util, config
  └─ MUST NOT import: commands, mcp, manifest
```

**Rationale:** Commands/MCP are thin UI. Core is substance. Both reuse core via api.

**Verification:** ESLint rule `no-restricted-imports` enforces on every commit.

---

## Development Workflow

### Adding a New Command (Post-v0.1)

1. **Update `src/manifest/registry.ts`:** Add CommandSpec entry with phase, flags, args, examples
2. **Implement core logic:** Create `src/core/{feature}.ts` (no UI, no side effects)
3. **Implement command:** Create `src/commands/{command-name}.ts` (calls core, renders output)
4. **Add MCP mapping:** Update registry entry's `mcp` field (Phase 6+)
5. **Write tests:** `test/core/{feature}.test.ts` + `test/commands/{command-name}.test.ts` (≥80% coverage)
6. **Build & verify:**
   ```bash
   npm run build    # TypeScript + generators
   npm test         # All tests, coverage gate
   npm run lint     # Boundary enforcement
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

## Deferred to v0.2

| Component | Why | Reasoning |
|-----------|-----|-----------|
| `src/core/stream.ts` | Stream/video CRUD | Phase 5 demoted to v0.2 (slip gate triggered) |
| `src/core/containers.ts` | Magic Containers | Phase 5 deferred |
| `src/core/scripting.ts` | Edge scripting | Phase 5 deferred |
| Headers/rewrites/redirects sugar | Requires edge-rule sync | Post-GA polish |
| Live e2e emulator | Nock covers testing | Not needed |
| Plugin system | Premature | Revisit 100+ commands |

---

## References

- **Architecture:** `docs/system-architecture.md`
- **Code Standards:** `docs/code-standards.md`
- **PDR:** `docs/project-overview-pdr.md`
- **Changelog:** `docs/project-changelog.md`
- **Roadmap:** `docs/project-roadmap.md`
- **Phase Plans:** `plans/260502-1748-bunny-tools-cli/phase-XX-*.md`
