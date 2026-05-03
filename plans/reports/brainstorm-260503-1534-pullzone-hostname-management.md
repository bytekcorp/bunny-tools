# Brainstorm: Pull Zone Hostname Management

**Date:** 2026-05-03
**Trigger:** Bunny silently drops `Hostnames[]` from `POST /pullzone/{id}`. Custom hostnames live behind dedicated `addHostname` / `removeHostname` endpoints. CLI doesn't wrap them, blocking apex Type-7 PULLZONE DNS records.

---

## Problem

- `pull-zone update` POSTs `/pullzone/{id}` → silently ignores `Hostnames[]`.
- Bunny exposes hostname mutations via `POST /pullzone/{id}/addHostname` and `POST /pullzone/{id}/removeHostname` (subresource pattern, same as edge rules).
- Type-7 (PULLZONE) DNS records require the apex hostname to be listed on the PZ first; otherwise Bunny rejects the record.

## Approaches considered

| Option | Surface | Verdict |
|---|---|---|
| Flags on `pull-zone update` (`--add-hostname`, `--remove-hostname`) | One file change | Rejected — fights Bunny's API shape, awkward for repeated hostnames, breaks consistency with `edge-rule` subgroup |
| Dedicated `pull-zone hostname` subgroup | Mirrors `edge-rule` precedent | **Selected** — discoverable, consistent, matches Bunny's API model |
| Auto-link inside `dns record add --pull-zone` (Option C) | Hidden `addHostname` call | Rejected — hidden mutation on a different resource, unclear rollback if DNS create fails |
| Pre-flight check in `dns record add --pull-zone` (Option B) | Read-only PZ.Hostnames check + helpful error | **Selected** — surfaces the missing hostname with copy-pasteable next command, no magic |

## Final design

### 1. API client — `src/api/account.ts`
```ts
addPullZoneHostname(id: number, hostname: string)    → POST /pullzone/{id}/addHostname    body: { Hostname }
removePullZoneHostname(id: number, hostname: string) → POST /pullzone/{id}/removeHostname body: { Hostname }
```
Mirrors existing `addOrUpdateEdgeRule` / `deleteEdgeRule` pattern.

### 2. Commands — `src/commands/pull-zone/hostname/{add,remove,list}.ts`
```
bunny pull-zone hostname add <pz-id> <hostname>
bunny pull-zone hostname remove <pz-id> <hostname>
bunny pull-zone hostname list <pz-id>           # thin wrapper over getPullZone, prints .Hostnames[]
```
Subgroup mirrors `pull-zone edge-rule`. Three new entries in `src/manifest/registry.ts` (status `active`).

### 3. DNS↔PZ pre-flight — `src/commands/dns/record/add.ts`
When `--pull-zone <id>` is passed:
1. Resolve PZ.Hostnames via existing `getPullZone(id)`.
2. Compute target FQDN = `<name>.<zone-domain>` (or `<zone-domain>` for apex `@`).
3. If FQDN ∉ Hostnames, fail with:
   ```
   PULLZONE record cannot be created: <hostname> is not linked to PZ <name> (#<id>).
   Run: bunny pull-zone hostname add <id> <hostname>
   ```
4. If present, proceed with existing record-create flow.

Read-only — no hidden mutations. ~10 LOC delta in `add.ts`.

### 4. MCP — `src/mcp/tools.ts`
Two new tools:
- `pullzone_hostname_add` — `{ pullZoneId: number, hostname: string }`
- `pullzone_hostname_remove` — `{ pullZoneId: number, hostname: string }`

DNS-to-PZ wiring is a canonical AI-agent workflow; dedicated tools beat `bunny.run` for discoverability.

### 5. Tests
- `test/core/zones.test.ts` — 2 unit tests (add/remove API call shape).
- `test/commands/pull-zone/hostname.test.ts` — 3 tests (add success, list output shape, remove confirmation).
- `test/commands/dns/record-add.test.ts` — 1 test for pre-flight failure path with helpful error message.
- `test/e2e/pullzone-hostname.e2e.ts` — round-trip add → list → remove against live Bunny (gated by `BUNNY_E2E=1`).

### 6. Docs
- README: new "Pull Zone Hostnames" section with the canonical 2-step (add hostname → add Type-7 record).
- AGENTS.md regenerated via `npm run gen:all`.
- `docs/codebase-summary.md` and `docs/system-architecture.md` updated to mention the subgroup + pre-flight rule.

## Out of scope (v0.2 backlog)

- `pull-zone hostname enable-ssl <id> <hostname>` → `POST /pullzone/{id}/loadFreeCertificate`
- `pull-zone hostname force-ssl <id> <hostname> <bool>` → `POST /pullzone/{id}/setForceSSL`

Both are real follow-ons but YAGNI for the apex-record fix. File as v0.2 backlog.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| User confusion: hostname add succeeds but SSL not provisioned | README note: SSL is auto-issued by Bunny ~minutes after addHostname; add `pull-zone get` example showing CertificateKey field |
| Pre-flight check adds an extra API call to every `dns record add --pull-zone` | Acceptable — single GET on the PZ, ~50ms; only fires when `--pull-zone` flag present |
| FQDN computation edge cases (apex `@`, wildcard `*`) | Test apex (`@` → `<zone>`) and wildcard (`*.<zone>`) explicitly |

## Success criteria

- `bunny pull-zone hostname add 5789465 bytek.org` succeeds; subsequent `bunny dns record add bytek.org @ PULLZONE --pull-zone 5789465` succeeds without manual hostname registration ceremony.
- `bunny dns record add ... --pull-zone <id>` with missing hostname produces actionable error pointing to the exact next command.
- 100% test pass on unit + e2e; AGENTS.md drift check green.
- Releasable as `0.1.0-rc.25` (or directly as `0.1.0` GA if no other gates remain).

## Effort estimate

- API client: 5 min
- 3 command files + registry entries: 25 min
- Pre-flight in dns/record/add.ts: 15 min
- MCP tools: 15 min
- Tests (unit + e2e): 30 min
- Docs sync + drift gen: 15 min

**Total: ~100 min single sitting.** Same shape as rc.24 DNS types extension.

## Open questions

None — design is fully scoped.
