import { describe, expect, it } from 'vitest';
import { parseRecordInput, RECORD_TYPE_CODES, recordTypeName } from '../../src/core/dns.js';
import { ValidationError } from '../../src/api/errors.js';

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

  it('accepts FLATTEN with a target hostname', () => {
    const r = parseRecordInput({ type: 'FLATTEN', name: '@', value: 'origin.example.com' });
    expect(r.type).toBe('FLATTEN');
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
