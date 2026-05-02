// `.bunny-state.json` cache: lets warm runs skip rehashing unchanged files.
// Versioned schema — bump `v` if shape changes.

import { z } from 'zod';
import { atomicWriteJson, readJsonOrNull } from '../util/fs.js';

export const StateFileSchema = z.object({
  v: z.literal(1),
  zone: z.string(),
  files: z.record(
    z.string(),
    z.object({
      sha256: z.string().length(64),
      size: z.number().int().nonnegative(),
      mtimeMs: z.number(),
    }),
  ),
});

export type StateFile = z.infer<typeof StateFileSchema>;

export const STATE_FILENAME = '.bunny-state.json';

export async function loadState(path: string): Promise<StateFile | null> {
  const raw = await readJsonOrNull<unknown>(path);
  if (!raw) return null;
  const parsed = StateFileSchema.safeParse(raw);
  if (!parsed.success) {
    // Corrupt or older version — treat as empty (forces full rehash, never crashes deploy).
    return null;
  }
  return parsed.data;
}

export async function saveState(path: string, state: StateFile): Promise<void> {
  await atomicWriteJson(path, state);
}

export function emptyState(zone: string): StateFile {
  return { v: 1, zone, files: {} };
}
