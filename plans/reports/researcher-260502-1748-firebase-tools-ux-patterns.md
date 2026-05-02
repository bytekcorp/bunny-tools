# Firebase-Tools UX Patterns Research

**Date:** 2026-05-02 | **Scope:** CLI UX patterns from firebase-tools + comparable deploy CLIs | **Status:** Complete

---

## Executive Summary

Firebase-tools (15M+ weekly npm downloads) sets the industry standard for deploy CLI UX. Wrangler and netlify-cli provide useful contrasts for storage+CDN workflows. **Recommendation: adopt Commander.js (0 dependencies, 18ms startup), not oclif (85ms startup—too slow for frequent invocation).** Firebase's multi-target system (.firebaserc + firebase.json) scales better than netlify's manual linking. Build bunny-tools around a config-first architecture with alias support from day 1.

---

## 1. Firebase-Tools Command Structure

### Top 15+ Commands (Observed)

| Category | Commands |
|----------|----------|
| **Auth** | `login`, `logout`, `login:ci` (token mode), `login:add`, `login:list` |
| **Project** | `use <alias>`, `projects:list`, `init` |
| **Deploy** | `deploy`, `deploy --only hosting`, `deploy --only functions`, `serve` |
| **Emulators** | `emulators:start`, `emulators:exec` |
| **Hosting** | `hosting:disable` |
| **Functions** | `functions:log`, `functions:config:set` |
| **Database** | `database:get`, `database:set`, `database:push`, `database:remove` |
| **Auth Mgmt** | `auth:import`, `auth:export` |
| **Extensions** | `ext:install`, `ext:list`, `ext:update` |
| **Remote Config** | `remoteconfig:get`, `remoteconfig:rollback` |

**Pattern:** Colon-delimited subcommands (`database:get`, not `database get`). Reason: disambiguates command tree, works with bash completion (`firebase <TAB>` vs `firebase db<TAB>`).

### CLI Framework Used

**Does NOT use Commander, Yargs, or oclif.** Firebase implements a custom command routing system in TypeScript. Key insight: they avoided framework lock-in but paid the cost of custom infrastructure. For bunny-tools: **not worth replicating.**

### Auth Methods

- **Interactive:** `firebase login` (browser OAuth → stored token in `~/.config/firebase/` on Linux)
- **CI/CD:** `firebase login:ci` (generates long-lived token, stores in `$FIREBASE_TOKEN`)
- **Service Account:** `GOOGLE_APPLICATION_CREDENTIALS` env var (JSON key file)
- **Token on any command:** `firebase --token="<token>" <command>` (useful for scripting)

**Key insight:** Supports multiple auth modes without forcing users to choose upfront. fallback chain: CLI flag → env var → interactive.

### Deployment Targeting

**`.firebaserc` (project alias config):**
```json
{
  "projects": {
    "default": "my-prod-project",
    "staging": "my-staging-project"
  },
  "targets": {
    "my-prod-project": {
      "hosting": ["app", "marketing"]
    }
  }
}
```

**`firebase.json` (per-site config):**
```json
{
  "hosting": [
    {
      "target": "app",
      "public": "dist/app",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"]
    },
    {
      "target": "marketing",
      "public": "dist/marketing"
    }
  ]
}
```

**Commands:**
- `firebase use <alias>` → sets active project
- `firebase deploy --only hosting:app` → deploys specific target
- `firebase deploy --only hosting` → deploys all hosting targets

**Why this works:** Aliases decouple environment naming (prod/staging/dev) from Firebase project IDs. One `.firebaserc` shared across team; each dev can `firebase use staging` without touching git.

---

## 2. Firebase Hosting Configuration (firebase.json)

### Essential Schema

| Property | Purpose | Example |
|----------|---------|---------|
| `public` | Deploy source directory | `"dist"` or `"build"` |
| `ignore` | Globs to skip (like .gitignore) | `["firebase.json", "**/node_modules/**"]` |
| `redirects` | HTTP 301/302 rules | `[{"source": "/old", "destination": "/new", "type": 301}]` |
| `rewrites` | SPA routing (no redirect) | `[{"source": "**", "destination": "/index.html"}]` |
| `headers` | HTTP response headers | Cache-Control, CORS, security headers |
| `functions` | Cloud Functions routing | `[{"source": "**", "function": "api", "region": "us-central1"}]` |
| `trailingSlashBehavior` | 301/302/REMOVE (v2.0+) | Enforce `/path/` vs `/path` consistency |

### Processing Order (Critical)

1. Reserved `/__/*` paths (Firebase internal)
2. Redirects (first-match-wins)
3. Static files (exact path match)
4. Rewrites (first-match-wins, SPA fallback)
5. 404 page
6. Default 404

**Design lesson:** Order matters. Putting rewrites before static files breaks image serving. Firebase docs this explicitly.

---

## 3. Wrangler (Cloudflare Workers) Comparison

### Config File

Uses `wrangler.toml` (TOML) or `wrangler.jsonc` (new, preferred):
```toml
name = "my-worker"
main = "src/index.ts"
compatibility_date = "2026-01-01"

[env.staging]
name = "my-worker-staging"
vars = { ENV = "staging" }

[env.production]
name = "my-worker-prod"
```

**Deploy:** `wrangler deploy --env staging`

### Key Differences from Firebase

| Aspect | Firebase | Wrangler |
|--------|----------|----------|
| **Config Format** | JSON (firebase.json) | TOML/JSON (wrangler.toml) |
| **Multi-env** | `.firebaserc` aliases + firebase.json targets | `[env.*]` sections in wrangler.toml |
| **Auth** | Token in `~/.config/` or `FIREBASE_TOKEN` env | `CLOUDFLARE_API_TOKEN` env (GitHub Secrets in CI) |
| **Deploy** | `firebase deploy --only hosting:target` | `wrangler deploy --env staging` |
| **Versioning** | Realtime versioning (channel-based) | Explicit `wrangler versions upload` then deploy |

**Insight:** Wrangler's env handling is simpler (all in one file) but less portable (requires wrangler.toml in git, unlike Firebase's shareable .firebaserc).

---

## 4. Netlify CLI Comparison

### Commands

```bash
netlify login                          # OAuth → ~/.config/netlify/config.json
netlify init                           # Link to GitHub, enable CD
netlify dev                            # Local dev with functions
netlify deploy                         # Draft deploy
netlify deploy --prod                  # Production
netlify deploy --alias=preview-1       # Named preview
netlify deploy --allow-anonymous       # No auth required
```

### Key Differences

| Aspect | Firebase | Netlify |
|--------|----------|---------|
| **Project Linking** | `.firebaserc` aliases | `.netlify/state.json` (auto-generated, not shared) |
| **Multi-site** | Multiple targets in single firebase.json | Separate Netlify site per domain |
| **Config Storage** | firebase.json (shared) + .firebaserc (per-dev) | netlify.toml (shared) + state.json (per-dev, auto) |
| **Token Storage** | `~/.config/firebase/` | `~/.config/netlify/config.json` |

**Pain point:** `.netlify/state.json` contains `siteId` and is often gitignored, causing new team members to re-link. Firebase avoids this by using human-readable aliases in .firebaserc.

---

## 5. GitHub Actions Patterns

### Firebase Hosting Action

- **Type:** JavaScript (TypeScript source)
- **Versioning:** Semantic (v0.10.0 latest as of Aug 2025), v prefix required
- **Key inputs:**
  - `firebaseServiceAccount` (JSON creds, not user token)
  - `firebaseToolsVersion` (override default latest)
  - `channelId` (preview or "live")
  - `expires` (preview lifetime, default 7d)
- **Outputs:** `urls` (array), `expire_time` (ISO), `details_url` (single)

**Approach:** Wraps `firebase-tools` npm package, executes via `npx firebase deploy`.

### Wrangler Action

- **Type:** JavaScript (TypeScript source)
- **Versioning:** Semantic with v prefix required (v3.x.x format)
- **Key inputs:**
  - `apiToken` (GitHub Secrets, required)
  - `wranglerVersion` (exact/major/range/"latest")
  - `workingDirectory` (subdirectory support)
  - `secrets` (newline-separated secret names)
- **No outputs** (status via exit code)

**Approach:** Downloads wrangler npm, executes `wrangler deploy` in workflow context.

**Key insight:** Both are JavaScript actions that shell out to npm CLIs. No custom Docker containers (unlike some older patterns). Allows version pinning at GitHub Action level, independent of global CLI.

---

## 6. CLI Framework Analysis: Commander vs Yargs vs Oclif

### Performance Benchmarks (Node 20, 2023 MacBook Pro)

| Framework | `--version` | `--help` | Command Run |
|-----------|------------|---------|------------|
| **Commander** | 18ms | 22ms | 25ms |
| **Yargs** | 35ms | 42ms | 48ms |
| **Oclif** | 85ms | 120ms | 135ms |

**Implication:** Users feel snappier with Commander (sub-30ms). Oclif's 85ms is noticeable for `--help` on frequent invocation.

### Feature Matrix

| Feature | Commander | Yargs | Oclif |
|---------|-----------|-------|-------|
| **Dependencies** | 0 | ~7 | ~30 |
| **Type Coercion** | Manual | Built-in | Built-in |
| **Validation** | Manual | Choices, type | Choices, type |
| **Typo Suggestions** | ✗ | ✓ | ✓ |
| **Plugin System** | ✗ | ✗ | ✓ |
| **Auto-generate Docs** | ✗ | ✗ | ✓ |
| **Testing Utilities** | ✗ | ✗ | ✓ |
| **Weekly Downloads** | ~35M | ~30M | ~200K |

### Recommendation: **Commander.js**

- **Why:** Firebase doesn't use it but should have. Zero deps, 18ms startup, battle-tested (Node.js core project, Terraform CLI, git, etc.).
- **Why not Yargs:** 7 deps add surface area. 35ms noticeable over 50+ invocations in a dev session.
- **Why not Oclif:** 30 deps, 85ms startup. Overkill for bunny-tools initially. Revisit if: 100+ commands, plugins needed, auto-update required.

---

## 7. Testing Patterns for Deploy CLIs

### HTTP Mocking

**Nock (mature, Node.js HTTP):**
- Intercepts `http.request` globally
- Used by firebase-tools internally
- Syntax: `nock('https://api.example.com').get('/path').reply(200, { ... })`

**Vitest-fetch-mock (modern, Fetch API):**
- Drop-in for Vitest (no external server needed)
- Better for isomorphic code (Fetch works client+server)
- Syntax: `vi.mocked(fetch).mockResolvedValueOnce(...)`

### Test Structure for bunny-tools

**Pattern to steal from Firebase:**
1. Mock API responses with Nock
2. Test command success/failure paths
3. Verify file writes (spy on fs operations)
4. Verify config parsing (validate firebase.json → error messages)
5. Test auth fallback chain (flag → env var → interactive)

**Avoid:** Unit-testing the CLI framework itself (Yargs/Commander logic). Test your business logic (deploy.ts, auth.ts) with inputs/outputs, not CLI plumbing.

---

## 8. Concrete Bunny-Tools Recommendations

### Top-Level Commands (10-15 initial)

```bash
bunny login                          # Browser OAuth → ~/.config/bunny/config.json
bunny logout
bunny init                           # Create bunny.json, .bunnyrc
bunny use <alias>                    # Switch active project/account
bunny deploy [--only=<target>]       # Deploy (all or specific)
bunny deploy:status                  # Check deployment progress
bunny pull-zone:create               # Create pull zone
bunny pull-zone:list
bunny storage:upload <file> <path>   # Upload to Edge Storage
bunny storage:list <zone>
bunny storage:delete <path>
bunny config:get <key>
bunny config:set <key> <value>
bunny token:create                   # Generate API token
bunny --version
bunny --help
```

**Rationale:** Group by domain (deploy, pull-zone, storage, config, token). Use colon notation like Firebase.

### Config File: `bunny.json` Schema

```json
{
  "version": "1.0",
  "deploy": {
    "publicDir": "dist",
    "ignore": [
      "bunny.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "headers": {
      "/assets/*": {
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    },
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  },
  "pullZones": [
    {
      "name": "production",
      "origin": "https://api.example.com",
      "cacheControl": "public, max-age=3600"
    }
  ],
  "storage": {
    "zone": "my-storage-zone",
    "region": "us-west"
  }
}
```

### Multi-Env: `.bunnyrc` (Aliases)

```json
{
  "projects": {
    "default": "prod-account-id",
    "staging": "staging-account-id"
  },
  "targets": {
    "prod-account-id": {
      "deploy": ["app"],
      "pullZones": ["production"]
    }
  }
}
```

**Usage:**
```bash
bunny use staging
bunny deploy --only=app          # Deploys to staging account
bunny use default
bunny deploy                      # Deploys to prod
```

### Multi-Environment Story

- **Shared:** bunny.json (git-tracked, identical across devs)
- **Per-Dev:** .bunnyrc (gitignored, user's account aliases)
- **CI/CD:** API token via env var or GitHub Secrets (`BUNNY_API_TOKEN`)
- **Auth Fallback:** CLI flag → env var → interactive login → check ~/.config/bunny/config.json

**Why separate .bunnyrc from bunny.json:** Bunny account IDs != environment names. One team might have 3 Bunny accounts (prod, staging, dev), another might deploy to 1. Don't force structure.

### Testing Approach

**Use Vitest + Nock:**
1. Mock Bunny API responses (Nock intercepts https requests)
2. Test command execution (e.g., `bunny deploy` with mocked API)
3. Test config validation (parse bunny.json → error messages)
4. Test auth flow (missing token → retry interactive login)
5. Use snapshot tests for CLI output formatting

**Example:**
```typescript
it('should deploy to staging when .bunnyrc specifies staging', async () => {
  nock('https://api.bunny.net')
    .post('/deploy')
    .reply(200, { id: 'deploy-123' });
  
  const result = await runCommand('deploy --only=app');
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toMatch(/Deployed successfully/);
});
```

---

## 9. Top 5 Things Bunny-Tools Must Steal from Firebase-Tools

1. **Colon-delimited subcommands** (`bunny pull-zone:create`, not `bunny pull zone create`). Better bash completion, clearer command tree.

2. **Separate config files for team vs. personal** (.firebaserc shared, ~/.config/firebase/ personal). Prevents accidentally committing API keys or hardcoding credentials.

3. **Multi-target deployment** (`firebase deploy --only hosting:target`). Allows multi-site deployments and partial updates without touching entire project.

4. **Alias-based project switching** (`firebase use staging`). More portable than Netlify's siteId because humans can read "staging," not UUIDs.

5. **Auth token fallback chain** (CLI flag → env var → interactive). Works in automation, works in dev, doesn't force users to choose upfront.

---

## 10. Top 3 Things NOT to Copy from Firebase-Tools

1. **Custom CLI framework (avoid reimplementing argument parsing).** Firebase wrote custom routing; this cost engineering time and creates maintenance burden. Use Commander.js instead—proven, zero deps, faster startup.

2. **Emulator Suite complexity.** Firebase's local testing story is enterprise-grade (firestore emulator, functions emulator, etc.). For v1 bunny-tools, offer API token in tests + nock mocking. Revisit local emulation only if bunny API becomes too complex to mock.

3. **Google-scale telemetry.** Firebase collects anonymized CLI usage (which commands, error rates, etc.). overkill for bunny-tools. Instead: log errors to Sentry if critical, but don't add CLI telemetry unless explicitly requested by users.

---

## Implementation Checklist

- [ ] Choose **Commander.js** as CLI framework
- [ ] Implement colon-delimited subcommand pattern
- [ ] Create bunny.json schema (borrow firebase.json structure heavily)
- [ ] Create .bunnyrc for aliases (like .firebaserc)
- [ ] Implement auth fallback: CLI flag → `BUNNY_API_TOKEN` env var → `~/.config/bunny/config.json` → interactive login
- [ ] Implement multi-target support (`--only=<target>`)
- [ ] Write CLI tests with Vitest + Nock
- [ ] GitHub Action wrapper (JavaScript, wraps `bunny-tools` npm package)
- [ ] Document command tree in README or auto-generate from Commander.js

---

## Sources

- [Firebase CLI Reference](https://firebase.google.com/docs/cli)
- [Firebase CLI GitHub](https://github.com/firebase/firebase-tools)
- [Configure Firebase Hosting](https://firebase.google.com/docs/hosting/full-config)
- [Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Netlify CLI Get Started](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/)
- [CLI Framework Comparison (Grizzly Peak)](https://www.grizzlypeaksoftware.com/library/cli-framework-comparison-commander-vs-yargs-oclif-utxlf9v9)
- [Firebase Hosting Action GitHub](https://github.com/FirebaseExtended/action-hosting-deploy)
- [Wrangler Action GitHub](https://github.com/cloudflare/wrangler-action)
- [Nock HTTP Mocking](https://github.com/nock/nock)
- [Vitest Mocking Guide](https://vitest.dev/guide/mocking)

---

## Unresolved Questions

1. **Does bunny.net API support "preview channels" like Firebase Hosting?** (Affects multi-env deploy strategy). Answer needed from Bunny docs.
2. **Does bunny storage have deployment hooks (predeploy/postdeploy scripts)?** (Affects bunny.json schema). Answer needed from Bunny API docs.
3. **Should bunny-tools support plugins (a la oclif) from v1, or defer?** Recommendation: defer. Revisit if 100+ commands or user demand.
4. **Should .bunnyrc be auto-generated or manually edited?** Recommendation: auto-generate on first `bunny login`, then let users edit manually for multi-account setups.
5. **Does wrangler-action pattern (env-based secrets) work better than firebase-action pattern (service account JSON)?** Depends on Bunny auth model; need to validate against actual Bunny API.
