# Full UX Audit — bunny-tools rc.9

**Date:** 2026-05-03 08:56
**Scope:** All 49 active commands. Fresh-eyes walk + comparison to peer CLIs.
**Mandate:** find friction; recommend only what's worth shipping; resist scope creep.

---

## Method

Walked the surface as a brand-new user would, command by command. Compared to wrangler 4.55, gh CLI, firebase-tools, aws-cli where relevant. Every observation labeled with severity:

- **HIGH** — daily friction; users will feel it on every invocation.
- **MED** — visible at first contact, learned around afterward.
- **LOW** — cosmetic / tidy-up.
- **DEFER** — known issue, fix in v0.2 (cost > value at v0.1).

---

## HIGH severity (5)

### H1. `--zone` typed every time on storage commands

```
bunny storage upload x.txt /x --zone=my-app
bunny storage list / --zone=my-app
bunny storage delete /old.txt --zone=my-app
bunny storage sync ./build / --zone=my-app
```

If `bunny.json#deploy.storageZone = "my-app"` or active `.bunnyrc` alias has it, `--zone` is dead-weight typing.

**Fix:** auto-default `--zone` from (in order) `--zone` flag → active alias `.bunnyrc#aliases[active].storageZone` → `bunny.json#deploy.storageZone` → error/prompt.
**Effort:** ~30 LOC. Touches 5 files.

### H2. `bunny init` re-asks for things `bunny configure` already stored

Walked: `bunny configure` (stores account key + storage zone "my-app" + password) then `bunny init` (asks for storage zone, defaults to `dist` for publicDir). Storage zone is asked again; password is asked again even though credential is in keychain.

**Fix:** `init` should:
1. Read active profile's stored zones; offer them as defaults in the picker.
2. Skip storage password prompt if a credential exists at `storage:<chosen>`.
3. If only one zone exists in keychain, hint "use my-app?" instead of opening list.

**Effort:** ~20 LOC.

### H3. Subcommand group descriptions are placeholder stubs

`bunny --help` shows:

```
storage         storage commands
storagezone     storagezone commands
pullzone        pullzone commands
dns             dns commands
stream          stream commands
containers      containers commands
scripting       scripting commands
```

That's literally the auto-generated `${groupName} commands` placeholder from cli.ts. Looks unfinished.

**Fix:** add `groupDescription` field to registry types; cli.ts uses it when creating intermediate group commands.

```
storage         File operations within a storage zone (upload/download/list/delete/sync).
storagezone     Manage storage zones (create/list/get/update/delete).
pullzone        Manage pull zones (CDN) and their edge rules.
dns             Manage DNS zones and records.
stream          Manage Stream video libraries and videos.
containers     Manage Magic Containers apps.
scripting       Manage Edge Scripting deployments.
```

**Effort:** ~30 LOC.

### H4. Hyphen→flat regression hits muscle memory + old docs

rc.7 flattened `pull-zone` → `pullzone`, `storage-zone` → `storagezone`, `edge-rule` → `edgerule`. Anyone who saw rc.6 docs, GitHub README at older SHA, or has muscle memory hits "unknown command".

**Fix:** register hyphenated forms as Commander aliases. Both work; canonical stays flattened in help output.

**Effort:** ~20 LOC; in registerCommand walker.

### H5. `bunny configure` walkthrough doesn't ask about pull zone interactively

Compare:
- `bunny configure --non-interactive --pull-zone=12345` (CI flag) — works.
- `bunny configure` (interactive) — only asks account key + storage zone + password. Pull zone is silently skipped.

Pull zones are core to "deploy + purge" — should be part of the walkthrough.

**Fix:** add an optional pull zone picker step.

**Effort:** ~25 LOC in `core/configure.ts`.

---

## MED severity (6)

### M1. `pullzone create <name> --origin=<url>` — origin should be positional

Origin URL is mandatory. `bunny pullzone create my-cdn https://api.example.com` reads cleaner than `--origin=...`.

**Fix:** make `origin` positional.
**Effort:** 5 LOC + flag→arg in registry.
**Concern:** mild breaking change. Acceptable since pre-GA.

### M2. `bunny init` doesn't honor `--profile` flag

User has profile=work. Wants to init a new project under work account. `BUNNY_PROFILE=work bunny init` works (env). But `--profile=work` flag is global and SHOULD work via the preAction hook.

Tested: it does work via the global flag. So this is actually fine. Marking as DOC issue rather than functional.

**Fix:** README example shows `bunny -p work init` for clarity.
**Effort:** docs only.

### M3. `bunny stream library` is asymmetric (only list/create, no get/delete)

```
bunny stream library list
bunny stream library create
# missing: get, delete
```

Other resources have full CRUD; stream library is half-baked.

**Fix:** add `stream library get <id>` and `stream library delete <id> [--yes]`.
**Effort:** 2 thin command files + registry entries (~50 LOC).

### M4. Error messages don't surface `BunnyApiError.errorKey` / `.field`

When Bunny returns `{ ErrorKey: "pullzone.not_found", Field: "Id", Message: "Pull Zone not found" }`, our CLI prints just "Pull Zone not found". The errorKey is more searchable in docs/logs.

**Fix:** logger format for BunnyApiError: `[<errorKey>] <message> (field: <field>)`.
**Effort:** 5 LOC in `src/util/logger.ts` or wherever errors are surfaced.

### M5. `bunny manifest` output is huge (~38KB)

Useful as JSON dump but overwhelming in terminal. Wrangler doesn't have an equivalent because they don't have a registry — but having one means the dump grows with command count.

**Fix:** add `bunny manifest --names` mode that outputs a one-name-per-line list. AI agents preferring full JSON keep using default.

**Effort:** 5 LOC.

### M6. `bunny use` dual-mode (list + switch) is non-obvious

`bunny use` (no arg) → lists. `bunny use <alias>` → switches. Help text explains it but if you tab-complete you might expect a subcommand.

**Fix:** keep dual-mode (no break) BUT also accept `bunny use list` as an explicit alias for the no-arg form. Predictable for users used to subcommand patterns.

**Effort:** 10 LOC.
**Decision:** marginal value — defer.

---

## LOW severity (4)

### L1. Inconsistent destructive verb ("Delete" vs "Remove")

- `bunny storage delete` → "Delete X?"
- `bunny configure remove` → "Remove X?"
- `bunny pullzone delete` → "Delete X?"
- `bunny storagezone delete` → "Delete X?"

Mostly "Delete"; `configure remove` is the outlier (verb is `remove`, prompt is "Remove ENTIRE profile..."). Acceptable; both verbs are clear.

**Decision:** leave as-is.

### L2. `bunny purge pullzone:<id>` mixes flat noun + colon

The CLI restructure flattened `pull-zone` to `pullzone` (commands), but `bunny purge` argument format still uses `pullzone:<id>` (colon as type-discriminator). That's fine — it's a value format, not a command. AWS does the same with `arn:aws:s3:::bucket-name`.

**Decision:** leave as-is.

### L3. `bunny manifest` always emits the same shape

Could let `bunny manifest --diff <other-version>` show what changed between versions. AI agents would love this for cache invalidation.

**Decision:** YAGNI for v0.1.

### L4. `--help-json` flag name is awkward

Is the only multi-word kebab flag without separator (others are `--non-interactive`, `--pull-zone`). `--help-json` reads as `help-json`, fine. Wrangler doesn't have an equivalent.

**Decision:** leave as-is.

---

## DEFER to v0.2

### D1. `update` commands take `--body=<json>` instead of typed flags

```
bunny pullzone update 12345 --body='{"Enabled": false, "CacheControl": "public"}'
bunny storagezone update 99 --body='{"ReplicationRegions": ["la"]}'
bunny dns record update 42 7 --body='{"Value": "203.0.113.99"}'
```

Better:
```
bunny pullzone update 12345 --enabled=false --cache-control="public"
bunny storagezone update 99 --replicate=la
bunny dns record update 42 7 --value=203.0.113.99
```

**Why defer:** typed flags per resource × 3 resources × ~10 fields each = 30+ flag definitions. Each needs zod validation, doc, test. Real engineering work — not surgical.

### D2. `whoami --no-probe` for slow networks

Today `whoami` always probes Bunny API for zone counts. Slow if network is slow.

**Why defer:** small fix but no real user has complained. Add when someone asks.

### D3. Multi-resource batch operations

`bunny storage delete *.tmp` → glob support. Currently single-path only.

**Why defer:** real shell glob expands at the shell level; users can `find ... -exec bunny storage delete {} \;` if they need it. Not a v0.1 concern.

---

## Tier 1 — recommended for rc.10 (the actual ship list)

| # | Fix | LOC | Risk |
|---|---|---|---|
| H1 | Auto-default `--zone` from alias/bunny.json | ~30 | None |
| H2 | `init` pre-fills from existing creds | ~20 | None |
| H3 | Subcommand group descriptions in registry | ~30 | None |
| H4 | Hyphenated aliases (`pull-zone` → `pullzone`) | ~20 | None |
| H5 | `configure` walkthrough adds pull zone step | ~25 | None |
| M4 | Error messages surface errorKey + field | ~5 | None |

**Total:** ~130 LOC; ~2.5h. Zero breaking changes.

## Tier 2 — defer to next session (or skip)

- M1: pullzone create origin positional (small break, low value)
- M3: stream library get/delete (asymmetry fix; 50 LOC)
- M5: `bunny manifest --names` (nice-to-have)

## Hard recommendation

Ship Tier 1 ONLY in rc.10. Then **stop iterating** until live integration test against a real Bunny account. The audit is exhaustive; resist the urge to also ship Tier 2 in the same release.

## Open questions

1. Do hyphenated aliases appear in `bunny --help` output, or only work silently? (Recommendation: silent — keeps help clean; alias listed in `bunny <command> --help` if anywhere.)
2. Should `init` pre-fill use the FIRST zone in keychain, or the active profile's `storageZone` (if we tracked it per profile)? (Recommendation: track `defaultStorageZone` per profile in credentials.json — adds a small field, big DX win.)
3. Does H5 (configure asks about pull zone) increase the walkthrough length unacceptably for users who don't have one yet? (Recommendation: pick offers `none — skip`; one extra prompt is fine.)
