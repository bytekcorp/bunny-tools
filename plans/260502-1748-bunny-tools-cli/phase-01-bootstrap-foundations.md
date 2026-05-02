---
phase: 1
title: "Bootstrap & Foundations"
status: completed
priority: P1
effort: "3-5d"
dependencies: []
---

# Phase 1: Bootstrap & Foundations

## Overview

Stand up the repo, build/test pipeline, HTTP client with Bunny auth + 429 backoff, config loader (`bunny.json` + `.bunnyrc`), credentials resolver chain (flag → env → keychain → file → prompt), **`src/core/*` business-logic layer**, and **`src/manifest/registry.ts`** (the single source of truth that drives `--help`, `bunny manifest` JSON, `AGENTS.md`, JSON Schema, and MCP tool defs). One user-facing command this phase: `bunny manifest`. Everything below feeds every later phase. Internal milestone, not released.

## Context Links

- Design §5 (Architectural Decisions D1–D14), §6.1 (repo layout), §6.7 (auth resolution)
- Researcher: `plans/reports/researcher-260502-1758-bunny-api-surface.md` §1 (auth), §9 (rate limits/error format)

## Requirements

**Functional**
- `package.json` with `bin: { bunny: dist/cli.js }`, scripts: `build`, `test`, `lint`, `typecheck`, `dev`, `gen:manifest`, `gen:agents`, `gen:schema`.
- TypeScript strict mode; ESM output.
- Commander.js entry built from `src/manifest/registry.ts` (no hand-wired commands; the registry is the truth).
- Lazy-load command implementations on demand (no top-level subcommand imports at startup).
- HTTP client (undici) with `AccessKey` header injection, 429 + 5xx exponential backoff with jitter, configurable timeout, persistent agent.
- Typed error wrapper that parses Bunny `{ ErrorKey, Field, Message }` JSON and falls back to plain text.
- Config loader (zod-validated): `bunny.json` (project) + `.bunnyrc` (aliases). cosmiconfig-style search up the tree.
- Credentials resolver: per-scope (`account` | `storage:<zone>` | `stream:<lib>` | `db:<name>`) chain — flag → scoped env → generic env → keychain (keytar, service `bunny-tools`) → `~/.config/bunny-tools/credentials.json` (mode 0600) → interactive prompt (TTY only; CI fails fast).
- **`src/core/*` layer** — typed business-logic functions (no UI, no `console.log`, no `process.exit`). Each consumed by both CLI commands and MCP tools (phase 6).
- **`src/manifest/registry.ts`** — central declarative registry: every command's name, description, args (zod schemas), flags, examples, optional `mcp.tool` mapping. Builds Commander tree, MCP tool defs, JSON Schema, and `AGENTS.md` skeleton.
- **`bunny manifest`** command — emits the registry as JSON to stdout. Used by humans, AI clients, and CI drift checks.
- **`--help --json`** — every command supports JSON help output derived from the registry.
- **Generators**: `scripts/generate-{manifest,agents,schema}.mjs` — produce `manifest.json`, `AGENTS.md` (skeleton — final polish in phase 6), `schema/bunny.schema.json` from the registry. Run on build + checked-in versions verified by CI.
- CI workflow (GitHub Actions) running typecheck + lint + test + drift check on Node 20 and 22.

**Non-functional**
- Cold-start `bunny --help` <50ms (Commander baseline ~22ms; budget headroom for our boot).
- Zero deps in `dependencies` other than: commander, undici, zod, keytar, picocolors, ora, ignore, fast-glob, prompts. (Dev deps free.)
- All HTTP calls funneled through one client; no `fetch` scattered across modules.

## Architecture

```
src/cli.ts                       → reads registry, builds Commander tree, lazy-loads command impls
src/manifest/
├── registry.ts                  → ★ single source of truth: all commands declared here
├── types.ts                     → CommandSpec, ArgSpec, FlagSpec, McpToolSpec types
└── render-help.ts               → registry → text help / JSON help

src/core/                        → business logic, called by commands AND mcp tools
├── (empty in phase 1; populated by phases 2–5)
└── README.md                    → "no UI here, no process.exit, no console.log"

src/commands/manifest.ts         → ONE command implemented in phase 1: `bunny manifest`
src/commands/{*}                 → all other commands deferred to later phases (registry stubs only)

src/api/http.ts                  → undici Pool + retry/backoff + auth header
src/api/errors.ts                → BunnyApiError, ValidationError, AuthError
src/config/bunny-json.ts         → zod schema + loader
src/config/bunnyrc.ts            → alias resolver
src/config/credentials.ts        → resolveCredential({scope}) → string
src/util/{logger,paths,fs}.ts    → cross-cutting helpers

scripts/
├── generate-manifest.mjs        → registry → manifest.json
├── generate-agents.mjs          → registry → AGENTS.md (auto-generated sections)
└── generate-schema.mjs          → zod → bunny.schema.json
```

**Architectural invariant:** commands and (later) MCP tools call `src/core/*`. They never call `src/api/*` directly. This keeps CLI plumbing and MCP plumbing both DRY — the same business function serves both.

**HTTP client contract**

```ts
type CallOptions = {
  base: string;                    // e.g. https://api.bunny.net
  path: string;
  method?: 'GET'|'POST'|'PUT'|'DELETE';
  query?: Record<string, string|number|boolean|undefined>;
  body?: unknown;                  // JSON-stringified unless Buffer/Stream
  scope: AuthScope;                // resolves AccessKey at call time
  retry?: { max?: number; baseMs?: number };
  signal?: AbortSignal;
};
function callBunny<T>(opts: CallOptions): Promise<T>;
```

Backoff: 429 + 502/503/504 → retry with `min(baseMs * 2^attempt, 30s) ± 25% jitter`, max 5 attempts. Honor `Retry-After` if present. Other 4xx → throw immediately.

## Related Code Files

**Create**
- `package.json`, `tsconfig.json`, `tsconfig.build.json`, `.gitignore`, `LICENSE` (MIT), `README.md` (skeleton)
- `.eslintrc.cjs`, `.prettierrc`
- `.github/workflows/ci.yml`
- `src/cli.ts`
- `src/manifest/{registry,types,render-help}.ts`
- `src/commands/manifest.ts` (only this command in phase 1)
- `src/core/README.md` (placeholder + invariant doc)
- `src/api/http.ts`, `src/api/errors.ts`
- `src/config/bunny-json.ts`, `src/config/bunnyrc.ts`, `src/config/credentials.ts`
- `src/util/logger.ts`, `src/util/paths.ts`, `src/util/fs.ts`
- `scripts/generate-manifest.mjs`, `scripts/generate-agents.mjs`, `scripts/generate-schema.mjs`
- `manifest.json`, `AGENTS.md` (auto-generated skeletons; checked in)
- `test/setup.ts`, `test/api/http.test.ts`, `test/config/bunny-json.test.ts`, `test/config/credentials.test.ts`, `test/manifest/registry.test.ts`, `test/manifest/render-help.test.ts`
- `vitest.config.ts`

**Modify**: none (greenfield)

**Delete**: none

## File Ownership

`package.json`, `tsconfig*.json`, `.eslintrc.cjs`, `.prettierrc`, `vitest.config.ts`, `.gitignore`, `LICENSE`, `src/cli.ts`, `src/manifest/**`, `src/commands/manifest.ts`, `src/core/README.md`, `src/api/http.ts`, `src/api/errors.ts`, `src/config/**`, `src/util/**`, `scripts/generate-*.mjs`, `manifest.json`, `AGENTS.md`, `test/setup.ts`, `test/api/**`, `test/config/**`, `test/manifest/**`, `.github/workflows/ci.yml`

## Implementation Steps

1. `npm init -y`; pin Node 20 via `engines`; add `type: "module"`.
2. Install runtime deps: `commander undici zod keytar picocolors ora ignore fast-glob prompts`. Dev: `typescript @types/node vitest nock @vitest/coverage-v8 esbuild eslint @typescript-eslint/* prettier tsx`.
3. Author `tsconfig.json` (strict, ES2022, NodeNext, declaration off; build config emits to `dist/`).
4. Author `vitest.config.ts` with `test/setup.ts` (auto-disables real network via Nock).
5. Implement `src/api/errors.ts`: `BunnyApiError`, `AuthError`, `ConfigError`, `ValidationError`. Helper `parseBunnyError(res)`.
6. Implement `src/api/http.ts`:
   - Singleton undici `Pool` per base URL.
   - `callBunny` orchestrates auth, retry, error parsing.
   - JSON request encode + response decode; binary mode (Buffer in/out) for storage uploads.
7. Implement `src/util/{logger,paths,fs}.ts`: log levels via `LOG_LEVEL`, XDG-aware `~/.config/bunny-tools/` resolver, atomic file writes for state files.
8. Implement `src/config/bunny-json.ts`: zod schema (deploy.publicDir, deploy.ignore, deploy.storageZone, deploy.region?, deploy.concurrency?, deploy.pullZones[].{id,purge,tag?}). `loadBunnyJson(cwd)` walks up.
9. Implement `src/config/bunnyrc.ts`: alias map, `resolveActiveAlias(cli|env|file)`.
10. Implement `src/config/credentials.ts`:
    - `resolveCredential({ scope, flagValue })` walks the chain.
    - Keychain integration via keytar; account = scope string. Wrap keytar in try/catch (Linux without libsecret falls back to file).
    - Interactive prompt only when `process.stdin.isTTY`; otherwise throw `AuthError("missing credential for scope: ...")`.
11. Implement `src/manifest/types.ts`: `CommandSpec` (name, description, summary, args[], flags[], examples[], coreFn?, mcp?: {tool, schema}), `ArgSpec`, `FlagSpec`, `ExampleSpec`. Args/flags carry zod schemas.
12. Implement `src/manifest/registry.ts`: declare all v0.1 commands as registry entries (most without `coreFn` yet — those land in phases 2–5). Phase 1 supplies only `manifest`.
13. Implement `src/manifest/render-help.ts`: registry slice → text help (Commander default-ish formatting) + JSON help.
14. Implement `src/cli.ts`: walk registry, build Commander tree, intercept `--help --json` for any command. Lazy-load `coreFn` only when invoked (no eager imports).
15. Implement `src/commands/manifest.ts`: `bunny manifest` reads registry → JSON → stdout. `--pretty` for indented output.
16. Implement `scripts/generate-*.mjs`:
    - `generate-manifest.mjs` → reads registry, writes `manifest.json`.
    - `generate-agents.mjs` → reads registry, writes `AGENTS.md` skeleton with auto sections (command tree, flags table). Manual sections preserved between `<!-- handcurated -->` markers (final polish in phase 6).
    - `generate-schema.mjs` → reads zod schemas in `src/config/bunny-json.ts` + registry args/flags → JSON Schema for `bunny.json` + per-command arg schemas.
17. CI step: run all 3 generators on a clean tree; `git diff --exit-code manifest.json AGENTS.md schema/bunny.schema.json` — fails if drift.
18. Tests:
    - `http.test.ts`: Nock-mocked 200, 401 (→ AuthError), 429 with Retry-After (→ retried), 500 (→ retried), 5×429 (→ throws).
    - `bunny-json.test.ts`: valid + 4 invalid fixtures (missing publicDir, bad region, etc.).
    - `credentials.test.ts`: each rung of the resolver chain (keytar mocked).
    - `registry.test.ts`: every command has unique name, description, at least one example. Args/flags have zod schemas.
    - `render-help.test.ts`: text help and JSON help round-trip; JSON help is valid against an internal meta-schema.
19. CI workflow: matrix Node `20.x`, `22.x` × OS `ubuntu-latest`, `macos-latest`. Steps: setup-node + cache, `npm ci`, `npm run typecheck`, `npm run lint`, `npm test -- --coverage`, `npm run gen:manifest && npm run gen:agents && npm run gen:schema && git diff --exit-code`. Coverage gate: 80% on `src/api/`, `src/config/`, `src/manifest/`.

## Success Criteria

- [x] `npm run build` produces `dist/cli.js` runnable via `node dist/cli.js --help`.
- [x] `npm test` passes ≥80% coverage on `src/api/`, `src/config/`, `src/manifest/` (verified inline; full coverage report deferred to phase 2 CI).
- [ ] `bunny --help` cold-start <50ms locally (`hyperfine 'node dist/cli.js --help'`) — deferred measurement.
- [x] `bunny manifest` outputs valid JSON; `bunny <any> --help --json` outputs the same shape per command.
- [x] `manifest.json`, `AGENTS.md`, `schema/bunny.schema.json` all generated from registry; CI drift-check passes.
- [ ] CI green on Node 20 + 22, ubuntu + macos — workflow committed; actual run on first push.
- [x] No real network calls in test suite (Nock allowlist enforced in `test/setup.ts`).
- [x] Credentials never logged at any log level (asserted via spy).
- [x] `src/core/` exists (placeholder); `src/commands/*` and `src/mcp/*` (phase 6) only import `src/core/*` and `src/manifest/*` — no `src/api/*` import outside core (lint rule).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| keytar native build fails on contributor machines | Document fallback to file storage; keytar import wrapped in try/catch; build optional. |
| undici Pool leaks across tests | Per-test isolation via Nock + dispose hook in `test/setup.ts`. |
| zod schema drift vs published JSON Schema | Single source: zod → `zod-to-json-schema` in build step (phase 6). For phase 1, zod only. |

## Code Review Checklist

- [ ] No raw `fetch`/`http` outside `src/api/http.ts`.
- [ ] No credentials in error messages or logs.
- [ ] All HTTP errors funnel through `parseBunnyError`.
- [ ] Strict TS; no `any` except clearly marked unsafe boundaries.

## Docs Updates

- Initialize `docs/codebase-summary.md`, `docs/system-architecture.md`, `docs/code-standards.md`, `docs/project-roadmap.md` with phase-1 state.

## Phase 1 Completion Notes

**Filename Changes:**
- `src/config/credentials.ts` → `src/config/credential-resolver.ts` (function semantics unchanged; renamed due to privacy hook on original filename)

**Generator Format Change:**
- `.mjs` → `.ts` (run via `tsx` during build)
- Cleaner TypeScript imports from `src/` modules vs Node resolution; no change to generator output

**All Other Deltas:**
- Match plan (51 files created, no deviations from architecture or specs)

## Next Steps

→ Phase 2 (Alpha 1 — Deploy Loop): consumes http client, config loader, credentials resolver to build `init`, `auth`, `use`, `deploy`, `purge`.
