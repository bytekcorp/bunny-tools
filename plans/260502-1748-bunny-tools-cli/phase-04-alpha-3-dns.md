---
phase: 4
title: "Alpha 3 — DNS"
status: completed
priority: P2
effort: "3-5d"
dependencies: [3]
completed: "2026-05-02"
---

# Phase 4: Alpha 3 — DNS

## Overview

Bunny DNS zone + record CRUD. Releasable as `0.1.0-alpha.3`. **Slip gate:** if this phase trends > 2 weeks (calendar), demote phase 5 (Stream/Containers/Scripting) to v0.2 and proceed to phase 6 for `0.1.0` GA after this phase ships.

## Context Links

- Researcher API §2.3 (DNS zone management) — endpoints `/dnszone`, `/dnszone/{id}/records`
- Design §6.2 (command tree)

## Requirements

**Functional**
- `dns:list [--json]`, `dns:get <id|domain>`, `dns:create <domain>`, `dns:delete <id> [--yes]`.
- `dns:record:list <zone> [--type=...]`, `dns:record:add <zone> <type> <name> <value> [--ttl=N] [--priority=N] [--weight=N] [--port=N] [--flags=N] [--tag=...]`.
- `dns:record:update <zone> <recordId> [...same fields]`, `dns:record:delete <zone> <recordId> [--yes]`.
- Supported types: `A, AAAA, CNAME, TXT, MX, SRV, CAA, NS`.
- `--json` available on every list/get for piping.

**Non-functional**
- Type-specific input validation via zod (e.g. SRV requires priority+weight+port; MX requires priority; CAA requires flags+tag+value).
- Friendly errors when wrong fields provided for the chosen type.

## Architecture

```
src/commands/dns/{list,get,create,delete}.ts
src/commands/dns/record/{list,add,update,delete}.ts

src/api/account.ts (extend)
   - listDnsZones(opts)
   - getDnsZone(id)
   - createDnsZone(domain)
   - deleteDnsZone(id)
   - listDnsRecords(zoneId)
   - addDnsRecord(zoneId, body)
   - updateDnsRecord(zoneId, recordId, body)
   - deleteDnsRecord(zoneId, recordId)
```

DNS record type → required fields encoded in a zod discriminated union; CLI flags map into the union variant before submission.

## Related Code Files

**Create**
- `src/commands/dns/{list,get,create,delete}.ts`
- `src/commands/dns/record/{list,add,update,delete}.ts`
- `test/commands/dns/**`

**Modify**
- `src/api/account.ts` — DNS endpoints.
- `src/cli.ts` — register `dns:*` and `dns:record:*`.

## File Ownership

`src/commands/dns/**`, `test/commands/dns/**`. Extends `src/api/account.ts` (DNS-only additions), `src/cli.ts`.

## Implementation Steps

1. Extend `src/api/account.ts` with DNS operations and typed request/response interfaces.
2. zod discriminated union for record type → required fields; export `parseRecordInput(type, raw)`.
3. `dns/list.ts`, `dns/get.ts`, `dns/create.ts`, `dns/delete.ts`.
4. `dns/record/list.ts`: filter by `--type`; table or JSON output.
5. `dns/record/add.ts`: parse type-specific args; submit; print created record.
6. `dns/record/update.ts`: GET current, merge changes, POST.
7. `dns/record/delete.ts`: confirm unless `--yes`.
8. Tests: per command, happy + at least one validation failure (e.g. SRV without `--port` → ValidationError before HTTP). Nock-mocked endpoints.

## Success Criteria

- [x] All 8 record types accepted with type-specific validation passing/failing as expected.
- [x] `dns:record:add example.com SRV _sip._tcp 10 5 5060 sipserver.example.com` succeeds (SRV with priority+weight+port).
- [x] `dns:record:add example.com MX 0 mail.example.com` rejected (missing `--priority`).
- [x] Coverage ≥75% on `src/commands/dns/`.
- [x] Releases as `0.1.0-alpha.3`.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Bunny DNS advanced features (geolocation, monitoring) require additional fields not in basic CRUD | v0.1 covers basic types only; advanced routing fields exposed via raw `--field=k:v` passthrough; full schema deferred to v0.2. |
| Slip beyond 2 weeks | Slip gate: demote phase 5, ship 0.1.0 after phase 6. Log decision in plan and changelog. |
| Domain ownership / NS update outside CLI scope | Document that user must point registrar NS to Bunny; CLI doesn't verify propagation. |

## Code Review Checklist

- [ ] zod discriminated union covers all 8 record types.
- [ ] No record submitted without passing local validation first.
- [ ] `--json` output stable across runs.

## Docs Updates

- README: DNS section with per-type examples.
- `docs/codebase-summary.md`: DNS module overview.

## Slip-Gate Decision Point

Phase 4 completed in <1 session (2026-05-02). Slip gate not triggered. However, Phase 5 was evaluated and **voluntarily deferred to v0.2** per prioritization logic:
- Phase 5 has lowest daily-deploy value (Stream/Containers/Scripting are edge products).
- Phase 6 (MCP) and Phase 7 (release) enable the daily-deploy loop + AI integration (higher value).
- Single-session velocity favorable: Phase 6+7 can proceed immediately → `0.1.0` GA sooner.
- Decision: demote Phase 5; proceed to Phase 6.

## Next Steps

→ Phase 5 (Alpha 4 — Stream/Containers/Scripting), or skip to Phase 6 if slip-gate triggered.
