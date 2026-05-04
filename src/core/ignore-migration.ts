// One-shot bunny.json migration: when `deploy.ignore` is byte-equal to the
// rc.13-32 legacy default, rewrite it with the rc.33+ static-site baseline.
// Idempotent - after the first migration the array no longer matches legacy
// so subsequent deploys no-op. Any user customization (added/removed/reordered
// entry) blocks the migration to preserve intent.

import { readFile, writeFile } from 'node:fs/promises';
import type { BunnyJson } from '../config/bunny-json.js';

// What every fresh `bunny init` produced from rc.13 through rc.32.
export const LEGACY_DEFAULT_IGNORE = [
  'bunny.json',
  '.bunnyrc',
  '.bunny-state.json',
  '**/.*',
  '**/node_modules/**',
] as const;

// rc.33+ baseline. Adds the standard static-site clutter (docs, plans,
// scripts, tests, root markdown) that almost no project wants on a CDN.
export const RC33_DEFAULT_IGNORE = [
  'bunny.json',
  '.bunnyrc',
  '.bunny-state.json',
  '**/.*',
  '**/node_modules/**',
  'docs/**',
  'plans/**',
  'scripts/**',
  'tests/**',
  'README.md',
  'LICENSE*',
  'CONTRIBUTING.md',
  'CLAUDE.md',
  'AGENTS.md',
  '*.md',
] as const;

export type MigrationResult = { from: number; to: number };

export async function maybeMigrateIgnoreDefaults(
  configPath: string,
  config: BunnyJson,
): Promise<MigrationResult | null> {
  const current = config.deploy.ignore;
  if (!arraysEqual(current, LEGACY_DEFAULT_IGNORE as readonly string[])) {
    return null;
  }
  // Re-read the raw JSON so we don't lose unrelated fields the schema
  // doesn't model (comments via `$schema`, future keys, user additions
  // outside `deploy`).
  let raw: string;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch {
    return null;
  }
  let parsed: { deploy?: { ignore?: string[] } } & Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed.deploy) return null;
  parsed.deploy.ignore = [...RC33_DEFAULT_IGNORE];
  try {
    await writeFile(configPath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
  } catch {
    return null;
  }
  // Mutate the in-memory config so the rest of the deploy uses the new list.
  config.deploy.ignore = [...RC33_DEFAULT_IGNORE];
  return { from: LEGACY_DEFAULT_IGNORE.length, to: RC33_DEFAULT_IGNORE.length };
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
