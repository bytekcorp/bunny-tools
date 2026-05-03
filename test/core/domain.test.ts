import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectDomain } from '../../src/core/domain.js';
import { getMockAgent } from '../setup.js';

describe('connectDomain', () => {
  let scratch: string;
  let envBackup: Record<string, string | undefined> = {};

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'domain-'));
    envBackup['XDG_CONFIG_HOME'] = process.env['XDG_CONFIG_HOME'];
    envBackup['BUNNY_ACCOUNT_KEY'] = process.env['BUNNY_ACCOUNT_KEY'];
    process.env['XDG_CONFIG_HOME'] = scratch;
    process.env['BUNNY_ACCOUNT_KEY'] = 'test-key';
  });

  afterEach(async () => {
    for (const [k, v] of Object.entries(envBackup)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    envBackup = {};
    await rm(scratch, { recursive: true, force: true });
  });

  it('skips addHostname when hostname is already linked, then short-circuits enable-ssl when cert is already present', async () => {
    const pool = getMockAgent().get('https://api.bunny.net');
    // Both calls return cert=true AND ForceSSL=true so no setForceSSL API
    // call is needed (idempotent path). The test asserts re-runs are cheap.
    const pzAlreadyDone = {
      Id: 42, Name: 'pz', OriginUrl: 'https://x', Enabled: true,
      Hostnames: [{ Value: 'example.com', HasCertificate: true, ForceSSL: true }],
    };
    pool.intercept({ path: '/pullzone/42', method: 'GET' }).reply(200, pzAlreadyDone);
    pool.intercept({ path: '/pullzone/42', method: 'GET' }).reply(200, pzAlreadyDone);

    const result = await connectDomain(42, 'example.com');
    expect(result.ok).toBe(true);
    expect(result.hasCertificate).toBe(true);
    expect(result.certWaitedMs).toBe(0);
    expect(result.dnsRecordId).toBeUndefined();
  });

  it('skips DNS record creation when a matching Type-7 record already exists at the same name (rc.40 idempotency fix)', async () => {
    const pool = getMockAgent().get('https://api.bunny.net');
    // Both calls go through the cert-already-true short circuit.
    const pzReady = {
      Id: 42, Name: 'pz', OriginUrl: 'https://x', Enabled: true,
      Hostnames: [{ Value: 'example.com', HasCertificate: true, ForceSSL: true }],
    };
    pool.intercept({ path: '/pullzone/42', method: 'GET' }).reply(200, pzReady);
    pool.intercept({ path: '/pullzone/42', method: 'GET' }).reply(200, pzReady);
    // connectDomain re-resolves PZ (for Name + Id) right before the DNS step.
    pool.intercept({ path: '/pullzone/42', method: 'GET' }).reply(200, pzReady);
    // listRecords: zone returns an existing Type-7 PULLZONE at name='' linkName='42'.
    pool.intercept({ path: '/dnszone/999', method: 'GET' }).reply(200, {
      Id: 999, Domain: 'example.com',
      Records: [
        { Id: 12345, Type: 7, Name: '', Value: 'pz', LinkName: '42' },
      ],
    });
    // CRITICAL: NO PUT intercept — if connectDomain tries to create, the test
    // hangs on an unmocked request. That's the regression we're guarding.

    const result = await connectDomain(42, 'example.com', { dnsZoneId: 999 });
    expect(result.ok).toBe(true);
    expect(result.dnsRecordId).toBe(12345); // existing record's id, not a new one
  });

  it('passes noWait through and returns hasCertificate=false without polling', async () => {
    const pool = getMockAgent().get('https://api.bunny.net');
    // listPullZoneHostnames — hostname not yet linked.
    pool
      .intercept({ path: '/pullzone/42', method: 'GET' })
      .reply(200, {
        Id: 42,
        Name: 'pz',
        OriginUrl: 'https://x',
        Enabled: true,
        Hostnames: [],
      });
    // addHostname.
    pool
      .intercept({ path: '/pullzone/42/addHostname', method: 'POST' })
      .reply(204);
    // listPullZoneHostnames after add — hostname now present.
    pool
      .intercept({ path: '/pullzone/42', method: 'GET' })
      .reply(200, {
        Id: 42,
        Name: 'pz',
        OriginUrl: 'https://x',
        Enabled: true,
        Hostnames: [{ Value: 'example.com', HasCertificate: false }],
      });

    const result = await connectDomain(42, 'example.com', { noWait: true });
    expect(result.ok).toBe(true);
    expect(result.hostnameLinked).toBe(true);
    expect(result.hasCertificate).toBe(false);
    expect(result.dnsRecordId).toBeUndefined();
  });
});
