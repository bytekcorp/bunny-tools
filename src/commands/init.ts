// `bunny init [dir]` — unified bootstrap (auth + feature picker + project config).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
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
    noAgentsMd?: boolean;
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

    // AI-anchor hint: drop a `## Deploy` section into AGENTS.md so future
    // Claude/Cursor/Windsurf sessions auto-detect this project uses
    // bunny-tools. AGENTS.md is the cross-tool standard (https://agents.md);
    // tools that don't read it ignore the file harmlessly. Idempotent: skips
    // if the section already exists. Opt out via --no-agents-md.
    if (!flags.noAgentsMd) {
      const wrote = await maybeWriteAgentsHint(targetCwd);
      if (wrote === 'created') progress.info('Created AGENTS.md with deploy hint.');
      else if (wrote === 'appended') progress.info('Appended deploy hint to AGENTS.md.');
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

const AGENTS_HINT_MARKER = '<!-- bunny-tools deploy hint -->';
const AGENTS_HINT_BLOCK = `${AGENTS_HINT_MARKER}
## Deploy

This project uses [bunny-tools](https://www.npmjs.com/package/bunny-tools) for Bunny.net storage + CDN.

- Deploy: \`bunny deploy\` (sync + CDN purge)
- Setup: \`bunny init\` (already run; re-run with \`--force\` to reset)
- Discovery: \`bunny manifest --pretty\` lists every available command
`;

// Returns 'created' (wrote a new file), 'appended' (added section to an
// existing file), or 'skipped' (section already present or file unreadable).
// Does not throw — failures are surfaced as 'skipped' to keep init resilient.
async function maybeWriteAgentsHint(cwd: string): Promise<'created' | 'appended' | 'skipped'> {
  const path = join(cwd, 'AGENTS.md');
  try {
    const existing = await readFile(path, 'utf8');
    if (existing.includes(AGENTS_HINT_MARKER)) return 'skipped';
    const sep = existing.endsWith('\n') ? '\n' : '\n\n';
    await writeFile(path, existing + sep + AGENTS_HINT_BLOCK, 'utf8');
    return 'appended';
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') return 'skipped';
    try {
      await writeFile(path, AGENTS_HINT_BLOCK, 'utf8');
      return 'created';
    } catch {
      return 'skipped';
    }
  }
}
