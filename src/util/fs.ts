import { mkdir, readFile, rename, writeFile, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';

// Atomic-ish write: write to <path>.tmp then rename. Survives crashes.
export async function atomicWriteJson(
  path: string,
  data: unknown,
  opts: { mode?: number } = {},
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  const body = JSON.stringify(data, null, 2);
  await writeFile(tmp, body, 'utf8');
  if (opts.mode !== undefined) {
    await chmod(tmp, opts.mode);
  }
  await rename(tmp, path);
}

export async function readJsonOrNull<T>(path: string): Promise<T | null> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    throw err;
  }
  // Treat parse errors as "no usable file" - caller can decide whether to
  // overwrite or surface a separate validation error.
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}
