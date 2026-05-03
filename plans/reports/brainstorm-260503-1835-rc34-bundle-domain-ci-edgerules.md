# Brainstorm: rc.34 — connect-domain + init --ci + declarative edge rules

**Date:** 2026-05-03
**Trigger:** User wants rc.34/35/36 bundled into a single rc.34 ship.

---

## Scope (3 subsystems in one RC)

### Part 1 — `bunny domain connect <pzId> <fqdn>` (atomic Connect Domain)

Bundles the 3-step flow we ran manually all afternoon:
1. addHostname (idempotent — skip if already linked)
2. enable-ssl with default 90s wait (idempotent — skip if cert already provisioned)
3. If `--dns-zone <id>` passed, also create a Type-7 PULLZONE record at `--name` (default `@`)

**Files:**
- New: `src/commands/domain/connect.ts` — thin command wrapper
- New: `src/core/domain.ts` — `connectDomain(pzId, fqdn, opts)` typed wrapper
- New: `src/commands/domain/` group (mirrors `dns/`, `pull-zone/` etc.)
- Modified: `src/manifest/registry.ts` — new `domain connect` entry
- Modified: `src/mcp/tools.ts` — new `bunny.domain_connect` MCP tool

**Args/flags:**
```
bunny domain connect <pullZoneId> <hostname>
  --dns-zone <id>        # also create the Type-7 PULLZONE record
  --name <subdomain>     # apex by default; e.g. --name=app for app.example.com
  --no-wait              # skip cert polling (for users who wait themselves)
  --timeout <seconds>    # cert wait timeout (default 90)
```

**MCP tool: `bunny.domain_connect`:**
```ts
inputSchema: {
  pullZoneId: number,
  hostname: string,
  dnsZoneId?: number,
  name?: string,    // defaults to '' (apex)
}
returns: { ok: true, hostnameLinked: boolean, hasCertificate: boolean, dnsRecordId?: number }
```

### Part 2 — `bunny init --ci` GH Actions workflow generator

`--ci` flag (no value, GH Actions only for v1) generates `.github/workflows/bunny-deploy.yml`:
- Triggers: `push: branches: [main]` + `workflow_dispatch:`
- Steps: checkout, setup-node, npm i -g bunny-tools, `bunny deploy --delete`
- Env: `BUNNY_ACCOUNT_KEY` from secrets; per-zone storage password from `BUNNY_STORAGE_PASSWORD_<ZONE_UPPER>`
- `paths-ignore`: `['**/*.md', 'docs/**', 'plans/**']` (mirrors new default ignores)
- Skip if `.github/workflows/bunny-deploy.yml` already exists; print path so user can review
- Print "secrets to add" checklist after generation

**Files:**
- New: `src/core/ci-workflow.ts` — `generateGitHubActionsWorkflow(config)` function
- Modified: `src/core/init.ts` — call generator when `--ci` flag set
- Modified: `src/manifest/registry.ts` — add `--ci` flag to `init`

### Part 3 — `bunny.json deploy.headers` + `deploy.edgeRules` declarative

#### Schema additions (`src/config/bunny-json.ts`)
```ts
const HeaderRule = z.object({
  pattern: z.string().min(1),               // glob: "/*.html", "/assets/*"
  headers: z.record(z.string(), z.string()),// { "Cache-Control": "...", "X-Foo": "bar" }
});

const EdgeRuleSpec = z.object({
  description: z.string().min(1),
  actionType: z.enum([
    'ForceSSL', 'Redirect', 'OriginUrl', 'OverrideCacheTime', 'BlockRequest',
    'SetResponseHeader', 'SetRequestHeader', 'ForceDownload',
    'DisableTokenAuthentication', 'EnableTokenAuthentication',
    'OverrideCacheTimePublic', 'IgnoreCacheControl', 'DisableCors',
    'EnableCors', 'BypassPermaCache', 'OverrideBrowserCacheTime',
  ]),
  actionParameter1: z.string(),
  actionParameter2: z.string().optional(),
  triggerType: z.enum(['Url', 'RequestHeader', 'ResponseHeader', 'UrlExtension', 'CountryCode', 'RemoteIP', 'StatusCode']),
  triggerPatterns: z.array(z.string()).min(1),
  triggerMatchingType: z.enum(['Any', 'All', 'None']).default('Any'),
  enabled: z.boolean().default(true),
});

DeployBlock += {
  headers: z.array(HeaderRule).default([]),
  edgeRules: z.array(EdgeRuleSpec).default([]),
}
```

#### Compilation: `headers` → edge rules

For each `{ pattern, headers }` entry:
- For each `(key, value)` in `headers`:
  - **`Cache-Control: max-age=N`** (or `s-maxage=N`) → ActionType 3 (`OverrideCacheTime`) + ActionType 15 (`OverrideBrowserCacheTime`), parameter1 = `N` seconds
  - **Anything else** (including `Cache-Control: no-store`, `must-revalidate`) → ActionType 5 (`SetResponseHeader`), parameter1 = `<key>: <value>`
- Each edge rule gets:
  - `Description = "managed-by-bunny-tools: hash=<sha256-prefix(spec)>"` — managed marker
  - `Triggers = [{ Type: 0 (Url), PatternMatches: [pattern], PatternMatchingType: 0 (Any) }]`
  - `TriggerMatchingType = 0 (Any)`

#### Compilation: `edgeRules` → edge rules
Pass-through with marker. Each entry becomes one rule with:
- `Description = "managed-by-bunny-tools: <user-description>"`
- `ActionType = <enum-to-int-map>`
- `ActionParameter1/2 = <user-supplied>`
- `Triggers = [{ Type: <map>, PatternMatches: triggerPatterns, PatternMatchingType: <map> }]`
- `Enabled = <user-supplied>`

#### Sync algorithm (per pull zone in `deploy.pullZones`)

**Skip entirely** if `headers.length === 0 && edgeRules.length === 0`.

Otherwise:
1. `getPullZone(pzId)` → read existing rules from `EdgeRules` field
2. Filter to managed: `r.Description?.startsWith('managed-by-bunny-tools:')`
3. Compute desired list from compiled `headers` + `edgeRules`
4. Diff:
   - **Add**: in desired, no match in managed (by description)
   - **Update**: same description prefix but different ActionParameter/Triggers → `addOrUpdateEdgeRule` with the existing `Guid`
   - **Delete**: in managed, no match in desired → `deleteEdgeRule(pzId, guid)`
5. Log: `i synced edge rules: +N added, ~M updated, -K deleted`

User-added edge rules (Description NOT starting with `managed-by-bunny-tools:`) are never touched.

#### Multi-PZ behavior
Apply to all PZs in `deploy.pullZones`. Each PZ gets its own diff against its own existing managed rules. v0.2 can add per-PZ overrides.

**Files:**
- New: `src/core/edge-rules-sync.ts` — compile + diff + apply
- New: `src/api/account.ts` — extend `EdgeRule` type to include all fields we read/write
- Modified: `src/core/deploy.ts` — call sync after upload phase (before purge)
- Modified: `src/config/bunny-json.ts` — schema additions
- Modified: `src/manifest/registry.ts` — bunny.json schema regen via `gen:schema`

## Tests

- `test/core/domain.test.ts` — connectDomain idempotency (cert already true → skip enable-ssl; hostname already linked → skip addHostname)
- `test/core/ci-workflow.test.ts` — generated YAML matches expected snapshot for various feature combos
- `test/core/edge-rules-sync.test.ts` — compile headers (Cache-Control branch + SetResponseHeader branch); diff add/update/delete; managed-marker filter
- Existing tests untouched

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Edge-rule sync deletes user rules unexpectedly | Strict description prefix check (`managed-by-bunny-tools:`); never touch rules without it. Document the marker prominently. |
| Cache-Control compilation is wrong (Bunny's caching semantics differ from Cloudflare) | Document the mapping: `max-age` → OverrideCacheTime (edge) + OverrideBrowserCacheTime; everything else → SetResponseHeader. Users can always drop to raw `edgeRules` for control. |
| connect-domain partial failure (hostname added but cert times out) | Don't roll back hostname — user can retry. Log clearly which step succeeded. |
| init --ci overwrites existing workflow | Check existence; skip if present, print "exists, edit manually" message. |
| Multi-PZ sync causes 5-second deploy slowdown for users with many PZs | Acceptable. Edge-rule sync APIs are sequential per PZ. Run them in parallel across PZs. |
| Description marker hash mismatch on minor whitespace changes | Hash stable spec (sorted JSON). Whitespace in user description doesn't change hash. |

## Effort estimate (honest)

- connect-domain: 90 min (well-scoped from prior brainstorm)
- init --ci: 60 min (template + tests)
- Schema additions: 20 min
- headers compiler (Cache-Control smart): 60 min
- edgeRules compiler (raw): 30 min
- Sync algorithm (compile + diff + apply): 90 min
- Multi-PZ wiring: 30 min
- Tests: 90 min
- Docs (README + changelog + roadmap): 30 min

**Total: ~7 hours.** Single sitting; user committed.

## Out of scope (v0.2)

- Per-PZ `headers`/`edgeRules` overrides
- GitLab CI / CircleCI / Jenkins workflow generators
- Edge rule "preview/diff" subcommand (`bunny pullzone preview-rules`)
- `bunny.json deploy.redirects` (Netlify-style; compiles to ActionType 1 Redirect)
- Cache-Control directive-level smartness (vary, immutable, stale-while-revalidate)

## Open questions

None — all 4 ambiguities resolved (placement, CI platforms, cache smartness, sync trigger).
