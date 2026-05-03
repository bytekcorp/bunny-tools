import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bunnyCli, bunnyCliOk } from './helpers/bunny-cli.js';
import { register, cleanupAll } from './helpers/cleanup-registry.js';
import { extractIdNumeric } from './helpers/parse-output.js';
import { suitePrefix } from './helpers/prefix.js';
import { E2E_ENABLED } from './helpers/env-guard.js';

describe.skipIf(!E2E_ENABLED)('e2e: DNS zones + records', () => {
  let zoneId = 0;
  // .invalid TLD never resolves publicly so creating a zone for it does not
  // affect any real domain. Bunny accepts it as a hosted zone entry.
  const domain = `${suitePrefix()}-dns.invalid`;

  beforeAll(async () => {
    const created = await bunnyCliOk(['dns', 'create', domain]);
    zoneId = extractIdNumeric(created);
    register('dns', zoneId, domain);
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('zone get returns Records[] + Nameservers', async () => {
    const detail = await bunnyCliOk(['dns', 'get', String(zoneId)]);
    expect(detail.stdout).toMatch(/"Records":/);
    expect(detail.stdout).toMatch(/"Nameserver1":/);
  });

  it('zone list contains the test domain', async () => {
    const list = await bunnyCliOk(['dns', 'list']);
    expect(list.stdout).toMatch(new RegExp(domain.replace('.', '\\.')));
  });

  it('record add (positional) + list shows type letter (not numeric code)', async () => {
    await bunnyCliOk(['dns', 'record', 'add', String(zoneId), 'A', 'www', '1.2.3.4', '--ttl=300']);
    const list = await bunnyCliOk(['dns', 'record', 'list', String(zoneId)]);
    expect(list.stdout).toMatch(/www/);
    // Bug #4 follow-up: type column should not render as `code:N` for common types
    expect(list.stdout).not.toMatch(/code:0/);
  });

  it('record update + delete', async () => {
    // Pull the record id back out of the list — list output puts id in the
    // first column after the separator line.
    const list = await bunnyCliOk(['dns', 'record', 'list', String(zoneId)]);
    const wwwLine = list.stdout.split('\n').find((l) => l.includes('www'));
    expect(wwwLine).toBeDefined();
    const recordId = wwwLine!.trim().split(/\s+/)[0];
    expect(recordId).toMatch(/^\d+$/);

    const upd = await bunnyCli([
      'dns',
      'record',
      'update',
      String(zoneId),
      recordId!,
      '--body={"Value":"5.6.7.8","Ttl":600}',
    ]);
    expect(upd.exitCode).toBe(0);

    await bunnyCliOk(['dns', 'record', 'delete', String(zoneId), recordId!, '--yes']);
    const after = await bunnyCliOk(['dns', 'record', 'list', String(zoneId)]);
    expect(after.stdout).not.toMatch(/www/);
  });

  it('REDIRECT record round-trip (rc.24 — Bunny routing types)', async () => {
    // REDIRECT is a Bunny-specific routing type that the CLI didn't accept
    // before rc.24. This test fails on rc.23 and earlier with "Unknown type
    // \"REDIRECT\"". It passes once Bunny code 5 is wired through the type
    // map + zod union.
    await bunnyCliOk([
      'dns', 'record', 'add', String(zoneId), 'REDIRECT', 'redir', 'https://example.com',
    ]);
    const list = await bunnyCliOk(['dns', 'record', 'list', String(zoneId), '--json']);
    const records = JSON.parse(list.stdout) as Array<{ Id: number; Type: number; Name: string; Value: string }>;
    const redir = records.find((r) => r.Name === 'redir');
    expect(redir).toBeDefined();
    expect(redir?.Type).toBe(5); // REDIRECT
    expect(redir?.Value).toBe('https://example.com');
    await bunnyCliOk(['dns', 'record', 'delete', String(zoneId), String(redir!.Id), '--yes']);
  });
});
