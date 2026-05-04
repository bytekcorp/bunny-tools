import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addRecord, parseRecordInput, RECORD_TYPE_CODES, recordTypeName } from '../../src/core/dns.js';
import { ValidationError } from '../../src/api/errors.js';
import { getMockAgent } from '../setup.js';

describe('core/dns record validation', () => {
  it('accepts an A record with required fields', () => {
    const r = parseRecordInput({ type: 'A', name: '@', value: '203.0.113.1' });
    expect(r.type).toBe('A');
    expect(r.value).toBe('203.0.113.1');
  });

  it('rejects MX without priority', () => {
    expect(() =>
      parseRecordInput({ type: 'MX', name: '@', value: 'mail.example.com' }),
    ).toThrowError(ValidationError);
  });

  it('accepts SRV with priority+weight+port', () => {
    const r = parseRecordInput({
      type: 'SRV',
      name: '_sip._tcp',
      value: 'sip.example.com',
      priority: 10,
      weight: 5,
      port: 5060,
    });
    expect(r.type).toBe('SRV');
    if (r.type === 'SRV') expect(r.port).toBe(5060);
  });

  it('rejects SRV missing port', () => {
    expect(() =>
      parseRecordInput({ type: 'SRV', name: 'x', value: 'y', priority: 1, weight: 1 }),
    ).toThrowError(ValidationError);
  });

  it('rejects CAA without flags+tag', () => {
    expect(() =>
      parseRecordInput({ type: 'CAA', name: '@', value: 'letsencrypt.org' }),
    ).toThrowError(ValidationError);
  });

  it('accepts CAA with flags+tag', () => {
    const r = parseRecordInput({
      type: 'CAA',
      name: '@',
      value: 'letsencrypt.org',
      flags: 0,
      tag: 'issue',
    });
    expect(r.type).toBe('CAA');
  });

  it('rejects unknown type', () => {
    expect(() => parseRecordInput({ type: 'XYZZY', name: 'x', value: 'y' })).toThrowError(ValidationError);
  });

  it('recordTypeName round-trips known codes', () => {
    expect(recordTypeName(RECORD_TYPE_CODES['A']!)).toBe('A');
    expect(recordTypeName(RECORD_TYPE_CODES['SRV']!)).toBe('SRV');
    expect(recordTypeName(RECORD_TYPE_CODES['REDIRECT']!)).toBe('REDIRECT');
    expect(recordTypeName(RECORD_TYPE_CODES['PULLZONE']!)).toBe('PULLZONE');
    expect(recordTypeName(99)).toBe('code:99');
  });

  // -- Bunny-specific routing types ----------------------------------------

  it('accepts REDIRECT with just a URL value', () => {
    const r = parseRecordInput({ type: 'REDIRECT', name: 'www', value: 'https://example.com' });
    expect(r.type).toBe('REDIRECT');
    expect(r.value).toBe('https://example.com');
  });

  it('rejects FLATTEN — Bunny live API returns "Unknown record type" despite OpenAPI spec listing it (rc.40)', () => {
    expect(() =>
      parseRecordInput({ type: 'FLATTEN', name: '@', value: 'origin.example.com' }),
    ).toThrowError(ValidationError);
  });

  it('accepts PTR with a target', () => {
    const r = parseRecordInput({ type: 'PTR', name: '1.0.0.127.in-addr.arpa', value: 'host.example.com' });
    expect(r.type).toBe('PTR');
  });

  it('accepts PULLZONE with linkName', () => {
    const r = parseRecordInput({
      type: 'PULLZONE',
      name: 'cdn',
      value: 'my-pz-name',
      linkName: '12345',
    });
    expect(r.type).toBe('PULLZONE');
    if (r.type === 'PULLZONE') expect(r.linkName).toBe('12345');
  });

  it('rejects PULLZONE without linkName', () => {
    expect(() =>
      parseRecordInput({ type: 'PULLZONE', name: 'cdn', value: 'my-pz-name' }),
    ).toThrowError(ValidationError);
  });

  it('accepts SCRIPT with linkName', () => {
    const r = parseRecordInput({
      type: 'SCRIPT',
      name: 'edge',
      value: 'my-script',
      linkName: '987',
    });
    expect(r.type).toBe('SCRIPT');
    if (r.type === 'SCRIPT') expect(r.linkName).toBe('987');
  });

  it('rejects SCRIPT without linkName', () => {
    expect(() =>
      parseRecordInput({ type: 'SCRIPT', name: 'edge', value: 'my-script' }),
    ).toThrowError(ValidationError);
  });
});

describe('core/dns addRecord PULLZONE pre-flight', () => {
  let scratch: string;
  let envBackup: Record<string, string | undefined> = {};

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'dns-preflight-'));
    envBackup['XDG_CONFIG_HOME'] = process.env['XDG_CONFIG_HOME'];
    envBackup['BUNNY_API_KEY'] = process.env['BUNNY_API_KEY'];
    process.env['XDG_CONFIG_HOME'] = scratch;
    process.env['BUNNY_API_KEY'] = 'test-key';
  });

  afterEach(async () => {
    for (const [k, v] of Object.entries(envBackup)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    envBackup = {};
    await rm(scratch, { recursive: true, force: true });
  });

  it('rejects PULLZONE record when hostname is not linked to the pull zone', async () => {
    const pool = getMockAgent().get('https://api.bunny.net');
    pool
      .intercept({ path: '/pullzone/5789465', method: 'GET' })
      .reply(200, {
        Id: 5789465,
        Name: 'bytek',
        OriginUrl: null,
        Enabled: true,
        Hostnames: [{ Value: 'bytek.b-cdn.net', HasCertificate: true }],
      });
    pool
      .intercept({ path: '/dnszone/784669', method: 'GET' })
      .reply(200, { Id: 784669, Domain: 'bytek.org' });

    await expect(
      addRecord(784669, {
        type: 'PULLZONE',
        name: '',
        value: 'bytek',
        linkName: '5789465',
      }),
    ).rejects.toThrow(/not linked to pull zone/);
  });

  it('rejects PULLZONE record when hostname is linked but has no SSL certificate', async () => {
    const pool = getMockAgent().get('https://api.bunny.net');
    pool
      .intercept({ path: '/pullzone/5789465', method: 'GET' })
      .reply(200, {
        Id: 5789465,
        Name: 'bytek',
        OriginUrl: null,
        Enabled: true,
        Hostnames: [
          { Value: 'bytek.b-cdn.net', HasCertificate: true },
          { Value: 'bytek.org', HasCertificate: false },
        ],
      });
    pool
      .intercept({ path: '/dnszone/784669', method: 'GET' })
      .reply(200, { Id: 784669, Domain: 'bytek.org' });

    await expect(
      addRecord(784669, {
        type: 'PULLZONE',
        name: '',
        value: 'bytek',
        linkName: '5789465',
      }),
    ).rejects.toThrow(/no SSL certificate yet/);
  });

  it('passes pre-flight and POSTs PullZoneId (not LinkName) when hostname is linked and cert is provisioned', async () => {
    const pool = getMockAgent().get('https://api.bunny.net');
    pool
      .intercept({ path: '/pullzone/5789465', method: 'GET' })
      .reply(200, {
        Id: 5789465,
        Name: 'bytek',
        OriginUrl: null,
        Enabled: true,
        Hostnames: [{ Value: 'bytek.org', HasCertificate: true }],
      });
    pool
      .intercept({ path: '/dnszone/784669', method: 'GET' })
      .reply(200, { Id: 784669, Domain: 'bytek.org' });
    pool
      .intercept({
        path: '/dnszone/784669/records',
        method: 'PUT',
      })
      .reply(201, (req) => {
        const body = JSON.parse(String(req.body));
        // Verify Bunny's required input shape for Type-7: numeric PullZoneId,
        // no string LinkName. Bunny derives Value+LinkName on the response.
        if (body.PullZoneId !== 5789465) throw new Error(`expected PullZoneId=5789465, got ${body.PullZoneId}`);
        if ('LinkName' in body) throw new Error(`should not send LinkName for PULLZONE, got ${body.LinkName}`);
        return { Id: 999, Type: 7, Name: '', Value: 'bytek', LinkName: '5789465' };
      });

    const created = await addRecord(784669, {
      type: 'PULLZONE',
      name: '',
      value: 'bytek',
      linkName: '5789465',
    });
    expect(created.Id).toBe(999);
    expect(created.Type).toBe(7);
  });
});
