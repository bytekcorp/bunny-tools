import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { ConfigError } from '../api/errors.js';
import { atomicWriteJson } from '../util/fs.js';

const AliasEntry = z.object({
  storageZone: z.string().min(1),
  region: z.string().optional(),
  pullZones: z.array(z.number().int().positive()).default([]),
});

export const BunnyrcSchema = z.object({
  default: z.string().optional(),
  aliases: z.record(z.string(), AliasEntry).default({}),
});

export type Bunnyrc = z.infer<typeof BunnyrcSchema>;

export async function loadBunnyrc(cwd: string = process.cwd()): Promise<{
  rc: Bunnyrc | null;
  filePath: string | null;
}> {
  const filePath = await findBunnyrc(cwd);
  if (!filePath) return { rc: null, filePath: null };
  const raw = await readFile(filePath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`.bunnyrc at ${filePath} is not valid JSON: ${(err as Error).message}`);
  }
  const result = BunnyrcSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(`.bunnyrc at ${filePath} failed validation`);
  }
  return { rc: result.data, filePath };
}

export async function saveBunnyrc(filePath: string, rc: Bunnyrc): Promise<void> {
  await atomicWriteJson(filePath, rc);
}

async function findBunnyrc(start: string): Promise<string | null> {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, '.bunnyrc');
    try {
      await readFile(candidate);
      return candidate;
    } catch {
      // continue walking up
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
