# bunny-tools CLI — Brainstorm Summary

**Date:** 2026-05-02
**Owner:** chien
**Status:** Design approved, ready for `/ck:plan`
**Inputs:**
- `plans/reports/researcher-260502-1758-bunny-api-surface.md`
- `plans/reports/researcher-260502-1748-firebase-tools-ux-patterns.md`

---

## 1. Problem

Repeating the same Bunny.net deploy workflow per project: investigate API → fetch docs → set credentials → upload → purge cache. No official CLI exists. 4 community CLIs are partial (storage-only, no purge orchestration, no GH Action story, no multi-env). User wants firebase-tools-equivalent ergonomics for Bunny: one CLI for daily deploy + one GitHub Action for CI.

## 2. Goals

- **Daily-loop frictionless:** `bunny deploy` syncs storage zone + purges pull zone in one command, idempotent, fast on warm runs.
- **Manual + CI parity:** same command works in terminal and GitHub Actions; no separate codepath.
- **Full Bunny surface (v0.1):** storage, pull-zone, storage-zone, DNS, Stream, Magic Containers, edge scripting CRUD — discovered as needed, not just deploy.
- **Honest auth:** explicit handling of Bunny's 4-key model (Account / Storage zone / Stream / Database) — no fake unification.

## 3. Non-Goals (v0.1)

- Local emulator. Mock with Nock in tests; no live emulation.
- Plugin system. Defer until 100+ commands or external request.
- Telemetry. No phone-home.
- `headers` / `rewrites` / `redirects` sugar in `bunny.json` (deferred to v0.2 — needs edge-rule sync; raw `pull-zone:edge-rule:*` CRUD ships in v0.1).
- Multipart upload. Bunny doesn't document chunked PUTs; standard PUT + retry covers <100MB cleanly.

## 4. Approaches Evaluated

### A. Node + TypeScript + Commander (CHOSEN)

| Pros | Cons |
|---|---|
| `npm i -g bunny-tools` matches user expectation (firebase-tools UX). | Requires Node on user/CI runner (universal in target audience). |
| Commander.js: 0 deps, 18ms startup, battle-tested. | TS build pipeline. |
| Best ecosystem for HTTP mocking (Nock), schema (zod), config (cosmiconfig). | — |
| GitHub Actions trivially `npx` it. | — |

### B. Go single binary

Rejected: heavier release pipeline (cross-compile, Homebrew tap, goreleaser), worse ecosystem fit for the target user (web devs already on Node), no clear win for a deploy CLI.

### C. Bun + TS (`bun build --compile`)

Rejected for v1: smaller ecosystem, CI runners need Bun pre-installed. Worth revisiting for v2 if cold-start becomes a real complaint.

### D. Python

Rejected: pip-install UX is worse than npm for this audience.

## 5. Architectural Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Node 20+, TypeScript, Commander.js | Speed, zero deps, ubiquity. |
| D2 | npm package `bunny-tools`, binary `bunny` | Mirrors firebase/vercel/gh naming. Verify npm availability before first publish. |
| D3 | Composite GitHub Action wrapping `npx bunny-tools` | Zero build pipeline; user-pinnable to any npm version; transparent. JS Action deferred. |
| D4 | Auth: `bunny auth set/list/clear` (NOT `bunny login`) | Honest — Bunny has no OAuth. Just paste key → keychain. |
| D5 | 4-key auth model exposed, not hidden | Bunny is fragmented (Account / Storage zone / Stream / DB). `bunny.json` declares which keys this project needs; resolver per call site. |
| D6 | Auth resolution chain | `--flag` → `BUNNY_*` env → OS keychain → `~/.config/bunny-tools/credentials.json` → interactive prompt (TTY only). |
| D7 | `bunny.json` (project, git-tracked) + `.bunnyrc` (aliases, gitignored) | firebase-tools pattern. zod-validated schema, JSON Schema published for editor support. |
| D8 | Diff strategy: local SHA256 cache + remote ETag/size verify | Fast on warm runs, correct on cold/CI. State at `.bunny-state.json` (gitignored). |
| D9 | Upload concurrency: parallel pool (default 8), 429 → exponential backoff + jitter | Honors per-region rate limits; configurable via `--concurrency`. |
| D10 | Pagination: always `page=1, perPage=1000`, iterate. Never `page=0`. | Avoids the Bunny array-vs-object pagination footgun on large accounts. |
| D11 | Region awareness: cache zone→region from Account API; override via `--region` or `bunny.json#deploy.region` | First-run fetches once, then cached. |
| D12 | Purge policy: `purge: "tag:<name>" \| "all" \| "none" \| string[]` per pull-zone | Tag-based preferred; falls back to full pull-zone purge; `none` for tooling that purges manually. |
| D13 | HTTP client: undici with persistent agent | Connection reuse for many small storage PUTs. |
| D14 | Test stack: Vitest + Nock | Match firebase-tools internals; isolated from CLI framework. |
| D15 | Internal release cadence inside v0.1: alpha milestones (deploy → zone CRUD → DNS → Stream → MC) | Even though "v0.1 = full surface", we ship `0.1.0-alpha.N` weekly so user can dogfood; final `0.1.0` only when all surface lands. |

## 6. Final Recommended Solution

### 6.1 Repo layout

```
bunny-tools/
├── src/
│   ├── cli.ts                       # Commander entry, lazy-loads commands
│   ├── commands/
│   │   ├── init.ts                  # bunny init
│   │   ├── auth.ts                  # auth set/list/clear
│   │   ├── use.ts                   # alias switching
│   │   ├── deploy.ts                # the money command
│   │   ├── purge.ts                 # bunny purge <url|tag|all>
│   │   ├── storage/                 # storage:upload/download/list/delete/sync
│   │   ├── storage-zone/            # CRUD
│   │   ├── pull-zone/               # CRUD + edge-rule CRUD
│   │   ├── dns/                     # zone + record CRUD
│   │   ├── stream/                  # library + video CRUD
│   │   ├── containers/              # Magic Containers CRUD
│   │   └── scripting/               # edge scripting CRUD
│   ├── api/
│   │   ├── http.ts                  # AccessKey, retry, 429 backoff, undici agent
│   │   ├── account.ts               # api.bunny.net
│   │   ├── storage.ts               # regional, per-zone
│   │   ├── stream.ts                # video.bunnycdn.com
│   │   └── errors.ts                # ErrorKey/Field/Message → typed
│   ├── config/
│   │   ├── bunny-json.ts            # schema (zod) + loader
│   │   ├── bunnyrc.ts               # aliases
│   │   └── credentials.ts           # resolver chain + keychain
│   ├── deploy/
│   │   ├── walk.ts                  # ignore-aware traversal
│   │   ├── diff.ts                  # local hash + remote ETag/size
│   │   ├── upload-queue.ts          # parallel + backoff + progress
│   │   └── purge.ts
│   ├── ui/                          # ora, chalk, progress, table
│   └── util/
├── action/
│   ├── action.yml                   # composite GH Action
│   └── README.md
├── schema/
│   └── bunny.schema.json            # published for $schema lookups
├── test/
├── package.json                     # "bin": { "bunny": "dist/cli.js" }
└── README.md
```

### 6.2 Command tree (v0.1 final)

```
bunny init
bunny auth set [--scope account|storage:<zone>|stream:<lib>]
bunny auth list
bunny auth clear [--scope ...]
bunny use <alias>
bunny deploy [--only=<target>] [--purge=tag|all|none] [--delete] [--dry-run] [--concurrency=N]
bunny purge <url|tag:<name>|pull-zone:<id>> [--async]

bunny storage:upload <local> <remote> [--zone=<name>]
bunny storage:download <remote> <local>
bunny storage:list <path>
bunny storage:delete <path>
bunny storage:sync <local> <remote> [--delete]

bunny storage-zone:list
bunny storage-zone:create <name> [--region=<r>] [--replicate=<r,r,...>]
bunny storage-zone:get <id|name>
bunny storage-zone:update <id> [...]
bunny storage-zone:delete <id>

bunny pull-zone:list
bunny pull-zone:create <name> --origin=<url>
bunny pull-zone:get <id>
bunny pull-zone:update <id> [...]
bunny pull-zone:delete <id>
bunny pull-zone:edge-rule:list <pz>
bunny pull-zone:edge-rule:add <pz> ...
bunny pull-zone:edge-rule:delete <pz> <rule>

bunny dns:list
bunny dns:create <domain>
bunny dns:get <id|domain>
bunny dns:delete <id>
bunny dns:record:list <zone>
bunny dns:record:add <zone> <type> <name> <value> [--ttl=N]
bunny dns:record:update <zone> <id> ...
bunny dns:record:delete <zone> <id>

bunny stream:library:list
bunny stream:library:create <name>
bunny stream:video:list <library>
bunny stream:video:upload <library> <file>
bunny stream:video:delete <library> <video>

bunny containers:list
bunny containers:create <name> ...
bunny containers:deploy <app>
bunny containers:delete <app>

bunny scripting:list
bunny scripting:deploy <name> <file>
bunny scripting:delete <name>

bunny --version
bunny --help
```

### 6.3 `bunny.json` schema (v0.1)

```jsonc
{
  "$schema": "https://unpkg.com/bunny-tools/schema/bunny.schema.json",
  "deploy": {
    "publicDir": "dist",
    "ignore": ["bunny.json", ".bunnyrc", "**/.*", "**/node_modules/**"],
    "storageZone": "my-app",
    "region": "ny",                              // optional override
    "concurrency": 8,
    "pullZones": [
      { "id": 12345, "purge": "tag:app", "tag": "app-v1" }
    ]
  }
  // headers/rewrites/redirects: deferred to v0.2 (edge-rule sync)
}
```

### 6.4 `.bunnyrc` schema

```json
{
  "default": "prod",
  "aliases": {
    "prod":    { "storageZone": "my-app",      "pullZones": [12345] },
    "staging": { "storageZone": "my-app-stg",  "pullZones": [12346] }
  }
}
```

### 6.5 GitHub Action (composite)

```yaml
# action/action.yml
name: Bunny Deploy
description: Deploy to Bunny.net storage and purge CDN cache.
inputs:
  version:           { description: bunny-tools npm version, default: latest }
  only:              { description: --only target }
  working-directory: { description: cwd, default: . }
  account-key:       { description: account API key (secret), required: false }
  storage-password:  { description: storage zone password (secret), required: false }
runs:
  using: composite
  steps:
    - shell: bash
      working-directory: ${{ inputs.working-directory }}
      env:
        BUNNY_ACCOUNT_KEY: ${{ inputs.account-key }}
        BUNNY_STORAGE_PASSWORD: ${{ inputs.storage-password }}
      run: |
        npx --yes bunny-tools@${{ inputs.version }} deploy ${{ inputs.only && format('--only={0}', inputs.only) || '' }}
```

User workflow:
```yaml
- uses: bunny-tools/deploy-action@v1
  with:
    account-key: ${{ secrets.BUNNY_ACCOUNT_KEY }}
    storage-password: ${{ secrets.BUNNY_STORAGE_PASSWORD }}
```

### 6.6 Deploy loop (semantics)

1. Load `bunny.json` + active `.bunnyrc` alias (CLI flag > `BUNNY_ALIAS` env > `default`).
2. Resolve region: `bunny.json#deploy.region` > cached zone metadata > Account API GET `/storagezone?search=<name>`.
3. Walk `publicDir` honoring `ignore` (gitignore semantics via `ignore` package). Compute `{path → sha256, size}`.
4. Read prior `.bunny-state.json` if present; mark untouched files (mtime+size match) without rehashing.
5. List remote (`page=1, perPage=1000`, iterate). Build `{path → ETag, length}`.
6. Classify each file: `new | changed | unchanged | orphan`.
7. Upload `new + changed` via parallel pool (default 8). On 429 → exponential backoff + jitter, max 5 retries. Show progress (ora/cliui).
8. If `--delete`: remove `orphan` files.
9. Purge per `pullZones[].purge`:
   - `tag:<name>` → POST `/pullzone/{id}/purgeCache` body `{ "CacheTag": "<name>" }`.
   - `all` → POST `/pullzone/{id}/purgeCache` body `{ }` (or full URL with wildcard).
   - `none` → skip.
   - `string[]` → POST `/purge?url=<u>&async=false` per URL.
10. Write fresh `.bunny-state.json`.

### 6.7 Auth resolution

Per call site, the resolver receives a `scope` ("account" | "storage:<zone>" | "stream:<lib>") and walks:

1. Explicit CLI flag (`--account-key`, `--storage-password`, `--stream-key`).
2. Scoped env: `BUNNY_ACCOUNT_KEY`, `BUNNY_STORAGE_PASSWORD_<UPPER_ZONE>`, `BUNNY_STREAM_KEY_<LIB_ID>`.
3. Generic env fallback: `BUNNY_STORAGE_PASSWORD`, `BUNNY_STREAM_KEY` (single-zone/lib projects).
4. OS keychain via `keytar` (service `bunny-tools`, account = scope key).
5. `~/.config/bunny-tools/credentials.json` (700 perms).
6. Interactive prompt (TTY only; CI fails fast with actionable error).

## 7. Phased Delivery (internal)

Even though v0.1 = full surface, we ship internal alphas weekly so user can dogfood:

| Alpha | Scope | Validates |
|---|---|---|
| `0.1.0-alpha.1` | init, auth, use, deploy (storage+purge), purge | Daily-loop pain solved. |
| `0.1.0-alpha.2` | storage:* + storage-zone:* + pull-zone:* CRUD | Provisioning. |
| `0.1.0-alpha.3` | dns:* | DNS workflows. |
| `0.1.0-alpha.4` | stream:* + scripting:* + containers:* | Full surface. |
| `0.1.0` | Polish, docs, schema publish, GH Action `v1` tag | Public release. |

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `bunny-tools` npm name taken | Medium | High | Verify before any publish; fallback to `@<scope>/bunny-tools`. |
| Bunny rate limits trigger 429 on large uploads | High | Medium | Default concurrency 8, exponential backoff + jitter, configurable, document tuning. |
| Per-folder 10K file cap surprises users | Medium | Medium | Detect at walk time; warn with actionable error. |
| Multipart not documented; >100MB files fail | Medium | Low | Document limit; fall back to single PUT with extended timeout; revisit if real demand. |
| ETag instability across reuploads | Low | Medium | Combine ETag check with `Last-Modified` + size; local SHA256 is source of truth. |
| Auth fragmentation confuses users | High | Medium | `bunny init` interactively asks which Bunny products this project uses, sets up scoped keys; clear errors point to right key. |
| Scope creep in v0.1 stalls release | High | High | Strict alpha gating; each alpha must ship before next starts. |
| GH Action `npx` cold install (~5-10s) | Medium | Low | Document caching via `actions/setup-node` + `cache: npm`; revisit JS Action if real complaint. |

## 9. Success Criteria

- `bunny init && bunny auth set && bunny deploy` works on a fresh machine in <5 min.
- Warm `bunny deploy` (no changes) completes in <3s on a 1000-file site.
- 100% of Bunny REST surface used in v0.1 covered by Nock-mocked tests.
- GH Action wraps the CLI with zero duplication of CLI logic.
- README install + first-deploy walkthrough passes a stranger usability test.
- Zero Bunny credentials committed in any test fixture or CI log.

## 10. Validation

- Unit: Vitest, Nock mocks for every Bunny endpoint.
- Integration: optional live test against a throwaway Bunny account, gated by env (`BUNNY_E2E=1`); skipped in CI by default.
- Manual: dogfood on user's existing projects from alpha.1 onward.
- Schema: JSON Schema validated by `ajv` in tests; published to unpkg for editor autocompletion.

## 11. Next Steps

1. Verify `bunny-tools` availability on npm + reserve GH org if needed.
2. Run `/ck:plan` against this design to produce phased implementation plan with phase-NN files in `plans/260502-1748-bunny-tools-cli/`.
3. Implementation kicks off with `0.1.0-alpha.1` scope (deploy loop end-to-end).

## 12. Resolved Decisions

| # | Question | Decision |
|---|---|---|
| Q1 | GH org / namespace | `bytekcorp` org. Action ref: `bytekcorp/bunny-tools-deploy-action@v1`; CLI repo: `bytekcorp/bunny-tools`. |
| Q2 | License | MIT. |
| Q3 | Live e2e test account | None for v0.1. Nock-only. Real-world quirks surface via dogfooding. E2E harness deferred. |
| Q4 | Slip-plan if alpha.3 (DNS) > 2 weeks | Demote Stream + Magic Containers + edge scripting to v0.2 bundle. v0.1 ships with init/auth/use/deploy/purge + storage:* + storage-zone:* + pull-zone:* + dns:*. |
| Q5 | Cache-Tag origin guidance | `bunny init` prints one-line hint + docs link iff `purge: tag:*` selected. No interactive nag. |
| Q6 | Replication regions UX | `bunny storage-zone:create --replicate=<r,r,...>` flag. Default single-region. Not interactive in `init`. |

## 13. Open Items (post-plan)

- Verify `bunny-tools` npm name availability before first publish — if taken, fall back to `@bytekcorp/bunny-tools`.
- Reserve `bytekcorp` org on GitHub if not already created.

---

## 14. Addendum (2026-05-02 18:30) — Interactive UX, MCP, AI-Discovery

Three orthogonal additions raised after initial design approval, all folded into v0.1.

### 14.1 Goals (additions)

- **G5 — `aws configure`-style guided UX.** First-time setup must be one command, not three.
- **G6 — MCP server.** Let an AI agent (Claude Desktop / Claude Code / Cursor / continue.dev) call bunny-tools natively without parsing CLI prose.
- **G7 — AI-discovery surface.** When an AI sees "use bunny-tools to deploy X", it must be able to fetch one canonical doc + structured manifest and use the CLI correctly without trial and error.

### 14.2 Architectural shift — `src/core/*` layer

Originally: `src/commands/*` → `src/api/*`. New: `src/commands/*` → `src/core/*` → `src/api/*` (and later `src/mcp/tools/*` → `src/core/*` too).

| Layer | Responsibility |
|---|---|
| `src/manifest/` | Single source of truth — every command declared in one registry. |
| `src/cli.ts` | Reads registry, builds Commander tree, lazy-loads command impls. |
| `src/commands/*` | Thin CLI wrappers — parse flags, call core, render via `src/ui`. No business logic. |
| `src/mcp/tools/*` (phase 6) | Thin MCP wrappers — same shape as commands, return JSON. |
| `src/core/*` | Typed business logic. No UI, no `console.log`, no `process.exit`. |
| `src/api/*`, `src/deploy/*`, `src/config/*` | Existing layers. Only `src/core/*` may import from them. |

Lint rule + drift-checked manifest enforce the boundary. Doing this in phase 1 is cheap; retrofitting in v0.2 would be expensive.

### 14.3 New decisions

| # | Decision | Rationale |
|---|---|---|
| D16 | `src/manifest/registry.ts` is canonical command registry. | Drives Commander, `bunny manifest` JSON, `--help --json`, `AGENTS.md`, JSON Schema, MCP tool defs. DRY guarantee. |
| D17 | `bunny configure` (new) is the recommended first-run command. `bunny init` (per-project) calls it if no global creds. `bunny auth set` stays as low-level escape hatch. | Matches `aws configure` UX. Keeps `auth set` for power users. |
| D18 | `bunny configure --non-interactive --account-key=... --storage-zone=... --storage-password=...` for CI. | Same code path; suitable for setup steps. |
| D19 | `bunny mcp` ships in v0.1 as new Phase 6 (before GA). Stdio transport only. | Stdio is what Claude Desktop / Code / Cursor use. HTTP/SSE deferred to v0.2. |
| D20 | MCP exposes ~10 high-level tools + 1 `bunny.run` escape hatch (not 1:1 with CLI). | Avoids tool-list bloat; preserves selection accuracy. Power users use `bunny.run`. |
| D21 | MCP resources: `bunny://manifest`, `bunny://agents`, `bunny://config/current` (masked). | AI clients auto-discover the CLI surface and current state. |
| D22 | `AGENTS.md` + `bunny.schema.json` + `manifest.json` all generated from registry; CI fails on drift. | Single source; no manual sync rot. |
| D23 | `--help --json` available on every command, derived from registry. | Self-describing CLI. AI introspects without parsing prose. |

### 14.4 New `bunny` command surface (added in v0.1)

```
bunny configure                             # global aws-style walkthrough
bunny configure --non-interactive --...     # CI-friendly variant
bunny manifest [--pretty]                   # registry → JSON
bunny mcp                                   # boot MCP stdio server
bunny <any-cmd> --help --json               # structured help
```

### 14.5 MCP tool list (~10 + escape hatch)

| Tool | Purpose |
|---|---|
| `bunny.deploy({only?, purge?, dry_run?, concurrency?})` | Run full deploy. |
| `bunny.purge({target})` | URL / tag: / pull-zone:N / all. |
| `bunny.storage_list({path, zone?, recursive?})` | Browse storage. |
| `bunny.storage_upload({local, remote, zone?})` | Single-file upload. |
| `bunny.storage_delete({path, zone?, recursive?})` | Delete file/folder. |
| `bunny.zones_list({type})` | List storage or pull zones. |
| `bunny.zone_get({type, id_or_name})` | Read zone. |
| `bunny.zone_create({type, ...})` / `bunny.zone_delete({type, id})` | Provision. |
| `bunny.dns_records({zone})` / `bunny.dns_record_set({...})` / `bunny.dns_record_delete({...})` | DNS CRUD. |
| `bunny.manifest()` | Full registry. |
| `bunny.run({args[], format?})` | Escape hatch: invoke any CLI subcommand, return parsed output. |

### 14.6 Plan changes (concrete)

| Phase | Change |
|---|---|
| Phase 1 | Add `src/core/`, `src/manifest/registry.ts`, `bunny manifest` cmd, `--help --json` plumbing, generators (`gen:manifest`, `gen:agents`, `gen:schema`), CI drift check. |
| Phase 2 | Add `bunny configure` (interactive + `--non-interactive`); commands route through `src/core/*`; `init` calls `configure` if no global creds. |
| Phase 3–5 | Same shape — every new command lives in registry, body in `src/core/*`, thin wrapper in `src/commands/*`. |
| **Phase 6 (new)** | `bunny mcp` server, ~10 tools + escape hatch + 3 resources. Final polish on `AGENTS.md`. Releases as `0.1.0-rc.1`. |
| Phase 7 (was Phase 6) | GH Action + npm publish + schema unpkg + final `0.1.0` GA. |

### 14.7 Risks (addendum)

| Risk | Mitigation |
|---|---|
| `src/core/*` boundary drifts (commands sneak `src/api/*` imports) | ESLint rule: `src/commands/**` and `src/mcp/**` may not import `src/api/**`. CI enforced. |
| MCP tool surface bloats | Hard cap at 10 + escape hatch; periodic review. |
| Registry becomes god-object | Per-domain split (`registry/deploy.ts`, `registry/dns.ts`, etc.) merged at top level. |
| Generated `AGENTS.md` reads like a robot wrote it | Hand-curated sections between `<!-- handcurated -->` markers preserved by generator; final polish in phase 6. |
| MCP server logs to stdout (breaks transport) | Test asserts no `process.stdout.write` outside MCP framing; logs go to stderr. |

### 14.8 Resolved (this round)

- MCP transport = stdio only.
- MCP exposes 10 high-level tools + 1 escape hatch.
- AGENTS.md + schema generated from registry; CI drift-checked.
- `bunny configure --non-interactive` accepts all flags; same code path.
- All folded into v0.1 (Phase 6 inserted; old Phase 6 → Phase 7).
