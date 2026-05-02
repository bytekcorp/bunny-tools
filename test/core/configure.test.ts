import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runConfigure } from '../../src/core/configure.js';
import { getMockAgent } from '../setup.js';

const ENV_KEY = 'BUNNY_ACCOUNT_KEY';

describe('runConfigure (non-interactive)', () => {
  let xdgBackup: string | undefined;
  let envKeyBackup: string | undefined;
  let scratchDir: string;

  beforeEach(async () => {
    scratchDir = await mkdtemp(join(tmpdir(), 'configure-'));
    xdgBackup = process.env['XDG_CONFIG_HOME'];
    envKeyBackup = process.env[ENV_KEY];
    process.env['XDG_CONFIG_HOME'] = scratchDir;
    process.env[ENV_KEY] = 'env-account-key';
  });

  afterEach(async () => {
    if (xdgBackup === undefined) delete process.env['XDG_CONFIG_HOME'];
    else process.env['XDG_CONFIG_HOME'] = xdgBackup;
    if (envKeyBackup === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = envKeyBackup;
    await rm(scratchDir, { recursive: true, force: true });
  });

  it('completes without prompts when all flags provided', async () => {
    const pool = getMockAgent().get('https://api.bunny.net');
    pool
      .intercept({ path: /\/storagezone.*/, method: 'GET' })
      .reply(200, {
        Items: [
          {
            Id: 1,
            Name: 'my-app',
            Region: 'NY',
            StorageUsed: 0,
            FilesStored: 0,
            ReplicationRegions: [],
            PullZones: [],
          },
        ],
        HasMoreItems: false,
      })
      .persist();
    pool
      .intercept({ path: /\/pullzone.*/, method: 'GET' })
      .reply(200, { Items: [], HasMoreItems: false })
      .persist();

    const ask = vi.fn();
    const pick = vi.fn();
    const confirm = vi.fn();

    const result = await runConfigure(
      { accountKey: 'account-key', storageZone: 'my-app', storagePassword: 'pw' },
      { ask, pick, confirm },
      { interactive: false },
    );

    expect(ask).not.toHaveBeenCalled();
    expect(pick).not.toHaveBeenCalled();
    expect(result.storedScopes).toContain('account');
    expect(result.storedScopes).toContain('storage:my-app');
    expect(result.suggestedBunnyJson?.deploy.storageZone).toBe('my-app');
  });

  it('throws when account key missing in non-interactive mode', async () => {
    delete process.env[ENV_KEY];
    const ask = vi.fn();
    const pick = vi.fn();
    const confirm = vi.fn();
    await expect(
      runConfigure({}, { ask, pick, confirm }, { interactive: false }),
    ).rejects.toThrowError(/Account API key required/);
  });
});
