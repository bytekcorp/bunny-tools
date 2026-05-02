# bunny-tools Changelog

All notable changes to bunny-tools are documented here. This changelog follows [Keep a Changelog](https://keepachangelog.com/) conventions.

---

## [Unreleased - Phase 2 (Alpha 1)]

### Planned
- Deploy loop (`bunny deploy`, `bunny purge` standalone)
- Credential management (`bunny auth set/list/clear`)
- Global setup wizard (`bunny configure`)
- Alias switching (`bunny use`)

---

## [0.1.0-alpha.0] — 2026-05-02 (Phase 1 — Bootstrap & Foundations)

### Added

#### Core Architecture
- **Registry-driven CLI** (`src/manifest/registry.ts`) — single source of truth for all command definitions
  - 47 commands declared (1 active, 46 planned stubs for phases 2–6)
  - All surfaces (help, JSON, AGENTS.md, schema, MCP defs) auto-generated from registry
  - Lazy command loading keeps cold-start <50ms
  
- **HTTP Client** (`src/api/http.ts`) — undici-based REST client with resilience
  - Auth injection: `AccessKey` header resolved per call via credential chain
  - Retry logic: 429, 502, 503, 504 → exponential backoff (base * 2^attempt, max 30s) ± 25% jitter, max 5 attempts
  - Retry-After honor: respects server-provided retry delay
  - Connection pooling: persistent undici pool per base URL
  - Binary upload/download: Buffer support for storage operations
  
- **Configuration System** (`src/config/*`)
  - `bunny.json` loader (zod-validated): deploy.publicDir, ignore, storageZone, region, concurrency, pullZones
  - `.bunnyrc` alias map (gitignored): default alias + zone/pull-zone overrides
  - Cosmiconfig-style tree walk: finds config in parent directories
  
- **Credential Resolution Chain** (`src/config/credential-resolver.ts`)
  - 4-step resolution: CLI flag → scoped env → generic env → OS keychain → JSON file → prompt
  - OS keychain integration via keytar (optional native, graceful fallback)
  - File storage: atomic writes with mode 0600 to `~/.config/bunny-tools/credentials.json`
  - Scoped resolution: `account`, `storage:<zone>`, `stream:<lib>`, `database:<name>`
  - Interactive prompt (TTY only; CI fails fast)
  
- **Error Handling** (`src/api/errors.ts`)
  - Typed error classes: `BunnyApiError`, `AuthError`, `ConfigError`, `ValidationError`
  - Bunny error parser: unpacks `{ ErrorKey, Field, Message }` JSON responses
  - No credentials in error messages (asserted via test spy)

#### Commands
- **`bunny manifest`** — outputs registry as JSON
  - `--pretty` flag for indented output
  - Used by humans, AI agents, and CI drift checks

#### Utilities
- **Logger** (`src/util/logger.ts`) — structured logging to stderr
  - `LOG_LEVEL` env control (debug, info, warn, error; default: error)
  - No credentials logged at any level
  - Optional picocolors for colored output

- **XDG-compliant paths** (`src/util/paths.ts`)
  - `~/.config/bunny-tools/` config directory
  - `~/.config/bunny-tools/credentials.json` for stored credentials
  
- **File utilities** (`src/util/fs.ts`)
  - Atomic JSON writes (write-temp-then-rename pattern)
  - JSON read with fallback to null
  - Mode enforcement for sensitive files

#### Build & Distribution
- **TypeScript strict mode** (`tsconfig.json`)
  - ES2022 target, NodeNext resolution
  - `src/` → `dist/cli.js` binary (esbuild'd)
  
- **Generated Artifacts** (auto-generated, checked in)
  - `manifest.json` — full registry as JSON (8 KB)
  - `AGENTS.md` — AI-friendly docs with command tree + curated sections (5 KB)
  - `schema/bunny.schema.json` — JSON Schema for bunny.json + per-command schemas (3 KB)
  
- **CI/CD** (GitHub Actions)
  - Matrix: Node 20.x, 22.x × ubuntu-latest, macos-latest
  - Steps: typecheck, lint, test (≥80% coverage), drift check
  - Drift check: `git diff --exit-code manifest.json AGENTS.md schema/bunny.schema.json`

#### Testing
- **Test setup** (`test/setup.ts`)
  - Vitest configuration
  - Nock integration: disables real HTTP, enforces mocked responses
  - Per-test cleanup

- **HTTP client tests** (`test/api/http.test.ts`)
  - 200 success with response parsing
  - 401 → AuthError
  - 429 with Retry-After (honored, then succeeds)
  - 500 → retried, succeeds
  - 5× 429 → exhausts retries, throws
  - Binary upload (Buffer body)

- **Config tests** (`test/config/bunny-json.test.ts`)
  - Valid bunny.json parsing
  - Invalid configs (missing publicDir, bad region, etc.)
  - Tree walk: finds config in parent directory

- **Credential tests** (`test/config/credentials.test.ts`)
  - CLI flag override
  - Scoped env vars (BUNNY_ACCOUNT_KEY, BUNNY_STORAGE_PASSWORD_<ZONE>, etc.)
  - Generic env fallback
  - Keychain read/write (mocked)
  - File store read/write with mode 0600
  - Credentials never logged (spy assertion)
  - Credential masking: `maskCredential()` shows only last 4 digits

- **Registry tests** (`test/manifest/registry.test.ts`)
  - All command names unique
  - All commands have description
  - All active commands have at least one example
  - Phase numbering consistent

- **Help rendering tests** (`test/manifest/render-help.test.ts`)
  - Text help is readable
  - JSON help is valid object
  - Round-trip: registry → JSON → shape preserved

#### Documentation
- **`docs/project-overview-pdr.md`** — Product Development Requirements
  - Problem statement, goals, non-goals
  - Target personas, success metrics
  - Architectural decisions D1–D10, constraints
  - Release cadence (weekly alphas, GA week 7)

- **`docs/system-architecture.md`** — System design
  - Layer diagram: CLI/MCP → core → api
  - Registry canonicity (all surfaces derive from it)
  - HTTP client contract + retry semantics
  - Credential resolution chain detail
  - Architectural invariants (commands/mcp only import core, not api)
  - Data flow examples (manifest command, deploy mocked)
  - Phase 1 state vs future layers

- **`docs/code-standards.md`** — Engineering rules
  - File organization (kebab-case, ≤200 LOC target)
  - Language (strict TS, ESM, no `any`)
  - Logging (stderr only, no credentials, colorized)
  - Architectural boundaries (ESLint enforced)
  - HTTP pagination (always page=1, perPage=1000)
  - Error handling patterns, zod validation
  - Test expectations (≥80% coverage, no real network)
  - Build pipeline, generators, drift check

- **`docs/codebase-summary.md`** — File map & module guide
  - Every file (13 source, 5 test) with purpose + key exports
  - Module dependency graph
  - Metrics (22ms cold-start, 1 active command, 47 stubs)
  - Development workflow (adding new commands)

- **`docs/project-roadmap.md`** — Phase timeline & planning
  - Phase 1–7 breakdown with ships-as, scope, validation
  - Slip gate (Phase 4 >2w → Phase 5 defers to v0.2)
  - Timeline (week-by-week)
  - Risks & mitigations (npm name, rate limits, scope creep)
  - Future (v0.2+): edge rules, emulator, plugins

### Technical Details

#### Package Setup
- `package.json` with bin entry `bunny` → `dist/cli.js`
- Dependencies: commander, undici, zod, keytar, picocolors, ora, ignore, fast-glob, prompts
- DevDeps: typescript, vitest, nock, @vitest/coverage-v8, eslint, prettier, esbuild, tsx
- Node 20+ engines requirement

#### Performance
- Cold-start: ~22ms (Commander baseline ~18ms, our overhead ~4ms)
- Memory: <50MB (typical)
- Binary size: ~200 KB (before minification)

#### Security
- Credentials: never logged, masked in display (last 4 digits), stored with mode 0600
- Keychain: optional native module, graceful fallback to file
- No hardcoded secrets, no telemetry, no phone-home
- ESLint enforces: no console.log (use logger), API boundary isolation

#### Compatibility
- Node 20, 22 (tested on both)
- ubuntu-latest, macos-latest (tested on both)
- Windows: untested (but should work; keytargracefully falls back)

### Fixed
- N/A (first release)

### Changed
- N/A (first release)

### Removed
- N/A (first release)

### Known Issues
- None reported

### Security
- No known vulnerabilities
- Keytar native build may fail on Linux without libsecret; falls back to file storage
- Credentials file mode 0600 enforced on POSIX systems

---

## [Unreleased - v0.2]

Planned features deferred from v0.1:

- **Edge rule sugar** (`headers`, `rewrites`, `redirects` in bunny.json)
- **Live emulator** (local Bunny simulation)
- **Plugin system**
- **Telemetry**
- **HTTP/SSE MCP transport** (stdio sufficient for v0.1)
- **Multipart upload** (single PUT covers <100MB)
- **Warm-run state caching** (`.bunny-state.json` hash-based optimization)

---

## Information for Maintainers

### Release Process
1. **Alpha releases** (`0.1.0-alpha.N`): Automated per phase; no manual approval needed
2. **RC release** (`0.1.0-rc.1`): Phase 6; manual review of docs + MCP server
3. **GA release** (`0.1.0`): Phase 7; full release notes, npm publish, GH releases page

### Version Bumping
- Alphas: `npm version prerelease --preid=alpha`
- RC: `npm version prerelease --preid=rc`
- GA: `npm version minor` (or major if breaking)

### Publishing
```bash
npm publish              # to npm registry
git tag v0.1.0          # GitHub release
git tag v1 -f           # floating tag (v1 always points to latest)
```

### Documentation Updates
- Per-phase: update `docs/project-roadmap.md` progress
- Per-release: add changelog entry (this file)
- Per-major: update README.md examples

---

## Migration Guide

### From v0.0 (Pre-release)
N/A — v0.1.0-alpha.0 is first release.

---

## Notes for Users

### Getting Started (Phase 1)
- Phase 1 is internal; only `bunny manifest` is available
- Phase 2 (week 2) brings `bunny deploy` — the main feature
- Recommend waiting for v0.1.0-alpha.1 before using in production

### Credential Setup (Future)
- Will support: `bunny configure` (global) + `bunny auth set` (per-scope)
- Phase 1 does not implement auth commands; awaits Phase 2

### Bunny API Changes
- If Bunny API changes, we update schemas in `src/config/`, `src/api/` 
- Test fixtures (Nock responses) maintained manually
- Reported issues welcome: `bytekcorp/bunny-tools` GitHub

---

## Links

- **GitHub:** https://github.com/bytekcorp/bunny-tools
- **npm:** https://www.npmjs.com/package/bunny-tools
- **Bunny API Docs:** https://bunny.net/api
- **Issues:** https://github.com/bytekcorp/bunny-tools/issues
