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
    expect(recordTypeName(99)).toBe('code:99');
  });
});
