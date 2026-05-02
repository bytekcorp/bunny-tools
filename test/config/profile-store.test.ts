import { describe, expect, it } from 'vitest';
import { normalizeFileStore } from '../../src/config/credential-resolver.js';

describe('credentials file shape (rc.9 multi-account)', () => {
  it('migrates rc.8 flat shape into the default profile', () => {
    const flat = { account: 'abc', 'storage:my-app': 'pw-xyz' };
    const normalized = normalizeFileStore(flat);
    expect(normalized.active).toBe('default');
    expect(normalized.profiles['default']).toEqual(flat);
  });

  it('passes through new shape unchanged (preserves active)', () => {
    const nested = {
      active: 'work',
      profiles: { default: { account: 'a' }, work: { account: 'b' } },
    };
    const normalized = normalizeFileStore(nested);
    expect(normalized.active).toBe('work');
    expect(Object.keys(normalized.profiles).sort()).toEqual(['default', 'work']);
  });

  it('treats null/undefined as empty store with default profile active', () => {
    expect(normalizeFileStore(null).active).toBe('default');
    expect(normalizeFileStore(undefined).active).toBe('default');
    expect(normalizeFileStore(null).profiles).toEqual({});
  });

  it('falls back to "default" when active is missing in nested shape', () => {
    const partial = { profiles: { default: { account: 'a' } } };
    expect(normalizeFileStore(partial).active).toBe('default');
  });

  it('skips non-string values when migrating flat shape', () => {
    const messy: Record<string, unknown> = { account: 'a', extra: 42, nested: { x: 1 } };
    const normalized = normalizeFileStore(messy);
    expect(normalized.profiles['default']).toEqual({ account: 'a' });
  });
});
