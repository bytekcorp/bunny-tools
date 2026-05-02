// `bunny init` — per-project bunny.json generator. Thin wrapper over core.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ParsedInvocation } from '../manifest/types.js';
import { detectPublicDir, runInit } from '../core/init.js';
import { listScopes } from '../core/auth.js';
import { ask, confirm, isInteractive, pick } from '../ui/prompt.js';
import { createProgress } from '../ui/progress.js';
import { listAliases, upsertAlias } from '../core/aliases.js';

export async function run(_inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const cwd = process.cwd();

  if (existsSync(join(cwd, 'bunny.json'))) {
    progress.warn('bunny.json already exists. Aborting to avoid overwriting.');
    return 2;
  }

  // Suggest `bunny configure` first if no creds set.
  const stored = await listScopes();
  if (stored.length === 0) {
    progress.warn('No credentials detected. Run `bunny configure` first or set BUNNY_ACCOUNT_KEY env var.');
  }

  if (!isInteractive()) {
    progress.fail('`bunny init` requires an interactive shell. Use a terminal or pre-write bunny.json.');
    return 1;
  }

  const detected = detectPublicDir(cwd);
  const publicDir = await ask({ name: 'publicDir', message: `Public directory (default: ${detected})`, mode: 'plain' });
  const storageZone = await ask({ name: 'storageZone', message: 'Storage zone name', mode: 'plain' });
  const region = await ask({
    name: 'region',
    message: 'Region (ny|la|sg|syd|uk|se|br|jh; leave blank to auto-detect)',
    mode: 'plain',
  });
  const pullZoneRaw = await ask({
    name: 'pullZone',
    message: 'Pull zone IDs (comma-separated; blank for none)',
    mode: 'plain',
  });
  const purge = await pick({
    name: 'purge',
    message: 'Purge strategy after deploy',
    choices: [
      { value: 'all', label: 'all — full pull-zone purge' },
      { value: 'tag:app', label: 'tag — Cache-Tag based (requires origin Cache-Tag header)' },
      { value: 'none', label: 'none — skip purge (you handle it elsewhere)' },
    ],
  });

  const pullZoneIds = pullZoneRaw
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));

  const result = await runInit(
    {
      publicDir: publicDir.length > 0 ? publicDir : detected,
      storageZone,
      ...(region.length > 0 ? { region } : {}),
      pullZoneIds,
      purge,
    },
    cwd,
  );

  progress.succeed(`Wrote ${result.bunnyJsonPath}`);
  if (result.gitignoreUpdated) progress.info('.bunny-state.json added to .gitignore');
  if (result.cacheTagHint) {
    progress.info(
      'Tag-based purge selected. Ensure your origin sets `Cache-Tag` response headers on relevant assets.',
    );
  }

  // Seed an alias too if no aliases exist yet.
  const { aliases } = await listAliases(cwd);
  if (aliases.length === 0) {
    const wantAlias = await confirm({ message: 'Create a "default" alias in .bunnyrc?', default: true });
    if (wantAlias) {
      await upsertAlias(
        'default',
        { storageZone, ...(region.length > 0 ? { region } : {}), pullZones: pullZoneIds },
        cwd,
      );
      progress.info('Wrote .bunnyrc with default alias.');
    }
  }

  return 0;
}
