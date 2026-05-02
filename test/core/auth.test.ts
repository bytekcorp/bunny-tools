import { describe, expect, it } from 'vitest';
import { parseAccountString, parseScopeFlag } from '../../src/core/auth.js';

describe('core/auth scope parsers', () => {
  it('parses each scope kind', () => {
    expect(parseAccountString('account')).toEqual({ kind: 'account' });
    expect(parseAccountString('storage:my-zone')).toEqual({ kind: 'storage', zone: 'my-zone' });
    expect(parseAccountString('stream:42')).toEqual({ kind: 'stream', libraryId: '42' });
    expect(parseAccountString('database:main')).toEqual({ kind: 'database', name: 'main' });
  });

  it('returns null on unknown shapes', () => {
    expect(parseAccountString('garbage')).toBeNull();
    expect(parseAccountString('storage:')).toBeNull();
    expect(parseAccountString('unknown:foo')).toBeNull();
  });

  it('parseScopeFlag throws on bad input', () => {
    expect(() => parseScopeFlag('not-real')).toThrowError(/Invalid --scope/);
  });
});
