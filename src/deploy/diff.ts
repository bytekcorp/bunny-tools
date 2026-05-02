// Pure diff: classify each local file as `new | changed | unchanged | orphan`
// using local SHA256 (computed only when state cache misses) + remote size/checksum.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { WalkedFile } from './walk.js';
import type { StateFile } from './state.js';

export type RemoteEntry = {
  path: string;
  length: number;
  checksum?: string;
};

export type DiffEntry = {
  path: string;
  absPath?: string;
  size?: number;
  sha256: string;
  classification: 'new' | 'changed' | 'unchanged' | 'orphan';
};

export type DiffResult = {
  byClass: Record<DiffEntry['classification'], DiffEntry[]>;
  newState: StateFile;
};

export async function hashFile(absPath: string): Promise<string> {
  const buf = await readFile(absPath);
  return createHash('sha256').update(buf).digest('hex');
}

export async function diffFiles(opts: {
  zone: string;
  local: WalkedFile[];
  remote: RemoteEntry[];
  cachedState: StateFile | null;
}): Promise<DiffResult> {
  const cache = opts.cachedState?.files ?? {};
  const remoteByPath = new Map(opts.remote.map((r) => [r.path, r]));
  const localPaths = new Set(opts.local.map((f) => f.path));

  const newFiles: DiffEntry[] = [];
  const changed: DiffEntry[] = [];
  const unchanged: DiffEntry[] = [];
  const newStateFiles: StateFile['files'] = {};

  for (const file of opts.local) {
    const cached = cache[file.path];
    let sha: string;
    if (cached && cached.size === file.size && cached.mtimeMs === file.mtimeMs) {
      // Trust the cache: same size + mtime = same content (within reason).
      sha = cached.sha256;
    } else {
      sha = await hashFile(file.absPath);
    }
    newStateFiles[file.path] = { sha256: sha, size: file.size, mtimeMs: file.mtimeMs };

    const remote = remoteByPath.get(file.path);
    const entry: DiffEntry = {
      path: file.path,
      absPath: file.absPath,
      size: file.size,
      sha256: sha,
      classification: 'new',
    };
    if (!remote) {
      newFiles.push(entry);
    } else if (
      // Prefer checksum match if remote provides it.
      (remote.checksum && remote.checksum.toLowerCase() === sha.toLowerCase()) ||
      (!remote.checksum && remote.length === file.size)
    ) {
      entry.classification = 'unchanged';
      unchanged.push(entry);
    } else {
      entry.classification = 'changed';
      changed.push(entry);
    }
  }

  const orphans: DiffEntry[] = opts.remote
    .filter((r) => !localPaths.has(r.path))
    .map((r) => ({
      path: r.path,
      sha256: r.checksum ?? '',
      classification: 'orphan' as const,
    }));

  return {
    byClass: { new: newFiles, changed, unchanged, orphan: orphans },
    newState: { v: 1, zone: opts.zone, files: newStateFiles },
  };
}
