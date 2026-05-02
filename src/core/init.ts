// core/init — write a bunny.json for the current project. UI-free.

import { existsSync } from 'node:fs';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWriteJson } from '../util/fs.js';

export type InitInput = {
  publicDir: string;
  storageZone: string;
  region?: string;
  pullZoneIds: number[];
  purge: 'all' | 'none' | string; // accepts "tag:<name>"
};

export type InitResult = {
  bunnyJsonPath: string;
  gitignoreUpdated: boolean;
  cacheTagHint: boolean;
};

export async function runInit(input: InitInput, cwd = process.cwd()): Promise<InitResult> {
  const bunnyJsonPath = join(cwd, 'bunny.json');
  const config = {
    $schema: 'https://unpkg.com/bunny-tools/schema/bunny.schema.json',
    deploy: {
      publicDir: input.publicDir,
      ignore: ['bunny.json', '.bunnyrc', '.bunny-state.json', '**/.*', '**/node_modules/**'],
      storageZone: input.storageZone,
      ...(input.region ? { region: input.region } : {}),
      pullZones: input.pullZoneIds.map((id) => ({ id, purge: input.purge })),
    },
  };
  await atomicWriteJson(bunnyJsonPath, config);

  // Add `.bunny-state.json` to .gitignore if it exists and doesn't already list it.
  const gitignore = join(cwd, '.gitignore');
  let gitignoreUpdated = false;
  if (existsSync(gitignore)) {
    const raw = await readFile(gitignore, 'utf8');
    if (!raw.split(/\r?\n/).includes('.bunny-state.json')) {
      await appendFile(gitignore, `\n# bunny-tools\n.bunny-state.json\n`);
      gitignoreUpdated = true;
    }
  }

  return {
    bunnyJsonPath,
    gitignoreUpdated,
    cacheTagHint: typeof input.purge === 'string' && input.purge.startsWith('tag:'),
  };
}

// Naive auto-detect for common build outputs. Used by `bunny init` to suggest a default.
export function detectPublicDir(cwd = process.cwd()): string {
  for (const candidate of ['dist', 'build', 'out', 'public', '_site']) {
    if (existsSync(join(cwd, candidate))) return candidate;
  }
  return 'dist';
}

// Helper for test fixtures: write an arbitrary bunny.json.
export async function writeBunnyJson(path: string, body: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(body, null, 2), 'utf8');
}
