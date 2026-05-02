# bunny-tools Code Standards & Engineering Rules

**Version:** Phases 1–4, 6–7 shipped  
**Last Updated:** 2026-05-02

---

## Principles

**YAGNI** (You Aren't Gonna Need It) — don't build for v0.2 in v0.1  
**KISS** (Keep It Simple, Stupid) — favor clarity over cleverness  
**DRY** (Don't Repeat Yourself) — extract to `src/core/*` when used 2+ places

---

## File Organization

### Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| TypeScript source | kebab-case | `credential-resolver.ts`, `render-help.ts` |
| Test files | `{source}.test.ts` | `http.test.ts` |
| Build scripts | kebab-case .mjs | `post-build.ts`, `generate-manifest.mjs` |
| Directories | kebab-case | `src/api/`, `src/manifest/` |

**Rationale:** Self-documenting names help LLM tools (Grep, Glob) understand purpose without reading content.

### File Size

**Target:** ≤200 lines per file (strict for `src/`, lenient for tests)

When a file approaches 200 LOC:
1. Identify logical boundaries (functions, classes, concerns)
2. Extract cohesive units to sibling modules
3. Prefer composition (shared functions) over inheritance

**Rationale:** Smaller files → easier to understand, test, review; fits in single LLM context window.

### Directory Structure

```
src/
├── cli.ts                     # Commander entry, registry reader, lazy loader
├── commands/
│   └── manifest.ts            # One file per active command
├── core/
│   ├── README.md              # Invariant doc: no UI, no network direct calls
│   └── (populated P2+)         # deploy.ts, zones.ts, etc.
├── api/
│   ├── http.ts                # undici client, retry, auth injection
│   └── errors.ts              # BunnyApiError, AuthError, etc.
├── config/
│   ├── bunny-json.ts          # zod schema + loader
│   ├── bunnyrc.ts             # alias resolver
│   └── credential-resolver.ts # 4-step chain + keychain wrapper
├── manifest/
│   ├── registry.ts            # ★ Single source of truth
│   ├── types.ts               # CommandSpec, ArgSpec, FlagSpec
│   └── render-help.ts         # text help, JSON help from registry
└── util/
    ├── logger.ts              # stderr only, LOG_LEVEL env
    ├── paths.ts               # XDG-compliant config dir
    └── fs.ts                  # atomic writes, JSON helpers

test/
├── setup.ts                   # Vitest config, Nock disable
├── api/http.test.ts
├── config/bunny-json.test.ts
├── config/credentials.test.ts
├── manifest/registry.test.ts
└── manifest/render-help.test.ts

scripts/
├── post-build.ts              # called after tsc; runs generators
├── generate-manifest.mjs      # registry → manifest.json
├── generate-agents.mjs        # registry → AGENTS.md
└── generate-schema.mjs        # zod schemas → bunny.schema.json
```

---

## Language & Syntax

### TypeScript

**Config:** `tsconfig.json` with strict mode enabled

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "NodeNext",
    "declaration": false,
    "outDir": "dist",
    "sourceMap": false,
    "skipLibCheck": true
  }
}
```

**Key rules:**
- Strict mode: no `any` without justification comment
- ESM only: `import`/`export`, no CommonJS `require`
- `.js` extension in imports (bundler/Node requirement)
- No `declare` statements in source files

### Naming

| Entity | Convention | Example |
|--------|-----------|---------|
| Files | kebab-case | `credential-resolver.ts` |
| Types | PascalCase | `CommandSpec`, `BunnyApiError` |
| Functions/vars | camelCase | `resolveCredential()`, `configDir` |
| Constants | UPPER_SNAKE | `DEFAULT_RETRY`, `KEYCHAIN_SERVICE` |
| Private (module scope) | underscore prefix | `_internal`, `_parseError()` |

### Imports

**Preferred order:**
1. Node builtins (`fs`, `path`, `http`)
2. npm packages (`undici`, `zod`, `commander`)
3. Relative imports from sibling/parent modules

```ts
import { request } from 'undici';
import { z } from 'zod';
import type { AuthScope } from '../api/http.js';
import { logger } from '../util/logger.js';
```

**Import paths:**
- Always use full `.js` extension (bundler requirement)
- Prefer relative paths within `src/`
- Never `..` more than 2 levels; if needed, split the file

---

## Logging & Output

### Rule: Stderr Only

**All logging → stderr.** stdout is reserved:
- `bunny manifest` → JSON to stdout
- MCP server → JSON-RPC messages to stdout
- Everything else: debug, info, warn, error → stderr

**Enforced via ESLint:** No `console.log` anywhere in codebase.

```ts
import { logger } from '../util/logger.js';

logger.debug('Processing file: %s', path);
logger.info('Deployed 42 files in 2.3s');
logger.warn('Rate limit approaching (600/1000 requests)');
logger.error('Failed to resolve credential for account scope');
```

### Log Levels

Controlled via `LOG_LEVEL` environment variable:

| Level | Output | Use Case |
|-------|--------|----------|
| `error` (default) | Errors only | Production |
| `warn` | Errors + warnings | Debugging rate limits, auth issues |
| `info` | Errors + info | Normal user operation (not used in P1) |
| `debug` | All | Development, troubleshooting keytar fallback |

### Credential Handling

**Never log credentials at ANY level.**

✗ **Bad:**
```ts
logger.debug(`Resolved credential: ${credential}`);
logger.info(`Auth scope: account, Key: ${key}`);
```

✓ **Good:**
```ts
logger.debug(`Resolved credential for account scope`);
logger.info(`Auth scope: account (masked: ${maskCredential(key)})`);
```

**Tested via spy:** `test/config/credentials.test.ts` asserts credentials never appear in logs.

---

## Architectural Boundaries

### Core Invariant: Commands/MCP → Core → API

**Enforced via ESLint rule (`no-restricted-imports`):**

| Source | MAY import | MUST NOT import |
|--------|-----------|-----------------|
| `src/commands/**` | core, manifest, util, config | api |
| `src/mcp/**` | core, manifest, util, config | api |
| `src/core/**` | api, util, config | commands, mcp, manifest |
| `src/api/**` | util | commands, mcp, core, manifest |

**Why:** Commands and MCP tools are UI wrappers. Core is the substance. Both reuse core; neither imports api directly. This prevents coupling between plumbing layers.

**Verification:** CI runs eslint before tests.

### No Side Effects in Core

`src/core/*` functions must be:
- **Pure:** same inputs → same outputs (modulo network)
- **Typeful:** explicit arg + return types
- **Validating:** zod at boundaries
- **Stateless:** no instance variables, no closure state
- **Transparent:** throw on errors, return results

✗ **Bad (belongs in command layer):**
```ts
export async function deploy(config: Config): Promise<void> {
  const spinner = ora('Deploying...').start();
  try {
    await uploadFiles(...);
    spinner.succeed('Done');
  } catch (err) {
    spinner.fail('Failed');
    process.exit(1);
  }
}
```

✓ **Good (core function):**
```ts
export async function deploy(config: Config): Promise<DeployResult> {
  const plan = computePlan(config);  // no side effects
  const result = await executeUploads(plan);  // network only
  return result;  // caller renders spinner, handles exit
}
```

**Command layer wraps:**
```ts
export async function run({ flags, raw }: ParsedInvocation): Promise<number> {
  const config = loadBunnyJson();
  const spinner = ora('Deploying...').start();
  try {
    const result = await core.deploy(config);
    spinner.succeed(`Deployed ${result.count} files`);
    return 0;
  } catch (err) {
    spinner.fail(err.message);
    return 1;
  }
}
```

---

## HTTP & Network

### Single Client

**All HTTP goes through `src/api/http.ts`.**

No direct `fetch`, `undici.request`, or `http.request` elsewhere.

```ts
import { callBunny } from '../api/http.js';

const zones = await callBunny({
  base: 'https://api.bunny.net',
  path: '/storagezone',
  method: 'GET',
  query: { page: 1, perPage: 1000 },
  scope: { kind: 'account' },
  retry: { max: 5, baseMs: 500 },
});
```

### Pagination Contract

**Always:** `page=1, perPage=1000`  
**Never:** `page=0`

Bunny's footgun: `page=0` returns objects instead of arrays on empty. Always start at page 1.

```ts
let allResults = [];
let page = 1;
while (true) {
  const batch = await callBunny({
    query: { page, perPage: 1000 },
  });
  if (!batch.length) break;
  allResults.push(...batch);
  page++;
}
```

### List Commands

**Pattern:** All `*:list` commands support `--json` flag.

```ts
// src/commands/storage/list.ts
export async function run({ flags }: ParsedInvocation): Promise<number> {
  const items = await core.listStorageItems(...);
  if (flags.json) {
    console.log(JSON.stringify(items));
  } else {
    renderTable(items);
  }
  return 0;
}
```

### Destructive Operations

**Always require `--yes` flag in non-interactive shells.**

```ts
// src/commands/storage/delete.ts
export async function run({ flags }: ParsedInvocation): Promise<number> {
  if (!flags.yes && !process.stdin.isTTY) {
    throw new Error('Destructive op requires --yes or interactive terminal');
  }
  if (!flags.yes) {
    const confirmed = await promptConfirm('Really delete?');
    if (!confirmed) return 1;
  }
  await core.deleteFile(...);
  return 0;
}
```

### Retry & Backoff

**Retryable (429, 502, 503, 504):**
- Exponential backoff: `min(baseMs * 2^attempt, 30s) ± 25% jitter`
- Honor `Retry-After` header if present
- Max 5 attempts (default)

**Non-retryable (other 4xx, 3xx):**
- Throw immediately

**Example:**
```ts
const opts: CallOptions = {
  base: 'https://api.bunny.net',
  path: '/pullzone/12345',
  method: 'DELETE',
  scope: { kind: 'account' },
  retry: { max: 5, baseMs: 500 },  // default; override if needed
};
```

---

## Error Handling

### Error Types

```ts
// API error (from Bunny response)
class BunnyApiError extends Error {
  statusCode: number;
  errorKey?: string;
  field?: string;
}

// Auth failed (credential missing/invalid)
class AuthError extends Error {}

// Config missing/invalid (bunny.json, .bunnyrc)
class ConfigError extends Error {}

// Validation failed (zod schema)
class ValidationError extends Error {}
```

### Parsing Bunny Errors

All HTTP errors parsed through `parseBunnyErrorBody()`:

```ts
// Bunny returns: { ErrorKey: "...", Field?: "...", Message?: "..." }
// We parse and throw typed BunnyApiError

function parseBunnyErrorBody(status: number, body: unknown): Error {
  if (typeof body === 'object' && body !== null) {
    const { ErrorKey, Field, Message } = body as Record<string, unknown>;
    const err = new BunnyApiError(Message || ErrorKey || 'Unknown error');
    err.statusCode = status;
    err.errorKey = ErrorKey;
    err.field = Field;
    return err;
  }
  return new BunnyApiError(`HTTP ${status}: ${JSON.stringify(body)}`);
}
```

### Throwing vs Returning

**In core:** throw errors, return results
**In commands:** catch, render, exit

```ts
// Core
export async function deploy(config: Config): Promise<DeployResult> {
  if (!config.publicDir) throw new ConfigError('publicDir required');
  // ...
}

// Command
try {
  const result = await core.deploy(config);
  logger.info(`Deployed ${result.count} files`);
  return 0;
} catch (err) {
  if (err instanceof ConfigError) {
    logger.error(`Config error: ${err.message}`);
  } else {
    logger.error(`Unexpected error: ${err.message}`);
  }
  return 1;
}
```

---

## Validation with Zod

**Use zod for:**
- User inputs (`bunny.json`, `.bunnyrc`, CLI args/flags, env vars)
- API responses (when shape is known)

**Don't use zod for:**
- Internal function contracts (explicit TS types sufficient)
- Things that never change (hardcoded constants)

### Example: bunny.json Validation

```ts
import { z } from 'zod';

const BunnyJsonSchema = z.object({
  deploy: z.object({
    publicDir: z.string().min(1),
    ignore: z.array(z.string()).optional(),
    storageZone: z.string().min(1),
    region: z.string().optional(),
    concurrency: z.number().int().min(1).max(16).optional(),
    pullZones: z.array(z.object({
      id: z.number().int().min(1),
      purge: z.enum(['tag:', 'all', 'none']).optional(),
      tag: z.string().optional(),
    })).optional(),
  }),
});

export async function loadBunnyJson(cwd: string): Promise<BunnyJson> {
  const raw = JSON.parse(await fs.readFile('bunny.json', 'utf8'));
  try {
    return BunnyJsonSchema.parse(raw);
  } catch (err) {
    throw new ConfigError(`Invalid bunny.json: ${err.message}`);
  }
}
```

---

## Testing

### Stack

- **Runner:** Vitest
- **Mocking:** Nock (HTTP mocking)
- **Coverage:** @vitest/coverage-v8

### Setup: `test/setup.ts`

Disables all real HTTP:

```ts
import nock from 'nock';

// Disable real network
nock.disableNetConnect();

// After each test, cleanup
afterEach(() => {
  nock.cleanAll();
});
```

### Coverage Gate

**Target: ≥80% on:**
- `src/api/*`
- `src/config/*`
- `src/manifest/*`

Checked in CI: `npm run test:coverage` fails if below 80%.

### Test Naming

```ts
// ✓ Clear, describes behavior
describe('resolveCredential', () => {
  it('returns flag value if provided', async () => { ... });
  it('falls back to BUNNY_ACCOUNT_KEY env if flag missing', async () => { ... });
  it('throws AuthError if no credential found', async () => { ... });
});

// ✗ Vague
describe('credential-resolver', () => {
  it('works', async () => { ... });
  it('test 2', async () => { ... });
});
```

### Mocking HTTP Responses

```ts
import nock from 'nock';
import { callBunny } from '../api/http.js';

it('retries on 429 with Retry-After', async () => {
  nock('https://api.bunny.net')
    .get('/storagezone')
    .reply(429, {}, { 'Retry-After': '2' })
    .get('/storagezone')
    .reply(200, [{ Id: 1, Name: 'zone-1' }]);

  const result = await callBunny({
    base: 'https://api.bunny.net',
    path: '/storagezone',
    scope: { kind: 'account' },
  });

  expect(result).toEqual([{ Id: 1, Name: 'zone-1' }]);
});
```

### No Real Network in Tests

✗ **Bad:**
```ts
it('deploys to real Bunny', async () => {
  const result = await callBunny({
    base: 'https://api.bunny.net',
    path: '/storagezone',
    scope: { kind: 'account' },
  });
  expect(result).toBeDefined();
});
```

✓ **Good:**
```ts
it('calls storage zone API', async () => {
  nock('https://api.bunny.net')
    .get('/storagezone')
    .reply(200, []);

  const result = await callBunny({
    base: 'https://api.bunny.net',
    path: '/storagezone',
    scope: { kind: 'account' },
  });

  expect(result).toEqual([]);
});
```

---

## Build & Distribution

### Build Pipeline

```bash
npm run build
# 1. tsc -p tsconfig.build.json  → compiles src/ → dist/
# 2. tsx scripts/post-build.ts   → runs generators
```

### Post-Build Generators

Three generators run automatically:

1. **`generate-manifest.mjs`** → `manifest.json`
2. **`generate-agents.mjs`** → `AGENTS.md`
3. **`generate-schema.mjs`** → `schema/bunny.schema.json`

All read `src/manifest/registry.ts` and produce checked-in artifacts.

### CI Drift Check

In `.github/workflows/ci.yml`:

```yaml
- run: npm run build
- run: git diff --exit-code manifest.json AGENTS.md schema/bunny.schema.json
```

If generated artifacts differ from checked-in ones, CI fails. Prevents manual edits to generated files.

---

## Generated Artifacts

**Checked into git:**
- `manifest.json` — registry as JSON
- `AGENTS.md` — command tree + human-curated sections
- `schema/bunny.schema.json` — JSON Schema for bunny.json

**Not edited by hand.** Regenerated on every build.

**Structure:** Handcurated sections preserved in AGENTS.md between markers:

```markdown
<!-- HANDCURATED:START -->
[User writes/edits this section]
<!-- HANDCURATED:END -->

<!-- AUTO:START -->
[Auto-generated command tree, overwritten on build]
<!-- AUTO:END -->
```

---

## Performance

### Cold-Start Budget

`bunny --help` must complete <50ms (measured locally via `hyperfine`).

| Component | Target |
|-----------|--------|
| Node startup | ~5ms |
| Load bundled JS | ~5ms |
| Parse registry | ~3ms |
| Build Commander tree | ~2ms |
| Render help | ~0.5ms |
| **Total** | <20ms (lots of headroom) |

### Warm-Start (Credential Cache)

Phase 2+ will cache zone→region lookups to `.bunny-state.json` (gitignored) for fast subsequent runs.

---

## Linting & Formatting

### ESLint

```bash
npm run lint
```

**Key rules:**
- No `console.log` (use logger)
- No `any` without comment
- No unused variables
- No `var` (use `const`/`let`)
- No `require` (use ESM)
- No `..` imports >2 levels
- Boundary: commands/mcp must not import api

### Prettier

```bash
npm run format
```

No strict formatting rules; Prettier handles.

---

## MCP-Specific Rules

### MCP Tools (Phase 6)

**Pattern:** All tools are wrappers around `src/core/*` functions.

**Critical:** MCP uses stdout for JSON-RPC transport. NEVER write to stdout in MCP tools.

✗ **Bad:**
```ts
export async function deploy(args) {
  console.log('Starting deploy...');  // BREAKS MCP JSON-RPC!
  await core.deploy(args);
}
```

✓ **Good:**
```ts
export async function deploy(args) {
  logger.info('Starting deploy...');  // Logs to stderr
  const result = await core.deploy(args);
  return result;  // Return tool result, not log
}
```

### MCP Resources

**Pattern:** Read-only resources expose registry, AGENTS.md, current config (redacted).

**Security:** Never expose credentials in resources. Mask sensitive fields.

---

## Code Review Checklist

Before merging, verify:

- [ ] No raw HTTP outside `src/api/http.ts` (callBunny only)
- [ ] No credentials in error messages or logs
- [ ] All HTTP errors funnel through `parseBunnyErrorBody`
- [ ] Strict TS; no `any` without justification
- [ ] Commands/MCP only import core/manifest/util/config/ui, NOT api
- [ ] Core logic has no side effects (no UI, no exit, no console)
- [ ] List commands support `--json` flag
- [ ] Destructive ops require `--yes` in non-TTY
- [ ] DNS record types zod-validated before API call
- [ ] Tests cover happy path + error cases + boundary conditions
- [ ] No real network calls in tests (Nock enforced)
- [ ] MCP tools never write stdout (stderr only)
- [ ] Pagination always page=1, perPage=1000
- [ ] Commit message follows conventional commits

---

## Commit Messages

Use conventional commits:

```
feat: add bunny deploy command with dry-run support
fix: handle 429 rate limit with Retry-After header
refactor: extract zone-cache logic to src/core/zones.ts
test: add 80% coverage for http client retry logic
docs: update architecture diagram for Phase 2
chore: bump Commander to 12.0
```

No AI references. Focus on the "why," not just the "what."

---

## Documentation

### Code Comments

Only comment **why**, not **what**. Code is the what.

✗ **Bad:**
```ts
// Add 1 to count
count++;
```

✓ **Good:**
```ts
// Bunny pagination is 1-indexed; increment for next batch
page++;
```

### Module Docstrings

Each module starts with a one-line purpose:

```ts
// Credential-resolver chain: flag → scoped env → generic env → keychain → file → prompt.
// This module reads/writes the *location* of credentials at runtime; it never embeds them.

import { ... };
```

### Function Docstrings (JSDoc for public APIs)

```ts
/**
 * Resolve a credential for the given scope, walking the chain:
 * 1) Explicit CLI flag override
 * 2) Scoped environment variables (BUNNY_ACCOUNT_KEY, etc.)
 * 3) OS keychain via keytar
 * 4) File store (~/.config/bunny-tools/credentials.json)
 * 5) Interactive prompt (TTY only)
 * 
 * Throws AuthError if no credential found and not TTY.
 */
export async function resolveCredential(scope: AuthScope): Promise<string>;
```

---

## References

- `.eslintrc.cjs` — linting rules
- `.prettierrc` — formatting rules
- `tsconfig.json` — TypeScript config
- `vitest.config.ts` — test runner config
- `src/core/README.md` — core invariant documentation
