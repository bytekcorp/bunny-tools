// Build a remote { path → length, checksum? } map by listing the storage
// zone recursively. Uses listRecursive from src/api/storage.ts.

import type { StorageClient } from '../api/storage.js';
import { listRecursive } from '../api/storage.js';
import type { RemoteEntry } from './diff.js';

export async function buildRemoteMap(
  client: StorageClient,
  zone: string,
  region: string,
  root = '/',
): Promise<RemoteEntry[]> {
  const items = await listRecursive(client, zone, region, root);
  return items.map((i) => ({
    path: i.path,
    length: i.length,
    ...(i.checksum ? { checksum: i.checksum } : {}),
  }));
}
