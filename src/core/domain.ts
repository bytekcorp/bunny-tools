// core/domain — atomic Connect Domain flow. Bundles addHostname →
// loadFreeCertificate (poll) → DNS Type-7 record into one idempotent op.
// Mirrors what the Bunny dashboard's "Connect Domain" button does behind
// the scenes, with each step skipping cleanly if its preconditions are
// already satisfied so users can retry safely.

import {
  addPullZoneHostname,
  enablePullZoneSSL,
  listPullZoneHostnames,
} from './zones.js';
import { addRecord, listRecords, RECORD_TYPE_CODES } from './dns.js';
import { createAccountClient } from '../api/account.js';
import { resolveCredential } from '../config/credential-resolver.js';

export type ConnectDomainOptions = {
  /** Skip cert polling — caller will wait/check separately. Default false. */
  noWait?: boolean;
  /** Cert wait timeout in ms (default 90s, matching enable-ssl default). */
  timeoutMs?: number;
  /**
   * If provided, also creates a Type-7 PULLZONE record in this DNS zone.
   * Without it, only the PZ-side wiring (hostname + cert) is performed.
   */
  dnsZoneId?: number;
  /**
   * DNS record name when `dnsZoneId` is given. Empty string / `@` for apex.
   * Default: empty (apex), matching the most common dashboard use case.
   */
  recordName?: string;
  /**
   * Skip auto-flipping ForceSSL=true after cert provisions. Default false
   * (so HTTP→HTTPS redirect is enabled by default — 2026 best practice).
   */
  noForceSSL?: boolean;
};

export type ConnectDomainResult = {
  ok: true;
  hostnameLinked: boolean;
  hasCertificate: boolean;
  dnsRecordId?: number;
  /** Wall-clock time spent waiting for cert provisioning, in ms. */
  certWaitedMs: number;
};

export async function connectDomain(
  pullZoneId: number,
  hostname: string,
  opts: ConnectDomainOptions = {},
): Promise<ConnectDomainResult> {
  // 1. Hostname add — idempotent. Fetch first so re-runs don't fail the
  // call. Bunny's addHostname returns 204 on add OR if hostname is already
  // linked, but we skip the API call entirely when it's already there to
  // make the operation observable from the result envelope.
  const existing = await listPullZoneHostnames(pullZoneId);
  if (!existing.includes(hostname)) {
    await addPullZoneHostname(pullZoneId, hostname);
  }

  // 2. Cert provisioning — enablePullZoneSSL already short-circuits when
  // HasCertificate is true, so re-runs are cheap. Skip entirely if caller
  // opted out via noWait (advanced flow: connect now, poll separately).
  let hasCertificate = false;
  let certWaitedMs = 0;
  if (!opts.noWait) {
    const result = await enablePullZoneSSL(pullZoneId, hostname, {
      ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
      ...(opts.noForceSSL ? { noForceSSL: true } : {}),
    });
    hasCertificate = result.hasCertificate;
    certWaitedMs = result.waitedMs;
  }

  // 3. DNS Type-7 record — only when caller asked for it. Without this,
  // connectDomain just preps the PZ side; user creates the DNS record
  // separately (e.g. via their existing DNS provider).
  //
  // Idempotent re-run: scan existing records on the DNS zone and skip the
  // create when there's already a Type-7 (PULLZONE) at the same Name with
  // the same LinkName. Without this guard, every `domain connect` call
  // appends a duplicate record (rc.34-39 bug).
  let dnsRecordId: number | undefined;
  if (opts.dnsZoneId !== undefined) {
    const acct = createAccountClient({ resolveCredential: (s) => resolveCredential(s) });
    const pz = await acct.getPullZone(pullZoneId);
    const recordName = opts.recordName ?? '';
    const linkName = String(pz.Id);
    const pullzoneCode = RECORD_TYPE_CODES['PULLZONE'];
    const existing = await listRecords(opts.dnsZoneId);
    const existingMatch = existing.find(
      (r) => r.Type === pullzoneCode && r.Name === recordName && r.LinkName === linkName,
    );
    if (existingMatch) {
      dnsRecordId = existingMatch.Id;
    } else {
      const created = await addRecord(opts.dnsZoneId, {
        type: 'PULLZONE',
        name: recordName,
        value: pz.Name,
        linkName,
      });
      dnsRecordId = created.Id;
    }
  }

  return {
    ok: true,
    hostnameLinked: true,
    hasCertificate,
    ...(dnsRecordId !== undefined ? { dnsRecordId } : {}),
    certWaitedMs,
  };
}
