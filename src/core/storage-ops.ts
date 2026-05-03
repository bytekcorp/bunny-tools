// core/storage-ops — typed wrappers around the Edge Storage API.
// Resolves region per zone from the account API; caches per-call.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve as resolvePath } from 'node:path';
import { createAccountClient, regionCodeToSubdomain } from '../api/account.js';
import { createStorageClient, listRecursive } from '../api/storage.js';
import { resolveCredential } from '../config/credential-resolver.js';
import { contentTypeFor } from '../util/content-type.js';
import { loadBunnyJson } from '../config/bunny-json.js';
import { getActiveAliasOverlay } from './aliases.js';

// Resolve the storage zone to use when none provided by user.
// Precedence: override (--zone flag) > active alias overlay > bunny.json#deploy.storageZone > error.
export async function resolveActiveZone(override?: string): Promise<string> {
  if (override && override.length > 0) return override;
  const alias = await getActiveAliasOverlay().catch(() => null);
  if (alias?.storageZone) return alias.storageZone;
  try {
    const { config } = await loadBunnyJson();
    if (config.deploy.storageZone) return config.deploy.storageZone;
  } catch {
    // bunny.json not found; fall through
  }
  throw new Error(
    'No storage zone specified. Pass --zone=<name>, run `bunny init` to set bunny.json#deploy.storageZone, or `bunny use <alias>`.',
  );
}

async function resolveRegion(zone: string, override?: string): Promise<string> {
  if (override !== undefined) return override;
  const acct = createAccountClient({ resolveCredential: (s) => resolveCredential(s) });
  const meta = await acct.getStorageZoneByName(zone);
  if (!meta) throw new Error(`Storage zone "${zone}" not found on this account.`);
  return regionCodeToSubdomain(meta.Region);
}

export async function uploadFile(zone: string, localPath: string, remotePath: string, region?: string): Promise<void> {
  const r = await resolveRegion(zone, region);
  const client = createStorageClient({ resolveCredential: (s) => resolveCredential(s) });
  const buf = await readFile(resolvePath(localPath));
  await client.putFile(zone, r, remotePath, buf, contentTypeFor(remotePath));
}

export async function downloadFile(zone: string, remotePath: string, localPath: string, region?: string): Promise<void> {
  const r = await resolveRegion(zone, region);
  const client = createStorageClient({ resolveCredential: (s) => resolveCredential(s) });
  const buf = await client.getFile(zone, r, remotePath);
  await mkdir(dirname(resolvePath(localPath)), { recursive: true });
  await writeFile(resolvePath(localPath), buf);
}

export type ListOptions = { recursive?: boolean; region?: string };

export async function listPath(
  zone: string,
  path: string,
  opts: ListOptions = {},
): Promise<Array<{ path: string; size: number; isDirectory: boolean; checksum?: string }>> {
  const r = await resolveRegion(zone, opts.region);
  const client = createStorageClient({ resolveCredential: (s) => resolveCredential(s) });
  if (opts.recursive) {
    const items = await listRecursive(client, zone, r, path);
    return items.map((i) => ({ path: i.path, size: i.length, isDirectory: false, ...(i.checksum ? { checksum: i.checksum } : {}) }));
  }
  const entries = await client.listDir(zone, r, path);
  return entries.map((e) => ({
    path: (e.ObjectName ?? '').toString(),
    size: e.Length,
    isDirectory: e.IsDirectory,
    ...(e.Checksum ? { checksum: e.Checksum } : {}),
  }));
}

export async function deletePath(zone: string, path: string, opts: { recursive?: boolean; region?: string } = {}): Promise<number> {
  const r = await resolveRegion(zone, opts.region);
  const client = createStorageClient({ resolveCredential: (s) => resolveCredential(s) });
  if (!opts.recursive) {
    await client.deleteFile(zone, r, path);
    return 1;
  }
  const items = await listRecursive(client, zone, r, path);
  let count = 0;
  for (const i of items) {
    await client.deleteFile(zone, r, i.path);
    count++;
  }
  return count;
}
