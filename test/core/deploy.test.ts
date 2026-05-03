import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDeploy } from '../../src/core/deploy.js';
import type { BunnyJson } from '../../src/config/bunny-json.js';
import { getMockAgent } from '../setup.js';

describe('runDeploy', () => {
  let workDir: string;
  let xdgBackup: string | undefined;
  let envBackup: Record<string, string | undefined> = {};

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'deploy-'));
    await mkdir(join(workDir, 'dist'), { recursive: true });
    await writeFile(join(workDir, 'dist', 'index.html'), '<html>hi</html>');
    await writeFile(join(workDir, 'dist', 'app.js'), 'console.log(1)');
    xdgBackup = process.env['XDG_CONFIG_HOME'];
    process.env['XDG_CONFIG_HOME'] = workDir;
    for (const k of ['BUNNY_ACCOUNT_KEY', 'BUNNY_STORAGE_PASSWORD', 'BUNNY_STORAGE_PASSWORD_MY_APP']) {
      envBackup[k] = process.env[k];
      delete process.env[k];
    }
    process.env['BUNNY_ACCOUNT_KEY'] = 'acc-key';
    process.env['BUNNY_STORAGE_PASSWORD_MY_APP'] = 'st-pw';
  });

  afterEach(async () => {
    if (xdgBackup === undefined) delete process.env['XDG_CONFIG_HOME'];
    else process.env['XDG_CONFIG_HOME'] = xdgBackup;
    for (const [k, v] of Object.entries(envBackup)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    envBackup = {};
    await rm(workDir, { recursive: true, force: true });
  });

  function configWithRegion(): BunnyJson {
    return {
      deploy: {
        publicDir: 'dist',
        ignore: [],
        mimeTypes: {},
        storageZone: 'my-app',
        region: 'ny',
        concurrency: 4,
        pullZones: [{ id: 555, purge: 'all' }],
      },
    };
  }

  function setupHappyPath(opts: { remoteEntries?: unknown[]; expectPurge?: boolean } = {}): void {
    const storage = getMockAgent().get('https://ny.storage.bunnycdn.com');
    const account = getMockAgent().get('https://api.bunny.net');

    storage
      .intercept({ path: '/my-app/', method: 'GET' })
      .reply(200, opts.remoteEntries ?? []);
    storage
      .intercept({ path: '/my-app/index.html', method: 'PUT' })
      .reply(201, '');
    storage
      .intercept({ path: '/my-app/app.js', method: 'PUT' })
      .reply(201, '');
    if (opts.expectPurge !== false) {
      account
        .intercept({ path: '/pullzone/555/purgeCache', method: 'POST' })
        .reply(204, '');
    }
  }

  it('end-to-end: lists, uploads new files, purges pull zone', async () => {
    setupHappyPath();
    const result = await runDeploy({ config: configWithRegion(), cwd: workDir });
    expect(result.uploaded).toBe(2);
    expect(result.failed).toEqual([]);
    expect(result.purged).toBe(1);
  });

  it('--dry-run mutates nothing', async () => {
    const storage = getMockAgent().get('https://ny.storage.bunnycdn.com');
    storage.intercept({ path: '/my-app/', method: 'GET' }).reply(200, []);
    const result = await runDeploy({ config: configWithRegion(), cwd: workDir, dryRun: true });
    expect(result.uploaded).toBe(0);
    expect(result.purged).toBe(0);
  });

  it('respects purge override "none"', async () => {
    const storage = getMockAgent().get('https://ny.storage.bunnycdn.com');
    storage.intercept({ path: '/my-app/', method: 'GET' }).reply(200, []);
    storage.intercept({ path: '/my-app/index.html', method: 'PUT' }).reply(201, '');
    storage.intercept({ path: '/my-app/app.js', method: 'PUT' }).reply(201, '');
    const result = await runDeploy({
      config: configWithRegion(),
      cwd: workDir,
      purgeOverride: 'none',
    });
    expect(result.purged).toBe(0);
    expect(result.uploaded).toBe(2);
  });

  it('--delete removes orphan files', async () => {
    const storage = getMockAgent().get('https://ny.storage.bunnycdn.com');
    const account = getMockAgent().get('https://api.bunny.net');
    storage.intercept({ path: '/my-app/', method: 'GET' }).reply(200, [
      {
        Guid: 'g',
        ObjectName: 'gone.txt',
        Path: '/my-app/',
        Length: 5,
        IsDirectory: false,
        LastChanged: '2026-01-01',
      },
    ]);
    storage.intercept({ path: '/my-app/index.html', method: 'PUT' }).reply(201, '');
    storage.intercept({ path: '/my-app/app.js', method: 'PUT' }).reply(201, '');
    storage.intercept({ path: '/my-app/gone.txt', method: 'DELETE' }).reply(204, '');
    account.intercept({ path: '/pullzone/555/purgeCache', method: 'POST' }).reply(204, '');

    const result = await runDeploy({
      config: configWithRegion(),
      cwd: workDir,
      deleteOrphans: true,
    });
    expect(result.uploaded).toBe(2);
    expect(result.deleted).toBe(1);
    expect(result.failed).toEqual([]);
  });
});
