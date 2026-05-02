// `bunny init [dir]` — unified bootstrap (auth + feature picker + project config).

import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ParsedInvocation } from '../manifest/types.js';
import type { Feature } from '../core/init.js';
import { FEATURES, runInit } from '../core/init.js';
import { ask, confirm, isInteractive, multiselect, pick } from '../ui/prompt.js';
import { createProgress } from '../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { dir?: string };
  // Optional positional: target directory. Created if missing; runInit operates from there.
  const targetCwd = args.dir ? resolve(args.dir) : process.cwd();
  if (args.dir) {
    await mkdir(targetCwd, { recursive: true });
  }
  const flags = inv.flags as {
    nonInteractive?: boolean;
    force?: boolean;
    accountKey?: string;
    features?: string;
    publicDir?: string;
    storageZone?: string;
    storagePassword?: string;
    region?: string;
    pullZone?: string;
    purge?: string;
    streamLibrary?: string;
    streamKey?: string;
  };

  const interactive = !flags.nonInteractive && isInteractive();
  if (!interactive && !flags.accountKey && !(await hasAccountKey())) {
    progress.fail('Non-interactive mode without existing creds requires --account-key.');
    return 1;
  }

  const features = parseFeatures(flags.features);

  try {
    const result = await runInit(
      {
        ...(flags.accountKey ? { accountKey: flags.accountKey } : {}),
        ...(features ? { features } : {}),
        ...(flags.publicDir ? { publicDir: flags.publicDir } : {}),
        ...(flags.storageZone ? { storageZone: flags.storageZone } : {}),
        ...(flags.storagePassword ? { storagePassword: flags.storagePassword } : {}),
        ...(flags.region ? { region: flags.region } : {}),
        ...(flags.pullZone ? { pullZoneId: Number.parseInt(flags.pullZone, 10) } : {}),
        ...(flags.purge ? { purge: flags.purge } : {}),
        ...(flags.streamLibrary ? { streamLibraryId: flags.streamLibrary } : {}),
        ...(flags.streamKey ? { streamKey: flags.streamKey } : {}),
      },
      { ask, pick, multiselect, confirm, notify: (m) => progress.info(m) },
      { interactive, cwd: targetCwd, ...(flags.force ? { force: true } : {}) },
    );

    if (result.alreadyInitialized) {
      progress.fail(
        `bunny.json already exists at ${result.bunnyJsonPath}. Pass --force to overwrite, or delete the file.`,
      );
      return 2;
    }

    progress.succeed(`Wrote ${result.bunnyJsonPath}`);
    if (result.gitignoreUpdated) progress.info('.bunny-state.json added to .gitignore.');
    if (result.storedScopes.length > 0) {
      progress.info(`Credentials stored: ${result.storedScopes.join(', ')}`);
    }
    if (result.features.includes('storage')) {
      progress.info('Try: bunny deploy --dry-run');
    }
    return 0;
  } catch (err) {
    progress.fail((err as Error).message);
    return 1;
  }
}

function parseFeatures(raw: string | undefined): Feature[] | undefined {
  if (!raw) return undefined;
  if (raw === 'all') return [...FEATURES];
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    if (!FEATURES.includes(p as Feature)) {
      throw new Error(`Unknown feature "${p}". Allowed: ${FEATURES.join(', ')}, or "all".`);
    }
  }
  return parts as Feature[];
}

async function hasAccountKey(): Promise<boolean> {
  const { resolveCredential } = await import('../config/credential-resolver.js');
  try {
    const v = await resolveCredential({ kind: 'account' });
    return v.length > 0;
  } catch {
    return false;
  }
}
