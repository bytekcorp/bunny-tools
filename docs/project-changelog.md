# bunny-tools Changelog

All notable changes to bunny-tools are documented here. This changelog follows [Keep a Changelog](https://keepachangelog.com/) conventions.

---

## [0.1.0-rc.44] — 2026-05-03 (Wrangler-style two-line help header)

### Changed
- **Help title and description split onto separate lines.** Previous format was an em-dash one-liner (`bunny dns record — DNS record CRUD`); rc.44 mirrors wrangler's visual hierarchy with the title on its own line and the description as a paragraph below. Trade-off: +1 line per help page in exchange for a description that visually reads as a paragraph instead of sliding off the title row. Matters more as command names get longer (`bunny dns record add <zoneId> <type> <name>`).
- **USAGE block dropped on groups and root.** It was always `bunny <X> <subcommand> [args] [flags]` — pure boilerplate when the COMMANDS section already enumerates every runnable command. USAGE retained on leaves where the positional-arg signature carries real information (`bunny dns record add <zoneId> <type> <name> [value] [flags]`).
- **No emoji.** Wrangler uses 🚢 / 🚀 / etc. on the description line; bunny-tools stays text-only for accessibility and grep-friendliness. Convention matches gh / aws / docker / firebase.

### Unchanged (intentional)
- Per-section auto column widths (rc.42) preserved. COMMANDS computes its own column based on the longest left in that section; GLOBAL FLAGS uses its own min. Asymmetry on dense pages (e.g. `bunny dns --help`) is by design — forcing whole-screen alignment makes flag rows have 30+ chars of whitespace.

### Test Coverage
- 175/175 unit (unchanged — formatter is internal, tests cover render-help.ts which is a separate JSON/text manifest renderer).

---

## [0.1.0-rc.43] — 2026-05-03 (Scrub maintainer's domain from user-facing examples)

### Changed
- **README.md AI-agent quickstart example** swapped `chien.do` → `example.com`. The maintainer's personal domain shouldn't appear in user-facing docs (it had been used as a real-life test target during rc.13–rc.30 development).
- **src/core/dns.ts** comment in the PULLZONE pre-flight cleaned up: `verified live on bytek.org against rc.30` → `verified live in rc.30`. Same rationale.

### Note on docs/ and journals/
- Historical changelog/journal entries that reference `bytek.org` are intentionally left intact — they're records of what specifically happened on each RC and the domain context is meaningful for future debugging.

### Help-format design decision (no code change)
- Subgroup help shows COMMANDS at one column width (per-group max) and GLOBAL FLAGS at another (NAME_COL_MIN=40). This asymmetry is intentional and matches wrangler / gh / docker / firebase. Forcing whole-screen alignment would push GLOBAL FLAGS rows into 30+ chars of whitespace before the description.

---

## [0.1.0-rc.42] — 2026-05-03 (Help column alignment for long-arg commands)

### Fixed
- **Subgroup help description column was ragged for long-arg commands.** `bunny dns --help` and `bunny stream --help` showed `bunny dns record add <zoneId> <type> <name> [value] Add a DNS record...` with no padding because the left column exceeded the fixed 40-char min, falling back to a single-space gap. rc.42 computes per-group column width (longest left + 2 chars), so all rows in a group's COMMANDS block share one description column. Same fix applied to root-help sections.

### Test Coverage
- 175/175 unit (unchanged).

---

## [0.1.0-rc.41] — 2026-05-03 (Fix rc.40's MIME warning pattern syntax)

### Fixed
- **rc.40's `.mjs` warning suggested the wrong glob shape.** The warning emitted `"pattern": "**/*.mjs"` but Bunny's URL triggers don't accept `**` glob syntax — they silently no-op (verified live: rule "added" but didn't actually match anything). Correct syntax is `"pattern": "*.mjs"` (simple wildcard). rc.41 emits the corrected snippet so copy-paste actually works.

### Live-tested on bytek.org
- `*.mjs` rule → Bunny stored ActionType=5 (SetResponseHeader), `Content-Type: text/javascript; charset=utf-8` actually applied.
- `**/*.mjs` rule → Bunny accepts the API call but `added=0` (silent rejection / pattern doesn't match anything).

### Test Coverage
- 175/175 unit (unchanged; warning text isn't unit-tested but live-verified).

---

## [0.1.0-rc.40] — 2026-05-03 (Three real-world bugs caught after rc.39 ship)

### Fixed
- **`bunny domain connect` is now actually idempotent.** Previously each call appended a duplicate Type-7 DNS record on the target zone (despite the docstring claiming idempotency). rc.40 pre-checks: `listRecords(dnsZoneId)` → find any Type-7 with matching `(Name, LinkName)` → reuse its id instead of creating. Verified live: two consecutive `domain connect` calls now share `dnsRecordId`.
- **FLATTEN dropped from supported DNS record types.** Bunny's OpenAPI spec says type=6 is Flatten, but the live API rejects it: `validation_error: Unknown record type` (verified against api.bunny.net). The CLI now surfaces a clear client-side rejection (`Invalid discriminator value`) instead of letting users hit Bunny's confusing rejection. If/when Bunny re-enables Flatten on the live API, restore the entry.

### Added
- **`bunny deploy` warns when uploading extensions Bunny edge serves wrong.** `.mjs`, `.wasm`, `.webmanifest` upload metadata gets ignored by Bunny's edge MIME table — files end up served as `application/octet-stream`. rc.40 emits ONE warning per extension per deploy with the exact `bunny.json deploy.headers` snippet to fix it. (Bunny-side issue; CLI surfaces it earlier.)

### Test Coverage
- 175/175 unit (was 174; +1 connectDomain idempotency regression test that fails without the fix).
- 46 e2e (unchanged).

### Live-tested on bytek.org
- `domain connect` ×2 → single Type-7 record at apex (id 16998107 reused).
- FLATTEN add → client-side rejection before any API call.

### Surface (unchanged)
- 55 active commands.
- 18 MCP tools.

---

## [0.1.0-rc.39] — 2026-05-03 (OIDC trusted publishing; release workflow change)

### Changed
- **Release workflow pivoted to GitHub Actions OIDC trusted publishing** (breaking with manual `npm publish` era).
  - No local npm token needed. No OTP prompts. Ephemeral GitHub identity signs every RC.
  - Tag push `v0.1.0-rc.X` triggers `.github/workflows/release.yml`: typecheck → lint → test → build → drift-check → publish.
  - Every RC published to `latest` dist-tag (pre-1.0 convention; switches to `next` on GA).
  - Each published RC includes npm provenance signature (cryptographic proof of origin).

### Deployment Process
1. Bump `version` in `package.json` AND `src/manifest/registry.ts` (must match).
2. `npm run gen:all && npm run build` to regenerate manifest.json, AGENTS.md, schema/bunny.schema.json, dist/.
3. Update `docs/project-changelog.md` and `docs/project-roadmap.md`.
4. `git commit -m "feat/fix/chore: 0.1.0-rc.X — <title>"` + `git push origin main`.
5. `git tag v0.1.0-rc.X && git push origin v0.1.0-rc.X`.
6. GitHub Actions runs CI gates and publishes to npm automatically (OIDC handles auth).

### Documentation
- New `docs/deployment-guide.md` — step-by-step release recipe, OIDC rationale, troubleshooting.
- No `~/.npmrc` token workarounds documented (OIDC is the only blessed path).
- No `--otp=<code>` instructions anywhere (pre-1.0 burden eliminated).

### Test Coverage
- 174/174 unit (unchanged).
- 46 e2e (unchanged).

### Surface (unchanged)
- 55 active commands.
- 18 MCP tools.

---

## [0.1.0-rc.38] — 2026-05-03 (Sectioned root help; one line per service)

### Added
- **Root help (`bunny --help`) now sectioned wrangler/gh/aws-style:**
  - `GETTING STARTED` — daily-workflow commands (init, deploy, configure).
  - `SERVICES` — one line per top-level group (pullzone, domain, dns, stream, storage, storagezone, containers, scripting). Each row reads `bunny <group> <subcmd>     <description> (N cmds)`.
  - `UTILITIES` — discovery + maintenance (purge, use, whoami, manifest, mcp, install, update, docs).
- **Sub-group help unchanged** — `bunny pullzone --help` still expands all 11 leaves (including former sub-groups like `pullzone hostname add`, `pullzone edgerule list`).

### Fixed
- **Sub-group fragmentation.** Previously root help split each top-level service into multiple pointer rows (e.g. `pullzone ...`, `pullzone edgerule ...`, `pullzone hostname ...` — 3 rows for one service). Now collapsed into a single `bunny pullzone <subcmd>` line per service.

### Internal
- `COMMAND_GROUPS` (rc.20–37) replaced with three categorical `SECTIONS`. Renderer auto-collapses any top-level word with sub-commands; renders bare commands directly when no subcommands exist.

### Test Coverage
- 174/174 unit (unchanged; help renderer has no dedicated tests yet — output is human-only and verified by inspection).
- 46 e2e (unchanged).

### Surface (unchanged)
- 55 active commands.
- 18 MCP tools.

---

## [0.1.0-rc.37] — 2026-05-03 (Idempotent hostname `add` collapses 3 subcommands; `--no-X` flag bug fix)

Surface simplification + a real bug found via live testing.

### BREAKING
- **Removed `bunny pullzone hostname enable-ssl`** (rc.26) — its work is now inside `add`.
- **Removed `bunny pullzone hostname force-ssl`** (rc.36, just shipped) — same; toggle via `add --no-force-ssl` (state assertion: re-run flips OFF).
- **Removed MCP tools** `bunny.pullzone_hostname_enable_ssl` and `bunny.pullzone_hostname_force_ssl`. Use `bunny.pullzone_hostname_add` with `noSSL` / `noForceSSL` boolean fields.
- **Migration:** scripts using `enable-ssl <pzId> <host>` should switch to `add <pzId> <host>` (same default behavior). Scripts using `force-ssl <pzId> <host> --off` should switch to `add <pzId> <host> --no-force-ssl`.

### Added
- **`bunny pullzone hostname add` is now an idempotent state-setter:**
  - Default: link hostname + provision Let's Encrypt cert + enable ForceSSL (HTTP→HTTPS redirect).
  - `--no-force-ssl`: provision cert, ensure ForceSSL=false (state assertion — re-running flips OFF a previously-on hostname).
  - `--timeout=<sec>`: cert wait timeout (default 90).
- **MCP `bunny.pullzone_hostname_add`** gains optional `noForceSSL` (boolean) and `timeoutMs` (number) fields.

### Fixed
- **CLI `--no-X` flags weren't being read correctly.** Commander.js negates `--no-foo` as `foo: false` — but our code was reading `noFoo: true` which is always undefined. Latent in rc.30+ for `domain connect --no-wait` and `--no-force-ssl`; would have hit users on first attempt to opt out. Fixed in `pullzone hostname add` and `domain connect`.

### Live-tested on bytek.org
- ADD default → cert + ForceSSL=true.
- ADD re-run → idempotent (no state change).
- ADD `--no-force-ssl` → flips ForceSSL=false (verified `Hostnames[].ForceSSL=false`).
- ADD default again → brings ForceSSL back ON.

### Test Coverage
- 174/174 unit (unchanged; existing enable-ssl tests cover the underlying `enablePullZoneSSL` core which is still exported and used).
- 46 e2e (updated to use `bunny.pullzone_hostname_add` for cert provisioning).

### Surface
- 55 active commands (was 57; removed 2 subcommands).
- 18 MCP tools (was 20; removed 2).

---

## [0.1.0-rc.36] — 2026-05-03 (Auto-ForceSSL + orphan rule cleanup)

### Added
- **Auto-enable ForceSSL after cert provisions.** `pullzone hostname enable-ssl` and `domain connect` now flip `ForceSSL=true` on the matched hostname after Let's Encrypt cert lands. HTTP→HTTPS redirect is the 2026 default. Idempotent: re-running on a hostname that already has cert+ForceSSL is a no-op.
- **`--no-force-ssl` opt-out** on `enable-ssl` and `domain connect` for users who want HTTP+HTTPS coexistence (legacy migrations, plain-HTTP testing).
- **`bunny pullzone hostname force-ssl <pzId> <hostname> [--off]`** new command. Toggle ForceSSL without re-provisioning a cert. Default ON; pass `--off` to disable.
- **MCP `bunny.pullzone_hostname_force_ssl`** new tool with `(pullZoneId, hostname, force: boolean)`.
- **MCP `bunny.pullzone_hostname_enable_ssl`** + **`bunny.domain_connect`** gain optional `noForceSSL?: boolean` field.

### Fixed
- **Edge-rule sync no longer orphans managed rules when user removes `headers`/`edgeRules` from bunny.json.** rc.34/35 gated the sync on `hasDeclaredRules(config)` — empty config skipped sync entirely, leaving previously-managed rules on the PZ. rc.36 always runs sync when `pullZones` is non-empty (~50ms extra `getPullZone` per PZ per deploy). Empty config now correctly deletes orphaned managed rules. Verified live on bytek.org.

### Live-tested on bytek.org
- enable-ssl → cert provisioned + ForceSSL=true (verified `Hostnames[].ForceSSL`).
- force-ssl --off → ForceSSL=false; re-run enable-ssl → flipped back to true (idempotent).
- enable-ssl `--no-force-ssl` → cert provisioned, ForceSSL stays false.
- Orphan cleanup: ADD 1 rule → remove headers from config → sync deletes the orphan (1 managed → 0).

### Test Coverage
- 174/174 unit (was 173; +1 ForceSSL flip test).
- 46 e2e (unchanged).

### Surface
- 57 active commands (was 56; new `pullzone hostname force-ssl`).
- 20 MCP tools (was 19; new `bunny.pullzone_hostname_force_ssl`).

---

## [0.1.0-rc.35] — 2026-05-03 (rc.34 live-test fixes + e2e coverage)

Two real bugs discovered via live smoke against bytek.org. Both rc.34 features (`bunny domain connect` and `deploy.headers` sync) tested end-to-end on a real PZ.

### Fixed
- **`SetResponseHeader` edge rule shape** — `compileHeaderRule` was emitting `ActionParameter1: "Name: Value"` (combined string). Bunny rejects with "Please enter a valid header name." Correct shape: `ActionParameter1: name`, `ActionParameter2: value` (split). Verified live on bytek PZ.
- **No-op sync runs reported false `updated` count** — `isShapeEqual` deep-compared local + remote rules, but Bunny normalizes the response shape (Triggers reshaped, fields reordered) so identical-spec rules looked different. Removed `isShapeEqual` entirely; trust the description hash (sha256 of spec) as the identity check. Same hash means same spec by construction. Result: idempotent re-runs report `added: 0, updated: 0, deleted: 0`. `updated` counter remains in result envelope for back-compat / future force-resync mode.

### Added
- **MCP e2e for `bunny.domain_connect`** — gated on `BUNNY_E2E_CERT_DOMAIN` + `BUNNY_E2E_DNS_ZONE_ID`. Runs the full atomic flow against a real PZ + DNS zone; cleans up DNS record and hostname after.
- **`listTools` ≥18 assertion + spot-check for `bunny.domain_connect`** — catches version-drift if the MCP tool isn't registered.
- **Hard-cap bumped 20 → 22** to leave buffer for v0.2 tools.

### Live-tested on bytek.org (smoke)
- `bunny domain connect 5789465 bt-smoke-rc34.bytek.org --dns-zone=784669` → end-to-end in 2.5 seconds (cert provisioned via DNS-01 in 0s wait, DNS Type-7 record id=16998557).
- Edge-rules-sync 4-stage round-trip: ADD (3 added) → NO-OP (0/0/0) → UPDATE max-age (2 add + 2 delete) → CLEANUP (3 deleted). Cleanup verified zero managed rules remain.

### Test Coverage
- 173/173 unit (unchanged).
- 46 e2e (was 45; +1 domain_connect e2e).

---

## [0.1.0-rc.34] — 2026-05-03 (Connect Domain + CI generator + declarative edge rules)

Largest single ship of the session. Three subsystems landed together (originally planned as rc.34/35/36 separately).

### Added — atomic Connect Domain
- **`bunny domain connect <pzId> <fqdn>`** new command. Bundles addHostname → enable-ssl (waits up to 90s) → optional Type-7 DNS record into one idempotent op. Mirrors the Bunny dashboard's "Connect Domain" button.
- **Flags:** `--dns-zone <id>` (also create the apex Type-7 record), `--name <subdomain>` (default `@`), `--no-wait`, `--timeout <seconds>`.
- **MCP:** new `bunny.domain_connect` tool with same shape (`pullZoneId`, `hostname`, optional `dnsZoneId`, optional `recordName`).

### Added — `bunny init --ci` GH Actions generator
- **`--ci` flag on `bunny init`** generates `.github/workflows/bunny-deploy.yml`. Triggers on `push:main` + `workflow_dispatch:`; installs bunny-tools globally; runs `bunny deploy --delete`. `paths-ignore` covers `**/*.md`, `docs/**`, `plans/**`.
- **Per-zone secret:** uppercase `BUNNY_STORAGE_PASSWORD_<ZONE>` env var matches the resolver chain.
- **Skips when file exists** — non-destructive. Prints "secrets to add" checklist after generation.
- **GitHub Actions only for v1.** GitLab/CircleCI templates can land in v0.2.

### Added — declarative edge rules in `bunny.json`
- **`deploy.headers: [{ pattern, headers }]`** — Netlify/Cloudflare-style declarative response headers. Compiled to edge rules at deploy time.
- **`deploy.edgeRules: [...]`** — raw edge rule declarations for full power (CountryCode triggers, BlockRequest, etc.).
- **Smart `Cache-Control` compilation:** `Cache-Control: max-age=N` becomes TWO edge rules — `OverrideCacheTime` (edge cache) + `OverrideBrowserCacheTime` (browser cache). Other Cache-Control directives (`no-store`, `must-revalidate`) and other headers fall through to `SetResponseHeader`.
- **Auto-sync on every deploy** when either array is non-empty. Skipped entirely (no API calls) when both are empty.
- **Idempotent + non-destructive:** managed rules tagged via `Description: "managed-by-bunny-tools: <kind> hash=<sha256-prefix>"`. User-added rules (created in dashboard or via raw API) are never touched.
- **Diff: add/update/delete** — content-hash based; any spec change produces a different hash → handled cleanly.
- **Multi-PZ:** sync runs against every PZ in `deploy.pullZones`.
- New event: `edge-rules-sync` reports `+N added, ~M updated, -K deleted` per PZ.

### Test Coverage
- 173/173 unit (was 157; +16 across `domain.test.ts` (+2), `ci-workflow.test.ts` (+4), `edge-rules-sync.test.ts` (+10)).
- 45 e2e (unchanged).

### Surface
- 56 active commands (was 55).
- 19 MCP tools (was 18).

### Files Touched
- New: `src/commands/domain/connect.ts`, `src/core/domain.ts`, `src/core/ci-workflow.ts`, `src/core/edge-rules-sync.ts`, `src/util/format-error.ts`
- New tests: `test/core/domain.test.ts`, `test/core/ci-workflow.test.ts`, `test/core/edge-rules-sync.test.ts`
- Modified: `src/config/bunny-json.ts` (HeaderRule + EdgeRuleSpec schemas), `src/core/zones.ts` (EdgeRule.Triggers typed), `src/core/deploy.ts` (sync invocation + new event), `src/commands/init.ts` + `src/commands/deploy.ts` (event handlers), `src/manifest/registry.ts` (3 new entries: `domain` group, `domain connect`, `init --ci`), `src/mcp/tools.ts` (new tool)

---

## [0.1.0-rc.33] — 2026-05-03 (MIME complete + DX polish bundle)

### Added
- **`mime-types` package replaces manual `src/util/content-type.ts` table.** Covers ~1000 extensions from mime-db, including previously-missing `.webmanifest`, `.opus`, `.heic`. Auto-appends `; charset=utf-8` for UTF-8 text types per mime-db's charset table. `application/octet-stream` fallback unchanged.
- **`bunny.json deploy.mimeTypes: { ".ext": "type" }` overrides** — dot-prefix keys; user values win over mime-types defaults. Schema validated.
- **`bunny deploy --verbose`** prints `<path> [<mime>] (<size>)` per upload AND lists ALL orphan paths in dry-run output. Default dry-run shows first 10 orphans + count.
- **Auto-migrate `bunny.json deploy.ignore`** to rc.33+ baseline (15 entries: includes `docs/**`, `plans/**`, `scripts/**`, `tests/**`, `*.md`, `LICENSE*`, etc.). Triggers ONLY when current array is byte-equal to the rc.13–32 legacy 5-entry default. Idempotent; preserves any user customization.
- **MCP `bunny.dns_record_set` PULLZONE convenience** — accepts optional `pullZoneId: number`. When set + type=PULLZONE, auto-derives `value` (PZ name) and `linkName` (PZ id). Mirrors CLI's `--pull-zone` flag.
- **Auto-spawned PZ detection** — after `dns record add` returns, if response has `AcceleratedPullZoneId !== 0`, prints `i Bunny auto-created pull zone <id> to handle this <TYPE> record.` Catches REDIRECT side effects.
- **`bunny deploy` warns on >5 MB files** at upload time. Non-blocking; helps catch accidentally committed binaries.
- **`bunny init` now prints masked account key** when skipping auth (`Account key already configured (***xxxx)`).
- **Sharper MCP `bunny.deploy` description**: "Recommended for CI/CD. End-to-end deploy: walks publicDir, diffs vs storage zone, uploads with proper MIME types in parallel, optionally purges CDN. Replaces custom upload scripts."

### Test Coverage
- 157/157 unit (was 146; +11 across content-type and ignore-migration).
- 45 e2e (unchanged).

### Files Touched
- New: `src/util/content-type.ts` (rewritten), `src/core/ignore-migration.ts`
- New tests: `test/util/content-type.test.ts`, `test/core/ignore-migration.test.ts`
- Modified: `src/config/bunny-json.ts`, `src/core/deploy.ts`, `src/core/init.ts`, `src/commands/deploy.ts`, `src/commands/dns/record/add.ts`, `src/manifest/registry.ts`, `src/mcp/tools.ts`, `src/api/account.ts` (DnsRecord type extended)
- Dependencies: `mime-types`, `@types/mime-types`

---

## [0.1.0-rc.32] — 2026-05-03 (MCP e2e coverage for hostname tools)

### Added
- **`test/e2e/mcp.e2e.ts` extended:** new `pullzone_hostname_{list,add,remove}` round-trip test against a throwaway PZ (uses `bt-e2e-*.example.com` placeholder hostnames) — exercises the rc.25 flow and rc.30 POST→DELETE remove fix end-to-end.
- **`pullzone_hostname_enable_ssl` e2e** gated on new env var `BUNNY_E2E_CERT_DOMAIN` (set to a domain you own with Bunny NS authoritative — DNS-01 challenge needs that). Uses `bt-e2e-*.<domain>` and waits up to 90s for Let's Encrypt; cleans up hostname even on failure. Skipped silently in CI nightly unless var configured.
- **`listTools` count assertion bumped** from `≥14` (rc.22) to `≥17` (rc.31). Spot-check now includes the 4 hostname tools.
- **Throwaway PZ added to MCP e2e beforeAll** alongside the existing storage zone and DNS zone — registered with cleanup-registry, deleted in afterAll.

### Test Coverage
- 146/146 unit + 45 e2e (was 44; +1 hostname round-trip; enable_ssl gated and not counted in default runs).

---

## [0.1.0-rc.31] — 2026-05-03 (Drop init-time AGENTS.md write)

### Removed
- **`bunny init` no longer touches user's `AGENTS.md`.** The implicit `## Deploy` hint and the `--no-agents-md` flag are gone. Reasoning: no major CLI (firebase, vercel, wrangler, gh, npm) modifies AI-context files in user projects on init — touching files outside the requested config is invasive. Discovery is already covered by `bunny --help`, `bunny manifest`, and the AGENTS.md inside the npm tarball (consumed by MCP servers as a resource).

### Internal
- Removed `maybeWriteAgentsHint`, related constants and node:fs imports from `src/commands/init.ts`. ~30 LOC delta.
- Removed `noAgentsMd` flag handling and registry entry.

### Test Coverage
- 146/146 (no test count change; no test covered the removed code path).

---

## [0.1.0-rc.30] — 2026-05-03 (PULLZONE field name fix + reverts rc.29 conflict-check)

### Reverted
- **rc.29's PULLZONE conflict-detection removed.** Live test on bytek.org proved Bunny accepts PULLZONE alongside A at the same Name. Premise was wrong; the real gate was the input field name (see below). Conflict pre-flight had a latent `'@' vs ''` normalization bug that masked the wrongness in tests.

### Fixed
- **PRIMARY: PULLZONE (Type-7) records now POST `PullZoneId` (numeric) instead of `LinkName` (string).** Bunny's `PUT /dnszone/{id}/records` validation requires the numeric `PullZoneId` field for Type-7; sending `LinkName` alone fails with `"The pull zone ID is not valid"` (Field: Value). Bunny derives `Value` and `LinkName` from `PullZoneId` on the response — so the chien.do "reference shape" we'd been mirroring was actually the response, never a valid request body. Identified by sniffing the dashboard's network call against bytek.org. SCRIPT (Type 11) still uses `LinkName` (untested but no contradicting evidence).
- **`pullzone hostname remove` returned HTTP 405 in production.** Bunny's `/pullzone/{id}/removeHostname` endpoint requires DELETE, not POST. Asymmetric to `addHostname` (POST) but verified live.
- **Bunny error envelopes stripped `ErrorKey` and `Field` from CLI output.** Command handlers caught errors with `(err as Error).message` and lost the structured envelope context. The shared formatter `formatBunnyError` (extracted from `cli.ts`) now applies in `dns record add` and other handlers, surfacing e.g. `[validation_error] The pull zone ID is not valid. (field: Value) (HTTP 400)` instead of just the message.

### Internal
- `formatBunnyError` moved from `src/cli.ts` (private) to `src/api/errors.ts` (shared) so any command handler can enrich Bunny errors with the same shape.

### Test Coverage
- 149/149 (no count change; happy-path PULLZONE test now asserts `PullZoneId: <number>` is sent and `LinkName` is NOT in the body).

---

## [0.1.0-rc.29] — 2026-05-03 (PULLZONE conflict detection in pre-flight)

### Fixed
- **`dns record add PULLZONE` now detects existing resolving records at the same Name** — Bunny silently rejects PULLZONE-at-apex (and other names) when an A/AAAA/CNAME/REDIRECT/FLATTEN/PULLZONE already exists there, with the same misleading "The pull zone ID is not valid" error. Pre-flight now scans `dnsZone.Records[]` (already fetched, no extra API call) and surfaces: `Conflicting <type> record at <fqdn> (id=<X> value=<Y>). Run: bunny dns record delete <zoneId> <X>`.
- Auxiliary types (TXT, MX, NS, SRV, CAA, PTR, SCRIPT) coexist fine at the same Name and are not flagged.

### Test Coverage
- 149/149 (up from 146; +3 conflict-detection branches: A-conflict at apex, CNAME-conflict at subdomain, no-conflict-with-TXT/MX happy path).

---

## [0.1.0-rc.28] — 2026-05-03 (Centralize PULLZONE pre-flight in core)

### Fixed
- **MCP `bunny.dns_record_set` and CLI `dns record add` (without --pull-zone) now also pre-flight PULLZONE records.** Previously the pre-flight (hostname-linked + cert-issued) lived only in the CLI command's `--pull-zone` flag handler; MCP and the bare CLI path bypassed it and surfaced Bunny's misleading "The pull zone ID is not valid" error. Pre-flight moved to `core/dns.addRecord` so every caller gets the friendly "Run: bunny pullzone hostname enable-ssl <id> <fqdn>" hint.

### Internal
- **Test isolation:** `test/setup.ts` now recreates the undici `MockAgent` per test (was per-suite). Stops `.times(N)` and `.persist()` interceptors from leaking across tests. Surfaced as flaky failures in rc.26/rc.27 development.

### Test Coverage
- 146/146 (up from 143; +3 PULLZONE pre-flight branches: hostname-not-linked, hostname-linked-but-no-cert, happy path).

---

## [0.1.0-rc.27] — 2026-05-03 (Fix loadFreeCertificate HTTP shape)

### Fixed
- **`enable-ssl` was failing with "The request is invalid"** — Bunny's `/pullzone/loadFreeCertificate` endpoint is **GET**, not POST (despite being a state-changing call). rc.26 was sending POST, Bunny returned 400.
- **DNS-01 validation now opt-in via default** — added `useOnlyHttp01=false` query param. When the hostname is on a Bunny DNS zone (NameserversDetected=true), Bunny prefers DNS-01 over HTTP-01. Lets cert provision without any pre-existing A/AAAA records on the apex.

### Test Coverage
- 143/143 (no test count change — existing enable-ssl tests updated to mock the GET shape).

---

## [0.1.0-rc.26] — 2026-05-03 (Pull Zone SSL Provisioning + Cert Pre-flight)

### Added
- **`bunny pullzone hostname enable-ssl <pzId> <hostname>`** — wraps `POST /pullzone/loadFreeCertificate?hostname=<host>`. Polls PZ.Hostnames[].HasCertificate every 5s up to 90s; returns when Let's Encrypt cert is provisioned.
- **`dns record add --pull-zone <id>` cert pre-flight** — also checks `HasCertificate` on the matched hostname. If false, fails with copy-pasteable `bunny pullzone hostname enable-ssl <id> <fqdn>` instead of letting Bunny return the misleading "The pull zone ID is not valid" error.
- **MCP tool:** `bunny.pullzone_hostname_enable_ssl` — same shape as add/remove, returns `{ ok, hasCertificate, waitedMs }`.
- **`PullZoneHostname` type extended** — now exposes `Id`, `HasCertificate`, `ForceSSL`, `IsSystemHostname` (was `{ Value }` only).

### Fixed
- **Cert chicken-and-egg surfaced clearly** — users no longer hit Bunny's silent rejection when wiring DNS to PZ without prior cert provisioning.

### Test Coverage
- **Unit tests:** 143 total (up from 139 in rc.25); +4 enable-ssl coverage.
- **E2E tests:** 44 (unchanged).

### Surface
- 55 active commands (was 54).
- 18 MCP tools (was 17). Hard-cap raised to 20.

---

## [0.1.0-rc.25] — 2026-05-03 (Pull Zone Hostname Management)

### Added
- **`bunny pullzone hostname {list,add,remove}`** — wraps Bunny's dedicated `addHostname` / `removeHostname` subresource endpoints (previously only reachable via raw HTTP since `pullzone update` silently drops `Hostnames[]`).
- **`dns record add --pull-zone <id>` pre-flight check** — fetches PZ + DNS zone, computes target FQDN, fails with copy-pasteable `bunny pullzone hostname add <id> <fqdn>` when the hostname isn't linked yet (instead of letting Bunny silently reject the Type-7 record).
- **3 new MCP tools:** `bunny.pullzone_hostname_list`, `bunny.pullzone_hostname_add`, `bunny.pullzone_hostname_remove`.
- **`computeFqdn(name, domain)` helper** — exported, handles apex (`@`/empty), trailing-dot, wildcard (`*`).

### Test Coverage
- **Unit tests:** 139 total (up from 129 in rc.24); +3 hostname API + +5 FQDN helper coverage.
- **E2E tests:** 44 (unchanged).

### Surface
- 54 active commands (was 51) — `pullzone hostname {list,add,remove}` promoted.
- 17 MCP tools (was 14).

---

## [0.1.0-rc.24] — 2026-05-03 (DNS Routing Types Extended)

### Added
- **DNS routing types extended to 13:** REDIRECT (5), FLATTEN (6), PULLZONE (7), PTR (10), SCRIPT (11). Complete enum coverage.
- **`dns record add` enhancements:** `--link-name` (raw string) and `--pull-zone=<id>` (auto-resolves pull zone name + linkName).
- **MCP enum extended:** `bunny.dns_record_set` now supports all 13 types via MCP tools.
- **7 new unit tests:** DNS routing type coverage; 1 REDIRECT e2e round-trip.

### Test Coverage
- **Unit tests:** 129 total (up from 122 in rc.23)
- **E2E tests:** 44 total (with DNS REDIRECT round-trip)

---

## [0.1.0-rc.23] — 2026-05-03 (MCP E2E Harness Shipped)

### Added
- **MCP e2e harness (live):** `test/e2e/mcp.e2e.ts` spawns `bunny mcp`, connects via MCP SDK Client, exercises all 15 active tools + 2 skipped (init/deploy — MCP-native versions not needed). Helper: `test/e2e/helpers/mcp-client.ts`.
- 13 active MCP tool tests + 2 skipped = 15 total coverage.

### Fixed
- **Spawn process.execArgv forwarding:** `bunny.run` in tsx (dev) mode now correctly forwards argv so `.ts` entries execute.

### Test Coverage
- **E2E tests:** 44 total (13 tools + 30 service tests + 1 REDIRECT round-trip)

---

## [0.1.0-rc.22] — 2026-05-03 (Install MCP Fix)

### Fixed
- **`bunny install mcp` regression:** Was passing `-y` to claude itself instead of npx. Corrected via `--` separator: `claude mcp add bunny-tools -- npx -y bunny-tools mcp`.

---

## [0.1.0-rc.21] — 2026-05-03 (Subgroup Help Expansion)

### Changed
- **Subgroup help expansion:** `bunny stream --help` and similar now expands ALL leaf descendants regardless of depth (was showing only sub-pointers, leaving leaf commands hidden).

---

## [0.1.0-rc.20] — 2026-05-03 (Root Help Alignment)

### Changed
- **Root help collapse:** Commands with 3+ segments (e.g., `bunny pullzone edgerule add`) now show as 2-segment pointers (`pullzone edgerule ...`) for cleaner alignment in help output. Long arg signatures no longer break column layout.

---

## [0.1.0-rc.19] — 2026-05-03 (DX Polish — 4 GA Wins)

### Added
- **`bunny install mcp`:** Self-bootstraps Claude MCP configuration (new command, rc.19+).
- **`bunny update`:** Self-updates binary via npm with npx-mode detection + EACCES retry hints (new command, rc.19+).
- **`bunny init` AGENTS.md hint:** Writes `## Deploy` section hint during project init (helps users discover MCP docs).
- **Help layout polish:** Wrangler-style rendering (TITLE → USAGE → COMMANDS grouped by phase → GLOBAL FLAGS). No emoji. New `src/manifest/format-help.ts` renderer.

### Changed
- Help rendering switched from custom to wrangler-style layout for consistency with ecosystem.

---

## [0.1.0-rc.18] — 2026-05-03 (Hyphen Aliases Dropped — BREAKING)

### Removed
- **Hyphen aliases (BREAKING pre-GA):** `pull-zone`, `storage-zone`, `edge-rule` no longer work. Only canonical flat forms: `pullzone`, `storagezone`, `edgerule`. Exception: `cdn` alias for `pullzone` retained (dashboard parity).

### Changed
- Registry: aliases cleaned up to single `cdn` exception for `pullzone` group.

---

## [0.1.0-rc.17] — 2026-05-03 (Cdn Alias Added)

### Added
- **`cdn` alias for `pullzone` group:** `bunny cdn list` → `bunny pullzone list`. Matches Bunny dashboard sidebar terminology.

---

## [0.1.0-rc.16] — 2026-05-03 (Bare Bunny Help Convention)

### Changed
- **Bare `bunny` output:** Prints help to stdout (not stderr) with exit code 0 (wrangler convention, rc.16+). Matches `wrangler --help` behavior.

---

## [0.1.0-rc.15] — 2026-05-03 (ESM Main Detection Fix — CRITICAL)

### Fixed
- **CRITICAL: Bare `bunny` on -g installs:** Binary was silently exiting on globally-installed npm package (ESM symlink resolution issue). Fixed via `realpathSync` + `fileURLToPath(import.meta.url)` for proper main detection.
- Added `test/cli-main-detection.test.ts` regression test to prevent recurrence.

---

## [0.1.0-rc.14] — 2026-05-03 (README Rewrite)

### Changed
- **Bunny CLI README rewrite:** MCP install front-and-center. Clearer positioning of CLI vs MCP server. New title emphasis.

---

## [0.1.0-rc.13] — 2026-05-03 (Vitest Security Bump & E2E Harness Live)

### Added
- **E2E drift-detection harness (live):** 30 vitest tests hitting real Bunny API on nightly CI schedule (`npm run test:e2e` locally with `BUNNY_E2E=1`). Located in `test/e2e/` with 8 service files + helpers + mp4 fixture. Nightly workflow at `.github/workflows/e2e-nightly.yml` runs ~03:00 UTC, creates GitHub issues on failure labeled `e2e,drift`. Detects schema changes, endpoint breakage, status code shifts. All resources prefixed `bt-e2e-*` for cleanup.
- **Vitest 4.x:** Upgraded from 2.x to 4.x for security patch GHSA-67mh-4wv8-2f99 (esbuild dev-server CORS). Also upgraded `@vitest/coverage-v8` to 4.1.5. Removed unused direct esbuild devDep. npm audit clean.

### Changed
- Repository flipped PUBLIC (2026-05-03).
- CI: Added `.github/workflows/e2e-nightly.yml` (scheduled daily ~03:00 UTC, issue-on-fail).
- npm dist-tags: Both `latest` and `alpha` now point to rc.13 (previously `latest` stuck on rc.2).

### Test Coverage
- **Unit tests:** 122 tests passing (vitest 4.x)
- **E2E tests:** 30 tests (real Bunny, nightly)
- **Services covered:** account (readonly), storage-zones, storage-files, pull-zones, edge-rules, DNS, stream, scripting, deploy pipeline
- **Total:** 152 tests across 37 files

---

## [0.1.0-rc.12] — 2026-05-03 (Six Bug Fixes & Stream Library Delete Added)

### Added
- **`bunny stream library delete <id>`** — missing in rc.10, now available (get/delete completed rc.10 goal)

### Fixed
- **Storage subdir 404:** Fixed joinPath trailing slash causing "not found" on storage subdir operations
- **Bare-arg crash:** Fixed cli.ts positional argument slice leaking options object, causing "command not found" when no subcommand given
- **Edge rule endpoint:** Corrected subresource endpoint from `pullzone/:id/update` (wrong) to `pullzone/:id/edgerules/addOrUpdate` (correct)
- **Scripting deploy --id re-fetch:** Added post-204 re-fetch to ensure response body populated after scripting deploy with `--id` (was returning empty body)
- **Storage zone region normalization:** `storagezone --region <lowercase>` now correctly uppercases region code before API call (e.g., `us` → `US`)

### Changed
- **Containers app create demoted to `planned`:** Detected Bunny v3 API schema incompatibility during rc.12 fix work; deferred to v0.2 pending Bunny schema update. Other containers commands (list, delete) remain unavailable (already planned).
- Registry: 49 active (10 Phase 5), 2 planned (containers create + others), remainder deferred

### Tests
- All 122 unit tests passing with 6 bug fixes validated

---

## [0.1.0-rc.11] — 2026-05-03 (Internal-Only Transient)

**Status:** Internal-only. Transient version bumped during rc.12 fix work; never tagged or published to npm.

---

## [0.1.0-rc.10] — 2026-05-03 (UX Polish & Phase 5 Shipped)

### Added
- **Zone auto-defaults (H1):** `storage` commands default `--zone` from bunny.json or active alias. No `--zone` required when config present.
- **Group descriptions (H3):** `bunny --help` shows real subcommand descriptions (`storage` → "File operations within a storage zone"), not stubs.
- **Hyphenated aliases (H4, rc.10):** `pull-zone`, `storage-zone`, `edge-rule` all work alongside canonical flat forms.
- **Error detail surfacing (M4):** CLI errors now format as `[errorKey] message (field: X)` when Bunny returns structured error JSON.
- **`bunny manifest --names` (M5):** Emit one command name per line (useful for shell completion).
- **Phase 5 un-deferred:** Stream/Containers/Scripting all 11 commands shipped (was planned for v0.2).
  - `bunny stream library get|delete` (get/delete added rc.10)
  - `bunny stream video list|upload|delete`
  - `bunny containers app list|create|delete`
  - `bunny scripting list|deploy|delete`

### Changed
- `src/core/storage-ops.ts` — New `resolveActiveZone()` helper for zone defaulting.
- `src/manifest/registry.ts` — 49 active commands total (up from 38 in rc.9).
- `src/manifest/types.ts` — Added `groups?: { name, description, aliases? }` to registry structure.
- `src/cli.ts` — Walker now honors group descriptions and registers aliases per group.
- Pull zone create: origin moved to positional arg (was `--origin=<url>`).

### Fixed
- Zone resolution no longer prompts redundantly when keychain has existing zone password.

### Known Limitations (v0.2)
- No live e2e harness (Nock mocking sufficient for v0.1)
- Headers/rewrites/redirects sugar deferred (raw CRUD only)

---

## [0.1.0-rc.9] — 2026-05-03 (Multi-Account Profiles)

### Added (BREAKING)
- **Multi-account profiles (rc.9):** Credentials now stored per-profile in `~/.config/bunny-tools/credentials.json`.
  ```json
  {
    "active": "default",
    "profiles": {
      "default": { "account": "...", "storage:my-app": "..." },
      "work": { "account": "...", "storage:work-zone": "..." }
    }
  }
  ```
- **Global `-p/--profile` flag:** One-shot profile override for any command (mirrors AWS `--profile`).
- **`BUNNY_PROFILE` env var:** Set active profile per-shell or per-direnv.
- **`bunny configure` restored (rc.9, replaces auth):** Profile-aware interactive walkthrough.
  - `bunny configure` — update active profile
  - `bunny configure --profile=work` — update/create work profile
  - `bunny configure list` — show all profiles + active marker
  - `bunny configure switch <profile>` — change active profile
  - `bunny configure remove [--profile=<name>] [--scope=<scope>]` — delete profile or scope
- **Auto-migration (transparent):** rc.8 flat credentials shape automatically wrapped into `default` profile on first read.

### Removed (BREAKING)
- `bunny auth set`, `bunny auth list`, `bunny auth clear` — replaced by `bunny configure *`.

### Changed
- Credential resolver now profiles-aware. 6-step chain per active profile (flag > scoped env > generic env > keychain > file > prompt).
- `bunny init` now interactive: if you run `bunny configure` first, `bunny init` remembers and doesn't re-ask storage zone + password.

---

## [0.1.0-rc.8] — 2026-05-02 (Wrangler Follow-up)

### Added
- **Global flag:** `-p/--profile <name>` (prepared for rc.9 multi-account; not yet used).
- **`bunny whoami`:** Show active credentials (masked).
- **`bunny docs [topic]`:** Quick help for topic.
- **`bunny init [dir]` positional:** Optional target directory (was `--init <dir>`).

### Changed
- Global flags finalized: `-c/--config`, `--cwd`, `-e/--env`, `-p/--profile`.

---

## [0.1.0-rc.7] — 2026-05-02 (Wrangler-Style Space-Delimited)

### Changed (BREAKING)
- **Space-delimited subcommands (rc.7):** Replaced colon syntax with space-delimited (wrangler-style).
  - Old: `bunny storage:upload`, `bunny pull-zone:edge-rule:add`
  - New: `bunny storage upload`, `bunny pullzone edgerule add`
  - Registry drives flat name expansion into nested Commander tree.

### Added
- **Global flags:** `-c/--config <path>`, `--cwd <dir>`, `-e/--env <alias>`.
  - Applied via preAction hook; `--cwd` chdir's before config search.
- **`bunny whoami`:** Show current account key (masked).
- **`bunny docs [topic]`:** Quick help dispatcher.

---

## [0.1.0-rc.6] — 2026-05-02 (First OIDC Publish)

### Added
- **OIDC trusted publishing:** npm secrets via GitHub OIDC (no NPM_TOKEN in secrets).
- **Workflow:** `.github/workflows/release.yml` publishes on tag push `v*`.

### Changed
- `package.json` — `repository.url` added for provenance.
- `bin` path — standardized to `dist/cli.js`.

---

## [0.1.0-rc.3] — 2026-05-02 (Init Simplification)

### Changed
- **Firebase-style `bunny init` (rc.3):** Feature multi-select + per-feature config in one command.
- `bunny configure` temporarily removed (reintroduced rc.9 as profile-aware).

---

## [0.1.0-rc.2] — 2026-05-02 (Manual OTP)

### Added
- **Unified auth + init flow:** `bunny init` handles both credentials + project setup.
- **Feature picker:** Checkbox UI for Storage, DNS, Stream, Containers, Scripting.
- Published manually via OTP (rc.2 only; rc.6+ use OIDC).

---

## [0.1.0-rc.1] — 2026-05-02 (Phases 2–4, 6–7 Shipped; Phase 5 → v0.2)

All phases 2–4, 6–7 shipped in single release. Phase 5 (Stream/Containers/Scripting) preemptively deferred to v0.2 for faster GA stabilization.

### Added (Phases 2–7)

#### Phase 2: Deploy Loop
- `bunny deploy [--dry-run]` — storage sync + CDN purge (the main command)
- `bunny purge <target>` — standalone purge by URL/tag/zone
- `bunny init` — project initialization wizard
- `bunny configure [--non-interactive]` — global credential setup
- `bunny auth {set,list,clear}` — per-scope credential management (3 commands)
- `bunny use <alias>` — alias switching for multi-env deployments
- `src/core/deploy.ts` — business logic (walk, diff, upload orchestration, purge)
- `src/deploy/` subsystem — internal modules (walk, diff, upload-queue, remote-list, state)
- State caching (`.bunny-state.json`) for warm-run optimization
- 91+ tests across 16 test files

#### Phase 3: Storage & Zones
- `bunny storage:{upload,download,list,delete,sync}` (5 commands)
- `bunny storage-zone:{list,get,create,update,delete}` (5 commands)
- `bunny pull-zone:{list,get,create,update,delete}` (5 commands)
- `bunny pull-zone:edge-rule:{list,add,delete}` (3 commands)
- `src/core/storage-ops.ts` — zone-aware storage operations
- `src/core/zones.ts` — zone CRUD, regional endpoint selection, caching

#### Phase 4: DNS
- `bunny dns:{list,get,create,delete}` (4 commands)
- `bunny dns:record:{list,add,update,delete}` (4 commands)
- `src/core/dns.ts` — DNS zone + record CRUD with zod-validated record types

#### Phase 6: MCP Server
- `bunny mcp` — MCP stdio server entry point
- `src/mcp/server.ts` — JSON-RPC 2.0 transport
- `src/mcp/tools.ts` — ~14 MCP tools wrapping core functions + 3 resources
  - Tools: manifest, deploy, purge, storage (CRUD), zones (CRUD), DNS (CRUD)
  - Resources: bunny://manifest, bunny://agents, bunny://config/current
- AGENTS.md polish with command tree + curated workflows/gotchas

#### Phase 7: GA Release
- GitHub Action `bytekcorp/bunny-tools-deploy-action@v1` (composite)
- npm publish: `bunny-tools@0.1.0`
- Floating tag: `v1` → `v0.1.0`
- README polish with all 49 commands documented
- Docker support (if applicable)

#### New UI Helpers (P2+)
- `src/ui/progress.ts` — spinner + progress bar
- `src/ui/prompt.ts` — interactive credential input, confirmation
- `src/ui/table.ts` — formatted table rendering for list commands

#### New Utilities
- `src/util/content-type.ts` — MIME type detection for uploads

#### Test Coverage
- `test/core/` — 7 test files (auth, configure, deploy, purge, zones, dns + deploy subsystem)
- `test/deploy/` — 4 test files (walk, diff, upload-queue, state)
- `test/mcp/` — 1 test file (tools + resources)
- All layers ≥80% coverage gate (CI enforced)

### Changed
- Registry now declares 49 active commands (P1–4, 6–7) + 13 deferred (P5 → v0.2)
- All surfaces (help, JSON, AGENTS.md, schema, MCP tools) updated

### Known Limitations (v0.2)
- Stream/Containers/Scripting deferred (not in v0.1)
- No live e2e harness (Nock mocking sufficient)
- Headers/rewrites/redirects sugar deferred (raw CRUD in v0.1)
- Warm-run state caching not yet optimized for all scenarios

### Security
- No credentials logged, masked in display
- CLI and MCP both respect credential scoping
- No hardcoded secrets, no telemetry
- Keychain optional; graceful fallback to file
- All 49 command implementations security-reviewed

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

Planned features deferred from v0.1 for faster GA stabilization:

- **Edge rule sugar** (`headers`, `rewrites`, `redirects` in bunny.json)
- **Live emulator** (local Bunny simulation)
- **Plugin system**
- **Telemetry**
- **HTTP/SSE MCP transport** (stdio sufficient for v0.1)
- **Multipart upload** (single PUT covers <100MB)
- **Warm-run state caching** (`.bunny-state.json` hash-based optimization)

---

## Information for Maintainers

### Release Process (OIDC Trusted Publishing)

**Local `npm publish` is no longer supported.** All releases go through GitHub Actions.

1. **RC releases** (`0.1.0-rc.X`): Automated via tag-triggered CI (rc.39+)
   - Bump `version` in `package.json` and `src/manifest/registry.ts`
   - Run `npm run gen:all && npm run build` to regenerate artifacts
   - Update `docs/project-changelog.md` and `docs/project-roadmap.md`
   - Commit and push: `git push origin main`
   - Tag and push tag: `git tag v0.1.0-rc.X && git push origin v0.1.0-rc.X`
   - GitHub Actions (`.github/workflows/release.yml`) runs CI gates and publishes via OIDC (no token needed)

2. **GA release** (`0.1.0`): Same process once all phases complete

### Version Bumping
- Update `package.json` `"version"` field and `src/manifest/registry.ts` `version` constant (must match)
- Use conventional commits: `feat:` (features), `fix:` (bugfixes), `chore:` (versions/deps), `docs:` (docs-only)

### OIDC Authentication
- GitHub Actions has `permissions: { id-token: write }` for npm OIDC
- npm 11.5+ installed in CI (Node 20 ships npm 10, upgraded in release.yml)
- No npm token stored in GitHub Secrets
- `npm publish --provenance --tag latest` signs every release cryptographically

### Publishing Automation
GitHub Actions workflow (`.github/workflows/release.yml`) on tag push:
1. Typecheck, lint, test, build
2. Verify drift-check (generated artifacts up to date)
3. Publish to npm with OIDC identity (provenance signature included)
4. Tag as `latest` (pre-1.0 convention; becomes `next` for prereleases post-GA)

### Documentation Updates
- Per-release: add changelog entry (this file) with version, date, summary
- Per-major change: update `docs/deployment-guide.md` if release process changes
- Per-phase: update `docs/project-roadmap.md` progress
- Per-major: update README.md examples and install instructions

---

## Migration Guide

### From v0.0 (Pre-release)
N/A — v0.1.0-alpha.0 is first release.

---

## Notes for Users

### Getting Started (v0.1.0 GA)
- v0.1.0 is production-ready with 49 active commands (all phases 1–4, 6–7)
- Full deploy loop works: `bunny init && bunny configure && bunny deploy`
- Warm deploy <3s after first run
- All storage, zone, and DNS operations fully functional
- MCP server ready for AI integration via Claude Code, Claude Desktop, or compatible clients

### Credential Setup
- `bunny configure` — one-time global setup (interactive or `--non-interactive`)
- `bunny auth {set,list,clear}` — per-scope credential management
- Credential chain: CLI flag → scoped env → generic env → keychain → file → prompt

### Phase 5 (Stream/Containers) → v0.2
- Stream library, video CRUD, Magic Containers, edge scripting deferred to v0.2
- Scope cut from v0.1 to enable faster GA stabilization

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
