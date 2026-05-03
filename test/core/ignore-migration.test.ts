import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LEGACY_DEFAULT_IGNORE,
  RC33_DEFAULT_IGNORE,
  maybeMigrateIgnoreDefaults,
} from '../../src/core/ignore-migration.js';
import type { BunnyJson } from '../../src/config/bunny-json.js';

describe('maybeMigrateIgnoreDefaults', () => {
  let scratch: string;
  let configPath: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'ignore-migrate-'));
    configPath = join(scratch, 'bunny.json');
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  function makeConfig(ignore: readonly string[]): BunnyJson {
    return {
      deploy: {
        publicDir: 'dist',
        ignore: [...ignore],
        mimeTypes: {},
        storageZone: 'test-zone',
        concurrency: 8,
        pullZones: [],
      },
    } as BunnyJson;
  }

  it('rewrites bunny.json when ignore is byte-equal to the legacy default', async () => {
    const config = makeConfig(LEGACY_DEFAULT_IGNORE);
    await writeFile(
      configPath,
      JSON.stringify({
        $schema: 'https://example/schema.json',
        deploy: {
          publicDir: 'dist',
          ignore: [...LEGACY_DEFAULT_IGNORE],
          storageZone: 'test-zone',
          concurrency: 8,
          pullZones: [],
        },
      }, null, 2),
    );

    const result = await maybeMigrateIgnoreDefaults(configPath, config);
    expect(result).not.toBeNull();
    expect(result!.from).toBe(LEGACY_DEFAULT_IGNORE.length);
    expect(result!.to).toBe(RC33_DEFAULT_IGNORE.length);

    // File on disk now reflects the new defaults.
    const written = JSON.parse(await readFile(configPath, 'utf8'));
    expect(written.deploy.ignore).toEqual([...RC33_DEFAULT_IGNORE]);
    // Unrelated fields preserved.
    expect(written.$schema).toBe('https://example/schema.json');

    // In-memory config also mutated.
    expect(config.deploy.ignore).toEqual([...RC33_DEFAULT_IGNORE]);
  });

  it('no-ops when user added an extra entry to ignore', async () => {
    const customized = [...LEGACY_DEFAULT_IGNORE, 'private/**'];
    const config = makeConfig(customized);
    await writeFile(configPath, JSON.stringify({ deploy: { ignore: customized } }));

    const result = await maybeMigrateIgnoreDefaults(configPath, config);
    expect(result).toBeNull();
    expect(config.deploy.ignore).toEqual(customized);
  });

  it('no-ops when user removed an entry from the legacy default', async () => {
    const trimmed = LEGACY_DEFAULT_IGNORE.slice(0, -1);
    const config = makeConfig(trimmed);
    await writeFile(configPath, JSON.stringify({ deploy: { ignore: trimmed } }));

    const result = await maybeMigrateIgnoreDefaults(configPath, config);
    expect(result).toBeNull();
  });

  it('no-ops when ignore is reordered (still preserves intent)', async () => {
    const reordered = [...LEGACY_DEFAULT_IGNORE].reverse();
    const config = makeConfig(reordered);
    await writeFile(configPath, JSON.stringify({ deploy: { ignore: reordered } }));

    const result = await maybeMigrateIgnoreDefaults(configPath, config);
    expect(result).toBeNull();
  });

  it('is idempotent — second migration on the new default no-ops', async () => {
    const config = makeConfig(RC33_DEFAULT_IGNORE);
    await writeFile(configPath, JSON.stringify({ deploy: { ignore: [...RC33_DEFAULT_IGNORE] } }));

    const result = await maybeMigrateIgnoreDefaults(configPath, config);
    expect(result).toBeNull();
  });
});
