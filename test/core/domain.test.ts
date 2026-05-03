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
