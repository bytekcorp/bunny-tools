# Brainstorm: Pull Zone SSL Cert Provisioning (loadFreeCertificate)

**Date:** 2026-05-03
**Trigger:** rc.25 user reproduced bug — `bunny dns record add ... PULLZONE --pull-zone <id>` fails with "The pull zone ID is not valid." despite hostname linked. Root cause: PZ hostname has no Let's Encrypt certificate (`HasCertificate: false`); Bunny silently requires cert before accepting Type-7 records.

---

## Root cause (real, not what error suggests)

- Bunny's `PUT /dnszone/{id}/records` rejects Type-7 (PULLZONE) records when the matched hostname has `HasCertificate: false`.
- Error message "The pull zone ID is not valid" is misleading — pull zone IS valid; cert is missing.
- Dashboard "Connect Domain" button bundles: `addHostname` → `loadFreeCertificate` → poll → Type-7 DNS record. CLI is missing the cert step.
- For zones with Bunny NS authoritative (NameserversDetected=true), DNS-01 challenge resolves cleanly — no chicken-and-egg.

## Approaches considered

| Option | Verdict |
|---|---|
| Wrap `loadFreeCertificate` as a primitive | **Selected** — fills the gap with smallest surface |
| Mega `connect-domain <pzId> <domain>` command | Rejected for v0.1 — partial-failure rollback semantics, premature optimization, defer to v0.2 |
| Just improve error message | Insufficient — without cert primitive, user can't fix the underlying state |
| Fire-and-forget cert request | Rejected — unpredictable for AI agents, shifts polling burden to caller |
| Wait-with-timeout default 90s | **Selected** — predictable, compatible with MCP timeouts |

## Final design

### 1. Type extension — `src/api/account.ts`
```ts
export type PullZoneHostname = {
  Id: number;
  Value: string;
  HasCertificate: boolean;
  ForceSSL: boolean;
};
export type PullZone = { ...; Hostnames: PullZoneHostname[] };
```

### 2. API client method — `src/api/account.ts`
```ts
loadFreeCertificate: (hostname: string) =>
  callBunny<void>({
    base,
    path: '/pullzone/loadFreeCertificate',
    method: 'POST',
    scope: { kind: 'account' },
    query: { hostname },
  })
```
Note: account-scoped, not per-PZ — Bunny resolves PZ from hostname.

### 3. Core wrapper — `src/core/zones.ts`
```ts
export async function enablePullZoneSSL(
  pullZoneId: number,
  hostname: string,
  opts: { timeoutMs?: number; pollIntervalMs?: number } = {}
): Promise<{ hasCertificate: boolean; waitedMs: number }>
```
- Validates hostname is on PZ (calls `getPullZone` first).
- Calls `loadFreeCertificate(hostname)`.
- Polls PZ.Hostnames every 5s until target hostname's `HasCertificate=true` OR 90s elapsed.
- Returns `{ hasCertificate: true, waitedMs }` on success, throws on timeout with last-seen state.

### 4. Command — `src/commands/pull-zone/hostname/enable-ssl.ts`
```
bunny pullzone hostname enable-ssl <pullZoneId> <hostname>
```
Thin wrapper. Progress spinner during poll. Failure mode: timeout error with copy-pasteable `bunny pullzone get <id>` to inspect.

### 5. Pre-flight enhancement — `src/commands/dns/record/add.ts`
After existing "linked?" check, add:
```ts
const matched = pz.Hostnames.find((h) => h.Value === fqdn);
if (!matched.HasCertificate) {
  progress.fail(
    `${fqdn} is linked to PZ "${pz.Name}" (#${pz.Id}) but has no SSL certificate yet. ` +
    `Run: bunny pullzone hostname enable-ssl ${pz.Id} ${fqdn}`
  );
  return 1;
}
```

### 6. MCP tool — `src/mcp/tools.ts`
```
bunny.pullzone_hostname_enable_ssl
  inputSchema: { pullZoneId: int, hostname: string }
  returns: { ok: boolean, hasCertificate: boolean, waitedMs: number }
```

### 7. Registry entry — `src/manifest/registry.ts`
Add `pullzone hostname enable-ssl` as `active`, phase 3.

## Tests

- `test/core/zones.test.ts` — 3 tests:
  1. `enablePullZoneSSL` calls loadFreeCertificate then polls until cert flips true (mock 2 GETs: false → true).
  2. Timeout when cert never flips (mock GETs returning false repeatedly; tighten timeout in test to 50ms).
  3. Validates hostname-not-on-PZ before firing (mock getPullZone return without target hostname).
- `test/commands/dns-record-add-fqdn.test.ts` — keep existing 5; no new (FQDN logic unchanged).
- `test/commands/dns-record-add-cert.test.ts` (new) — 1 test: pre-flight surfaces enable-ssl hint when HasCertificate=false.

## Out of scope (v0.2)

- `bunny pullzone hostname force-ssl <pzId> <hostname> <bool>` — `POST /pullzone/setForceSSL`
- `bunny pullzone connect-domain <pzId> <domain>` mega-command
- `--no-wait` flag on enable-ssl
- `--timeout=<sec>` flag on enable-ssl

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Cert provisioning >90s (rare but possible if Let's Encrypt slow) | Surface clear timeout error with current state + suggest retry. Don't auto-rollback addHostname. |
| Bunny returns 200 on loadFreeCertificate but cert never issues (e.g. NS not authoritative) | Pre-flight on enable-ssl could check NameserversDetected, but that requires fetching DNS zone which doesn't always exist in same account. Defer; rely on timeout error. |
| Hostname not on PZ when enable-ssl called | Fail fast with "Run: bunny pullzone hostname add <pzId> <hostname>" before firing loadFreeCertificate. |
| MCP client timeout < 90s | Document in MCP tool description. SDK default is 60s for some clients; users may need to bump. |

## Success criteria

- `bunny pullzone hostname enable-ssl 5789465 bytek.org` succeeds within 90s for the user's bytek.org account (smoke test).
- Subsequent `bunny dns record add 784669 PULLZONE @ --pull-zone 5789465` succeeds.
- Pre-flight surfaces actionable error if cert step skipped.
- 100% test pass; releasable as `0.1.0-rc.26`.

## Effort estimate

- API + type: 5 min
- Core wrapper with poll: 15 min
- Command + registry: 10 min
- Pre-flight enhancement: 5 min
- MCP tool: 10 min
- Tests: 15 min
- Docs (README + changelog + roadmap): 10 min

**Total: ~70 min single sitting.**

## Open questions

None — design fully scoped.
