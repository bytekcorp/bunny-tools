import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBunnyJson, BunnyJsonSchema } from '../../src/config/bunny-json.js';
import { ConfigError } from '../../src/api/errors.js';

async function withTempBunnyJson<T>(content: unknown | string, fn: (cwd: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'bunny-json-test-'));
  const sub = join(dir, 'inner', 'deep');
  await mkdir(sub, { recursive: true });
  const body = typeof content === 'string' ? content : JSON.stringify(content);
  await writeFile(join(dir, 'bunny.json'), body, 'utf8');
  try {
    return await fn(sub);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('loadBunnyJson', () => {
  it('walks up to find bunny.json', async () => {
    const result = await withTempBunnyJson(
      {
        deploy: { publicDir: 'dist', storageZone: 'my-app' },
      },
      (cwd) => loadBunnyJson(cwd),
    );
    expect(result.config.deploy.publicDir).toBe('dist');
    expect(result.config.deploy.storageZone).toBe('my-app');
    expect(result.config.deploy.concurrency).toBe(8);
  });

  it('throws ConfigError when bunny.json missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'no-bunny-'));
    try {
      await expect(loadBunnyJson(dir)).rejects.toBeInstanceOf(ConfigError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws ConfigError on invalid JSON', async () => {
    await withTempBunnyJson('{ not valid json', async (cwd) => {
      await expect(loadBunnyJson(cwd)).rejects.toBeInstanceOf(ConfigError);
    });
  });

  it('throws ConfigError on missing publicDir', async () => {
    await withTempBunnyJson(
      { deploy: { storageZone: 'my-app' } },
      async (cwd) => {
        await expect(loadBunnyJson(cwd)).rejects.toBeInstanceOf(ConfigError);
      },
    );
  });

  it('throws ConfigError on bad region', async () => {
    await withTempBunnyJson(
      { deploy: { publicDir: 'dist', storageZone: 'my-app', region: 'mars' } },
      async (cwd) => {
        await expect(loadBunnyJson(cwd)).rejects.toBeInstanceOf(ConfigError);
      },
    );
  });

  it('accepts purge tag string', () => {
    const r = BunnyJsonSchema.safeParse({
      deploy: {
        publicDir: 'dist',
        storageZone: 'x',
        pullZones: [{ id: 1, purge: 'tag:app' }],
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejects negative concurrency', () => {
    const r = BunnyJsonSchema.safeParse({
      deploy: { publicDir: 'dist', storageZone: 'x', concurrency: -1 },
    });
    expect(r.success).toBe(false);
  });
});
