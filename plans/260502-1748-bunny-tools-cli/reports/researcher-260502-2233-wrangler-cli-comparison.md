# Wrangler CLI — Research + Bunny-tools Comparison

**Date:** 2026-05-02 22:33
**Wrangler version inspected:** 4.55.0
**Trigger:** User asked "should we clone wrangler exactly?"
**Verdict (preview):** **No, but borrow ~6 specific patterns.** Most of wrangler is already mirrored in bunny-tools; the rest is Workers-specific (compute) and doesn't map to Bunny's storage+CDN+resources surface.

---

## 1. Wrangler's full command surface (4.55.0)

### Top-level commands

| Command | Purpose | Bunny analog |
|---|---|---|
| `wrangler init [name]` | Scaffold a Worker | `bunny init` |
| `wrangler dev [script]` | Local Worker dev server (Miniflare) | — (no Bunny runtime emulator) |
| `wrangler deploy [script]` | Deploy Worker to CF | `bunny deploy` |
| `wrangler setup` | Project setup [experimental] | folded into `bunny init` |
| `wrangler deployments` | List past deploys | — |
| `wrangler rollback [version-id]` | Rollback a deploy | — |
| `wrangler versions` | Manage Worker versions | — |
| `wrangler triggers` | Update triggers [experimental] | — |
| `wrangler delete [script]` | Delete a Worker | — (`pull-zone:delete` etc per resource) |
| `wrangler tail [worker]` | Live log stream | — (no Bunny public stream API) |
| `wrangler secret` | Worker bindings | — (we have `auth:set` for our 4 key types) |
| `wrangler types [path]` | TS types from config | — (JSON Schema published to unpkg) |
| `wrangler whoami` | Show authed user | — |
| `wrangler login` | OAuth | — (Bunny has no OAuth; `auth:set` paste-key) |
| `wrangler logout` | Revoke session | — (`auth:clear`) |
| `wrangler docs [search..]` | Open docs in browser | — |

### Resource subcommand groups (each is `wrangler <group> --help` for sub-tree)

| Group | Cloudflare product | Bunny analog |
|---|---|---|
| `kv` | Workers KV (key-value) | partial: `storage:*` (file storage, not KV) |
| `r2` | Object storage | `storage:*` + `storage-zone:*` |
| `d1` | SQL database | — (Bunny has DBs but no CLI yet) |
| `queues` | Message queue | — |
| `vectorize` | Vector index (AI) | — |
| `hyperdrive` | Postgres pool | — |
| `cert` / `mtls-certificate` | mTLS certs | — (Bunny has SSL on pull-zones, no CLI) |
| `pages` | Static hosting | bunny-tools IS the equivalent for Bunny |
| `containers` | Container hosting [beta] | `containers:*` |
| `pubsub` | Pub/Sub [private beta] | — |
| `dispatch-namespace` | Workers for Platforms | — |
| `ai` | AI models | — |
| `secrets-store` | Secrets Store [beta] | — |
| `workflows` | Durable workflows | — |
| `pipelines` | Streaming ETL [beta] | — |
| `vpc` | VPC connectivity [beta] | — |

### Global flags

| Flag | Purpose | Bunny status |
|---|---|---|
| `-c, --config <path>` | Custom config path | **missing** |
| `--cwd <dir>` | Run as if from another dir | **missing** |
| `-e, --env <name>` | Select environment | partial (`bunny use <alias>` separate cmd) |
| `--env-file <path>` | Load .env file | **missing** |
| `-h, --help` | Help | ✓ |
| `-v, --version` | Version | ✓ |

### Conventions worth noting

- **Space-delimited subcommands**: `wrangler r2 bucket create my-bucket`.
- **Per-group help trees**: `wrangler r2 --help` shows only r2 sub-tree.
- **Emoji icons** in help output (📥, 🆙, 🦚, etc.) — controversial, terminal/accessibility quirks.
- **`[experimental]` / `[beta]` tags** on incomplete commands.
- **Positional first arg** common: `init [name]`, `deploy [script]`, `tail [worker]`.

---

## 2. Wrangler's lifecycle / typical workflow

```
wrangler login                       # OAuth, stores creds in ~/.config/.wrangler/
wrangler init my-worker              # creates dir + wrangler.toml + src/index.ts
cd my-worker
wrangler dev                         # local dev server (Miniflare)
wrangler deploy                      # ship to Cloudflare
wrangler tail                        # live logs from prod
wrangler deployments                 # who deployed when
wrangler rollback                    # back to last known good
wrangler whoami                      # what account am I on?
wrangler docs deploy                 # open docs.workers.cloudflare.com/deploy
```

For resource setup (KV, R2, D1):
```
wrangler r2 bucket create my-bucket
wrangler kv namespace create my-cache
wrangler d1 create my-db
# Then add the binding to wrangler.toml
wrangler deploy                      # binding goes live
```

---

## 3. Wrangler `wrangler.toml` (config) — high level

```toml
name = "my-worker"
main = "src/index.ts"
compatibility_date = "2025-01-01"

[vars]
LOG_LEVEL = "info"

[[kv_namespaces]]
binding = "MY_KV"
id = "abc123"

[[r2_buckets]]
binding = "MY_BUCKET"
bucket_name = "my-bucket"

[env.staging]
name = "my-worker-staging"
[env.staging.vars]
LOG_LEVEL = "debug"
```

Compared to `bunny.json`:
- Wrangler binds resources to env-var names INSIDE the deployed Worker (so the Worker can use them at runtime).
- bunny.json declares deploy targets (storage zone, pull zones to purge) — there's no Worker that needs bindings. **Different problem domain.**
- Wrangler's `[env.NAME]` is comparable to `.bunnyrc#aliases` — same idea, different file.

---

## 4. Wrangler vs bunny-tools — direct comparison

### What we already match (~70% of wrangler's UX)

- ✅ Single binary, npm-distributed
- ✅ `init` → project setup with config file
- ✅ `deploy` daily-loop command
- ✅ Resource subcommand groups (`storage:*`, `pull-zone:*`, `dns:*`, `stream:*`, `containers:*`, `scripting:*`)
- ✅ JSON-based config (vs TOML — same level of UX)
- ✅ Per-developer alias overlay file (`.bunnyrc` vs wrangler's `[env.*]`)
- ✅ Stderr-only logging, stdout reserved for command output
- ✅ `--json` output flag on list commands
- ✅ Provenance-attested npm publish via OIDC (we just got this working)

### What wrangler has that we DON'T (but should)

| Pattern | Effort | Value | Recommend? |
|---|---|---|---|
| `bunny whoami` — show current account context (zones found, masked key) | ~30 LOC | High — answers "what am I authed as?" | ✅ Yes |
| `bunny docs [topic]` — opens `docs.bunny.net/docs/<topic>` in browser | ~20 LOC | Medium — discoverability | ✅ Yes |
| `-c, --config <path>` global flag — custom bunny.json path | ~10 LOC | Medium — multi-config workflows | ✅ Yes |
| `--cwd <dir>` global flag — run as if from another dir | ~10 LOC | Low-Medium — script convenience | ✅ Yes (cheap) |
| `-e, --env <alias>` global flag — one-shot alias select (no `bunny use` first) | ~15 LOC | Medium — script ergonomics | ✅ Yes |
| `bunny init [dir]` — accept positional directory | ~5 LOC | Low — convenience | ✅ Yes (cheap) |

### What wrangler has that we should consciously SKIP

| Pattern | Why skip |
|---|---|
| `wrangler dev` (local Worker emulator via Miniflare) | Bunny edge runtime has no public emulator. Building one = multi-month. |
| `wrangler tail` (live log stream) | Bunny has logs but no public streaming API. |
| `wrangler secret` (Worker runtime bindings) | Different domain — Worker bindings vs our 4-key auth model. |
| `wrangler types` (TS types from config) | JSON Schema is already published to unpkg; editors autocomplete `bunny.json` for free. |
| `wrangler login`/`logout` (OAuth) | Bunny has no OAuth. `bunny auth set` is the honest equivalent. |
| `wrangler deployments` / `rollback` | Bunny has no native deploy history; we'd have to roll our own infra in `.bunny-state.json`. Possible but expensive. v0.2. |
| Space-delimited subcommands (`r2 bucket create`) | Switching colon→space is massive churn for marginal benefit. firebase-tools/gh use colon too. |
| Emoji in help output | Terminal compatibility + accessibility friction. |
| `[experimental]`/`[beta]` tags everywhere | Overkill for our scope. |

### What we have that wrangler DOESN'T

- `bunny manifest` — full registry as JSON. Wrangler's nearest equivalent is parsing `--help` output.
- `bunny mcp` — MCP stdio server. Wrangler has no native AI integration.
- `bunny <any> --help-json` — structured help for AI consumption.
- `AGENTS.md` ships with the package. Wrangler doesn't.
- Honest 4-key auth model exposed (account/storage:zone/stream:lib/database) vs wrangler's single-token model.

---

## 5. Brutal honesty on "clone exactly"

The "clone exactly like wrangler" framing is wrong because:

1. **Different problem domain.** Wrangler is a *compute* CLI (Workers + Pages + KV bindings). bunny-tools is a *storage + CDN + resources* CLI. The shared 70% is the easy part (init/deploy/resource CRUD). The remaining 30% is Workers-specific.

2. **OAuth gap.** Wrangler's `login` is OAuth, Bunny has no OAuth. Faking it with `bunny login` (paste-key) is dishonest UX — we already debated this and chose `auth set`.

3. **Pivot fatigue.** This would be the third design pivot in three sessions:
   - Session 1: separate `configure` + `init`
   - Session 2: collapse into single `init` (firebase-style)
   - Session 3 (proposed): clone wrangler's space-delimited tree
   
   Each pivot has cost: doc churn, package break (we just published rc.6), user-trust erosion. **The marginal UX win from a third pivot is probably negative.**

4. **What's already shipped works.** rc.6 is on npm with provenance. Users who install today get a coherent UX. Don't break it without strong reason.

## 6. Recommended scope (consensus-friendly)

**Option A — small wrangler-inspired wins (Recommended)**: ship `whoami` + `docs` + `-c/--cwd/-e` global flags + `init [dir]` positional in `0.1.0-rc.7`. ~2-3 hour effort. No breaking changes. No architectural shift.

**Option B — big restructure**: switch colon→space subcommands, add per-group help trees, add emoji, etc. Massive churn. Bigger UX win debatable. Breaks rc.6.

**Option C — do nothing**: ship 0.1.0 GA as-is. We're already aligned with wrangler on 70% of patterns; the gap is mostly Workers-specific.

I recommend **A**. Strong-recommend against **B**. C is also fine.

## 7. Open Questions

- Want to also add `bunny deployments list` (read from `.bunny-state.json` history)? Requires expanding state schema. Defer to v0.2 unless user pushes.
- Should `bunny docs <topic>` map topics to URLs via a hardcoded table, or just `docs.bunny.net/docs/<topic>` as a path? (Recommend: hardcoded table for popular topics + fallback to slug.)
- Any wrangler-isms you specifically want that I missed in this scan?
