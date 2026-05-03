import { describe, expect, it } from 'vitest';
import { computeFqdn } from '../../src/commands/dns/record/add.js';

describe('computeFqdn', () => {
  it('returns the bare domain for apex `@`', () => {
    expect(computeFqdn('@', 'example.com')).toBe('example.com');
  });

  it('returns the bare domain for empty name', () => {
    expect(computeFqdn('', 'example.com')).toBe('example.com');
  });

  it('strips trailing dot from already-qualified input', () => {
    expect(computeFqdn('host.example.com.', 'example.com')).toBe('host.example.com');
  });

  it('joins simple subdomain names with the zone domain', () => {
    expect(computeFqdn('www', 'example.com')).toBe('www.example.com');
  });

  it('preserves wildcard prefix when joining with the zone domain', () => {
    expect(computeFqdn('*', 'example.com')).toBe('*.example.com');
    expect(computeFqdn('*.api', 'example.com')).toBe('*.api.example.com');
  });
});
