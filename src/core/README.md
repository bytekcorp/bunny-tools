# `src/core/` — business logic

This directory holds the typed, UI-free business logic for bunny-tools.

## Architectural invariant

`src/commands/**` and `src/mcp/**` (later) MUST call into `src/core/**`. They MUST NOT import `src/api/**` directly. ESLint enforces this boundary in `.eslintrc.cjs`.

## Rules for files in `src/core/`

- **No `console.log`, no `process.stdout.write`, no `process.exit`.** Throw or return; let the caller render or fail.
- **No `prompts`, no `ora`, no `chalk`.** UI lives in `src/ui/`; pass progress via callbacks or events.
- **Stable, typed API.** Every exported function has explicit input + output types. Inputs are validated with zod at the boundary if they came from a user.
- **Network calls go through `src/api/*` only.** No direct `fetch` / `undici.request` here.

## Why

- The CLI command (`src/commands/foo.ts`) is a thin wrapper that parses flags, calls `core.foo(...)`, and renders.
- The MCP tool (`src/mcp/tools/foo.ts`, phase 6) is a thin wrapper that validates JSON input, calls `core.foo(...)`, and serializes.
- Both layers reuse the same logic. Zero duplication. Test the core and you've tested the substance.

This file is intentional documentation; it ships nothing at runtime.
