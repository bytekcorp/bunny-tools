import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addEdgeRule,
  deleteEdgeRule,
  listEdgeRules,
  listStorageZones,
} from '../../src/core/zones.js';
import { getMockAgent } from '../setup.js';

describe('core/zones', () => {
  let scratch: string;
  let envBackup: Record<string, string | undefined> = {};

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'zones-'));
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

  it('listStorageZones returns the paginated list', async () => {
    getMockAgent()
      .get('https://api.bunny.net')
      .intercept({ path: /\/storagezone.*/, method: 'GET' })
      .reply(200, {
        Items: [
          { Id: 1, Name: 'a', Region: 'NY', StorageUsed: 0, FilesStored: 0, ReplicationRegions: [], PullZones: [] },
          { Id: 2, Name: 'b', Region: 'LA', StorageUsed: 0, FilesStored: 0, ReplicationRegions: [], PullZones: [] },
        ],
        HasMoreItems: false,
      });
    const zones = await listStorageZones();
    expect(zones).toHaveLength(2);
    expect(zones[0]?.Name).toBe('a');
  });

  it('addEdgeRule appends to existing list and updates the pull zone', async () => {
    const pool = getMockAgent().get('https://api.bunny.net');
    pool
      .intercept({ path: '/pullzone/42', method: 'GET' })
      .reply(200, {
        Id: 42,
        Name: 'pz',
        OriginUrl: 'https://x',
        Enabled: true,
        Hostnames: [],
        EdgeRules: [{ Guid: 'g1', ActionType: 1 }],
      });
    pool
      .intercept({
        path: '/pullzone/42',
        method: 'POST',
      })
      .reply(200, { Id: 42, Name: 'pz', OriginUrl: 'https://x', Enabled: true, Hostnames: [] });

    const next = await addEdgeRule(42, { ActionType: 2, Description: 'new' });
    expect(next).toHaveLength(2);
    expect(next[1]?.Description).toBe('new');
  });

  it('deleteEdgeRule removes by Guid', async () => {
    const pool = getMockAgent().get('https://api.bunny.net');
    pool
      .intercept({ path: '/pullzone/42', method: 'GET' })
      .reply(200, {
        Id: 42,
        Name: 'pz',
        OriginUrl: 'https://x',
        Enabled: true,
        Hostnames: [],
        EdgeRules: [
          { Guid: 'g1', ActionType: 1 },
          { Guid: 'g2', ActionType: 2 },
        ],
      });
    pool.intercept({ path: '/pullzone/42', method: 'POST' }).reply(200, {
      Id: 42,
      Name: 'pz',
      OriginUrl: 'https://x',
      Enabled: true,
      Hostnames: [],
    });
    const next = await deleteEdgeRule(42, 'g1');
    expect(next).toHaveLength(1);
    expect(next[0]?.Guid).toBe('g2');
  });

  it('deleteEdgeRule throws when Guid is unknown', async () => {
    getMockAgent()
      .get('https://api.bunny.net')
      .intercept({ path: '/pullzone/42', method: 'GET' })
      .reply(200, {
        Id: 42,
        Name: 'pz',
        OriginUrl: 'https://x',
        Enabled: true,
        Hostnames: [],
        EdgeRules: [{ Guid: 'g1', ActionType: 1 }],
      });
    await expect(deleteEdgeRule(42, 'missing')).rejects.toThrowError(/No edge rule/);
  });

  it('listEdgeRules returns empty for pull zones with no rules', async () => {
    getMockAgent()
      .get('https://api.bunny.net')
      .intercept({ path: '/pullzone/42', method: 'GET' })
      .reply(200, {
        Id: 42,
        Name: 'pz',
        OriginUrl: 'https://x',
        Enabled: true,
        Hostnames: [],
      });
    const rules = await listEdgeRules(42);
    expect(rules).toEqual([]);
  });
});
