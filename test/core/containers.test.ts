import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, deleteApp, listApps } from '../../src/core/containers.js';
import { getMockAgent } from '../setup.js';

describe('core/containers', () => {
  let scratch: string;
  let envBackup: Record<string, string | undefined> = {};

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'containers-'));
    envBackup['XDG_CONFIG_HOME'] = process.env['XDG_CONFIG_HOME'];
    envBackup['BUNNY_API_KEY'] = process.env['BUNNY_API_KEY'];
    process.env['XDG_CONFIG_HOME'] = scratch;
    process.env['BUNNY_API_KEY'] = 'acct';
  });

  afterEach(async () => {
    for (const [k, v] of Object.entries(envBackup)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    envBackup = {};
    await rm(scratch, { recursive: true, force: true });
  });

  it('listApps paginates /mc/apps', async () => {
    getMockAgent()
      .get('https://api.bunny.net')
      .intercept({ path: /\/mc\/apps.*/, method: 'GET' })
      .reply(200, {
        Items: [{ Id: 'a1', Name: 'app-a', Image: 'img:1', Status: 'running', Region: 'ny' }],
        HasMoreItems: false,
      });
    const apps = await listApps();
    expect(apps).toHaveLength(1);
    expect(apps[0]?.Name).toBe('app-a');
  });

  it('createApp POSTs body to /mc/apps', async () => {
    getMockAgent()
      .get('https://api.bunny.net')
      .intercept({ path: '/mc/apps', method: 'POST' })
      .reply(201, { Id: 'a2', Name: 'app-b', Image: 'img:2', Region: 'la' });
    const app = await createApp({ name: 'app-b', image: 'img:2', region: 'la', port: 8080 });
    expect(app.Id).toBe('a2');
  });

  it('deleteApp DELETEs by id', async () => {
    getMockAgent()
      .get('https://api.bunny.net')
      .intercept({ path: '/mc/apps/a99', method: 'DELETE' })
      .reply(204, '');
    await expect(deleteApp('a99')).resolves.toBeUndefined();
  });
});
