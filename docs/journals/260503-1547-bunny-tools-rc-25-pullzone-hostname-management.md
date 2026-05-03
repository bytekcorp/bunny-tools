---
date: 2026-05-03T15:47:00Z
version: 0.1.0-rc.25
commit: dc9e89b
---

# Bunny Tools rc.25 — Pull Zone Hostname Management

**Severity:** Medium  
**Component:** DNS routing, Pull Zone subresource API  
**Status:** Shipped (latest + alpha)

## What Happened

Came back mid-day after rc.24 ship and hit a real bug while wiring DNS to PZ for bytek.org: Bunny's `POST /pullzone/{id}` general update endpoint silently dropped the `Hostnames` array, blocking the apex Type-7 (PULLZONE) DNS record from resolving. Same pattern we'd already wrapped for edge rules in rc.24 — the general update also silently drops `EdgeRules`. We'd missed the parallel wrap for hostnames.

## The Brutal Truth

This is frustrating because it's the exact same API gotcha twice. Bunny's documentation doesn't flag that the general update endpoint strips sub-arrays — you have to hit it empirically or read their subresource endpoints. The user (bytek.org) couldn't add the FQDN to their PZ and had no idea why the DNS record wasn't resolving. We shipped rc.24 thinking we'd solved the "general update silently drops fields" class of bug, but only for one field.

## Technical Details

**The Bug:** `PUT /pullzone/{id}` with `Hostname` in body → Hostname array ignored, stays unchanged. Same for `EdgeRules`. No error; silent drop.

**Symptom:** User runs `bunny dns record add --pull-zone 5789465 --fqdn bytek.org`, Bunny rejects with opaque "PULLZONE record type incompatible" because the FQDN was never linked to the PZ.

**Root Cause:** We exposed `pullzone update` command wrapping the general endpoint. Hostname array fields require dedicated subresource endpoints (`POST /pullzone/{id}/addHostname`, `DELETE /pullzone/{id}/removeHostname`), not the general update.

## What Shipped (rc.25)

- 3 new commands: `bunny pullzone hostname {list,add,remove}` wrapping Bunny's dedicated subresource endpoints
- Pre-flight check on `dns record add --pull-zone <id>`: fetches PZ + DNS zone, computes target FQDN, fails fast with copy-pasteable command if FQDN not linked
- 3 new MCP tools: `bunny.pullzone_hostname_{list,add,remove}` — DNS-to-PZ wiring is a canonical AI-agent workflow
- Tests: 139/139 (added +3 hostname API + +5 FQDN helper unit tests)
- Surface: 54 commands (was 51), 17 MCP tools (was 14)

## Key Decisions

**Pre-flight over Auto-link:** Rejected auto-linking the FQDN to the PZ. Auto-link would be a hidden mutation on a different resource—too magical. Pre-flight surfaces the missing hostname with exact next command. Safe read-only side effect.

**Dedicated MCP Tools:** Could've exposed this via `bunny.run` escape hatch, but DNS-to-PZ wiring is a common AI-agent task. Worth dedicated tools.

**Code Reviewer Win:** Registry.ts had stale `version: '0.1.0-rc.24'` while package.json was rc.25. Drift gate would've caught it on CI, but reviewer caught it pre-commit. Saved a follow-up patch RC. Also requested explicit FQDN helper tests (apex, empty, trailing dot, wildcard)—added 5 tests in test/commands/dns-record-add-fqdn.test.ts.

## Pattern Insight

Edge-rule subresource wrapping from rc.24 was the exact playbook: API client → core wrapper → 3 thin command files → registry → MCP tools → tests. Took ~30 min brainstorm-to-ship. When Bunny's `POST /<resource>/{id}` general update silently drops a sub-array, that array has a dedicated subresource endpoint. Hit this twice now.

## Lessons Learned

- Audit other PZ array fields (Headers, AccessLists) for the same gotcha. File as v0.2 audit task.
- The "general update strips sub-arrays" pattern needs a checklist: ask Bunny API team or test each field empirically before exposing broad update commands.
- Pre-flight checks are cheap insurance; cost < 1 round-trip, save users from opaque API rejections.

## Open Items

- npm `--provenance` failed (CI-only outside GH Actions). rc.25 published without provenance signature; reinstates on next CI release.
- Live test against bytek.org PZ #5789465 pending user verification next session.

**GA Gate:** Tomorrow 03:00 UTC first scheduled cron run. All 139 unit tests + 44 e2e passing.
