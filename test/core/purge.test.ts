import { describe, expect, it, vi } from 'vitest';
import { parsePurgeArg, runPurge } from '../../src/core/purge.js';
import type { AccountClient } from '../../src/api/account.js';

function fakeClient(overrides: Partial<AccountClient> = {}): AccountClient {
  return {
    listStorageZones: vi.fn(),
    getStorageZoneByName: vi.fn(),
    getStorageZone: vi.fn(),
    createStorageZone: vi.fn(),
    deleteStorageZone: vi.fn(),
    listPullZones: vi.fn(),
    getPullZone: vi.fn(),
    createPullZone: vi.fn(),
    deletePullZone: vi.fn(),
    purgeByUrl: vi.fn(async () => undefined),
    purgePullZone: vi.fn(async () => undefined),
    purgePullZoneByTag: vi.fn(async () => undefined),
    ...overrides,
  } as AccountClient;
}

describe('parsePurgeArg', () => {
  it('parses a URL', () => {
    expect(parsePurgeArg('https://cdn.example.com/x.js')).toEqual({
      kind: 'url',
      url: 'https://cdn.example.com/x.js',
    });
  });

  it('parses pull-zone:<id>', () => {
    expect(parsePurgeArg('pull-zone:42')).toEqual({ kind: 'pullzone', pullZoneId: 42 });
  });

  it('rejects bare "all"', () => {
    expect(() => parsePurgeArg('all')).toThrowError(/pull-zone/);
  });

  it('rejects bare "tag:"', () => {
    expect(() => parsePurgeArg('tag:foo')).toThrowError(/pull-zone/);
  });

  it('rejects unknown shape', () => {
    expect(() => parsePurgeArg('foo')).toThrowError(/Unrecognized/);
  });
});

describe('runPurge', () => {
  it('purges a URL', async () => {
    const client = fakeClient();
    const r = await runPurge(client, { kind: 'url', url: 'https://x.test' });
    expect(r.ok).toBe(1);
    expect(r.failed).toEqual([]);
    expect(client.purgeByUrl).toHaveBeenCalledWith('https://x.test');
  });

  it('purges a pull-zone', async () => {
    const client = fakeClient();
    const r = await runPurge(client, { kind: 'pullzone', pullZoneId: 99 });
    expect(r.ok).toBe(1);
    expect(client.purgePullZone).toHaveBeenCalledWith(99);
  });

  it('collects failures', async () => {
    const client = fakeClient({
      purgePullZone: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const r = await runPurge(client, { kind: 'pullzone', pullZoneId: 7 });
    expect(r.ok).toBe(0);
    expect(r.failed).toEqual([{ target: 'pull-zone:7', error: 'boom' }]);
  });
});
