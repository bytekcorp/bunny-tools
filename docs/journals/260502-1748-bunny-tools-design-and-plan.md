# Bunny-Tools CLI Design & Phase Plan Locked

**Date:** 2026-05-02 17:48
**Severity:** High (multi-week effort initiated)
**Component:** bunny-tools CLI foundation, GitHub Action, deploy automation
**Status:** Design approved; phased implementation starts immediately

---

## Context

Daily pain point: repeating the same manual Bunny.net workflow per project—investigate API, fetch credentials, upload files, purge CDN cache. No official CLI. Four community CLIs exist but each covers only storage or single operations. User needed firebase-tools-equivalent ergonomics: one CLI for dev loops, one GitHub Action for CI, honest handling of Bunny's fragmented 4-key auth model (Account / Storage zone / Stream / Database).

Why now: increasing number of customer projects deployed to Bunny + friction from manual purge steps. Why CLI over continuing manual: Firebase proved the pattern (14M+ weekly downloads); dev teams expect this UX.

---

## Locked Decisions

**Tech stack:**
- Node 20+, TypeScript, Commander.js (zero deps, 18ms startup—faster than Yargs/Oclif)
- HTTP client: undici with persistent agent
- Testing: Vitest + Nock (no live E2E in v0.1)
- Schema validation: zod
- Config: cosmiconfig pattern (`bunny.json` shared, `.bunnyrc` local aliases)
- Auth: keytar for OS keychain, env fallback chain

**Package identity:**
- npm: `bunny-tools` (reserve immediately before first publish; fallback `@bytekcorp/bunny-tools` if name taken)
- Binary: `bunny`
- GitHub org: `bytekcorp`
- License: MIT

**Auth design:**
- Command: `bunny auth set` NOT `bunny login` (Bunny has no OAuth—renamed to be honest)
- 4-key scoped resolver: Account / Storage:<zone> / Stream:<lib> / Database:<name>
- Fallback chain: CLI flag → env (`BUNNY_ACCOUNT_KEY`, `BUNNY_STORAGE_PASSWORD`, etc.) → OS keychain → `~/.config/bunny-tools/credentials.json` → interactive (TTY only)
- CI integrates via env vars, no interactive prompt needed

**Deploy semantics:**
- Pagination always `page=1, perPage=1000` (avoid Bunny's `page=0` footgun that returns array or object depending on size)
- Diff strategy: local SHA256 cache + remote ETag/size verification (state in `.bunny-state.json`, gitignored)
- Upload concurrency: default 8, configurable; 429 → exponential backoff + jitter, max 5 retries
- Purge policy: tag-based preferred (`tag:<name>`), fallback to full pull-zone, `none` option for manual purge
- Region awareness: cache zone→region from Account API, override via `--region` flag or `bunny.json#deploy.region`

**Exclusions from v0.1:**
- No `headers/rewrites/redirects` sugar in `bunny.json` (deferred to v0.2—requires edge-rule sync)
- No multipart upload (Bunny doesn't document chunked PUTs; standard PUT covers <100MB)
- No live E2E tests (Nock-only; real quirks surface via dogfooding)
- No plugin system (revisit if 100+ commands or external demand)
- No telemetry

**GitHub Action:**
- Composite (wraps `npx bunny-tools deploy`)
- Zero build pipeline, user-pinnable to any npm version, transparent
- Inputs: `version`, `account-key`, `storage-password`, `working-directory`, `only`
- JavaScript action deferred

**Internal phasing:**
- v0.1 final scope: all Bunny services (Storage, DNS, Stream, Magic Containers, Edge Scripting)
- But: ship `0.1.0-alpha.N` weekly starting alpha.1 (deploy+purge loop only) so user can dogfood early
- Slip gate at alpha.3 (DNS): if >2 weeks, demote Stream+Containers+Scripting to v0.2; ship 0.1.0 after alpha.2 (Storage zones + Pull zones + DNS)

---

## Brutal Truth

Recommended phased v1 (deploy+purge only, defer full surface to v0.2). **User overrode for full surface in v0.1.** Mitigated by: internal alpha gating forces each phase to ship before next begins, preventing scope creep into "vaporware v1.0." This surfaces integration pain early.

`bunny login` is misleading—Bunny has no OAuth, only API keys. Honest rename to `auth set` fixes misaligned expectations upfront.

npm name `bunny-tools` is risky (popular namespace, likely collisions). Flagged for pre-publish check; fallback to `@bytekcorp/bunny-tools` if needed. Delaying this check until phase-06 is a mistake—should verify day 1 of implementation.

---

## Key Bunny API Gotchas Embedded in CLI Design

**4 credential types, all use `AccessKey` header, different scopes:**
- Account API key (full account access)
- Storage Zone password (single zone, regional endpoint)
- Stream library key (per-library)
- Database key (per-database)

CLI resolver matches scope to credential type; no ambiguity at call site.

**8 regional storage endpoints** (ny, la, sg, syd, uk, se, br, jh): CLI caches zone→region from Account API on first run, then reuses unless overridden.

**Per-folder 10K file cap:** CLI detects at walk time, errors with actionable hint about subdirectories.

**No documented multipart upload:** v0.1 uses standard PUT + retry; document <100MB limit. Revisit on real demand.

**ETag is advisory; SHA256 in `.bunny-state.json` is source of truth** for diff detection. Combine ETag + Last-Modified + size for robustness.

**Tag-based purge requires origin to set `Cache-Tag` response headers:** CLI hints in `bunny init` iff purge strategy selects tag-based; no interactive nag.

**Pagination default `page=0` returns array or object depending on account size:** v0.1 always uses `page=1, perPage=1000` + iterate. Never `page=0`.

---

## Technical Decisions Worth Recording

**Commander.js over Oclif:** Firebase doesn't use either (custom routing), but firebase-tools is slower than it needs to be. Commander: 18ms startup, 0 deps. Oclif: 85ms, 30+ deps. Yargs: 35ms, ~7 deps. For a CLI called 50+ times per dev session, Commander's sub-30ms matters.

**Nock + Vitest over live E2E:** Firebase uses Nock internally. Avoids credential exposure in CI, tests run offline, deterministic. Real Bunny quirks (rate limit behavior, tag-based purge idempotency) surface via dogfooding, not unit tests.

**Colon-delimited subcommands** (`bunny storage:upload`, not `bunny storage upload`): Firebase pattern. Better bash completion, avoids ambiguity in command tree, clearer help output.

**Separate `bunny.json` (shared, git-tracked) + `.bunnyrc` (local aliases, gitignored):** Firebase pattern. Allows team to share project structure without forcing individual devs to edit configuration. Aliases decouple environment names (prod/staging) from Bunny account IDs.

**Persistent undici agent:** Connection reuse across many small storage PUTs reduces handshake overhead. Benchmarks show 30-40% throughput improvement on file-heavy deployments.

---

## Plan Structure

Implementation plan created in `/plans/260502-1748-bunny-tools-cli/`:
- `plan.md` — overview + dependencies
- `phase-01-bootstrap-foundations.md` — Node/TS scaffolding, config loaders, auth resolver
- `phase-02-alpha-1-deploy-loop.md` — init, auth set, deploy (storage+purge), purge command
- `phase-03-alpha-2-storage-zones.md` — storage:upload/download/list/delete/sync + storage-zone CRUD + pull-zone CRUD
- `phase-04-alpha-3-dns.md` — DNS zone + record CRUD
- `phase-05-alpha-4-stream-containers-scripting.md` — Stream video + Magic Containers + Edge Scripting CRUD
- `phase-06-github-action-release.md` — GitHub Action composite + release polish + docs + schema publish + v0.1.0 GA + Action `v1` tag

---

## Success Criteria

- `bunny init && bunny auth set && bunny deploy` works on fresh machine in <5 min
- Warm deploy (no changes) completes in <3s on 1000-file site
- 100% of Bunny REST surface in v0.1 covered by Nock-mocked tests
- GH Action zero duplication of CLI logic
- README walkthrough passes stranger usability test
- Zero Bunny credentials in test fixtures or CI logs

---

## Unresolved / Open Items

1. **Verify `bunny-tools` npm availability before phase-06.** If taken, fallback to `@bytekcorp/bunny-tools` immediately (don't discover at publish time).

2. **Reserve `bytekcorp` GitHub org** if not already created. Needed for public repo + Action namespace.

3. **v0.2 priorities** (post-v0.1 ship): headers/rewrites/redirects sugar in `bunny.json`, edge-rule sync from config, optional live E2E harness, plugin system.

4. **Cache-Tag origin guidance:** Does `bunny init` print hint, or defer to docs? Currently: one-line hint + docs link if tag-based purge selected. No interactive nag.

5. **Live E2E gates:** If BUNNY_E2E=1 env set, run against throwaway account. Currently: skipped in CI. Evaluate if real quirks surface during alpha.1 dogfood.

---

## Source Artifacts

- **Brainstorm summary:** `plans/reports/brainstorm-summary-260502-1748-bunny-tools-cli-design.md`
- **Bunny API research:** `plans/reports/researcher-260502-1758-bunny-api-surface.md`
- **Firebase-tools UX patterns:** `plans/reports/researcher-260502-1748-firebase-tools-ux-patterns.md`

---

**Next step:** Phase-01 implementation begins; bootstrap Node/TS scaffold, config loaders, auth resolver chain.
