import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { diffFiles, hashFile } from '../../src/deploy/diff.js';
import type { WalkedFile } from '../../src/deploy/walk.js';

async function tmpFile(content: string): Promise<{ abs: string; size: number; mtimeMs: number }> {
  const dir = await mkdtemp(join(tmpdir(), 'diff-'));
  const abs = join(dir, 'f.txt');
  await writeFile(abs, content);
  return { abs, size: content.length, mtimeMs: Date.now() };
}

function sha(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

describe('diffFiles', () => {
  it('classifies new files', async () => {
    const f = await tmpFile('hello');
    const local: WalkedFile[] = [{ path: 'a.txt', absPath: f.abs, size: f.size, mtimeMs: f.mtimeMs }];
    const result = await diffFiles({ zone: 'z', local, remote: [], cachedState: null });
    expect(result.byClass.new).toHaveLength(1);
    expect(result.byClass.changed).toHaveLength(0);
    expect(result.byClass.unchanged).toHaveLength(0);
    await rm(f.abs);
  });

  it('classifies unchanged via checksum match', async () => {
    const content = 'hello';
    const f = await tmpFile(content);
    const local: WalkedFile[] = [{ path: 'a.txt', absPath: f.abs, size: f.size, mtimeMs: f.mtimeMs }];
    const result = await diffFiles({
      zone: 'z',
      local,
      remote: [{ path: 'a.txt', length: f.size, checksum: sha(content) }],
      cachedState: null,
    });
    expect(result.byClass.unchanged).toHaveLength(1);
    expect(result.byClass.changed).toHaveLength(0);
    await rm(f.abs);
  });

  it('classifies changed when sha differs', async () => {
    const f = await tmpFile('hello');
    const local: WalkedFile[] = [{ path: 'a.txt', absPath: f.abs, size: f.size, mtimeMs: f.mtimeMs }];
    const result = await diffFiles({
      zone: 'z',
      local,
      remote: [{ path: 'a.txt', length: f.size, checksum: sha('different') }],
      cachedState: null,
    });
    expect(result.byClass.changed).toHaveLength(1);
    await rm(f.abs);
  });

  it('classifies orphans (remote without local)', async () => {
    const result = await diffFiles({
      zone: 'z',
      local: [],
      remote: [{ path: 'orphan.txt', length: 5 }],
      cachedState: null,
    });
    expect(result.byClass.orphan).toHaveLength(1);
    expect(result.byClass.orphan[0]?.path).toBe('orphan.txt');
  });

  it('uses state cache to skip rehashing', async () => {
    const content = 'hello';
    const f = await tmpFile(content);
    const local: WalkedFile[] = [{ path: 'a.txt', absPath: f.abs, size: f.size, mtimeMs: f.mtimeMs }];
    const result = await diffFiles({
      zone: 'z',
      local,
      remote: [{ path: 'a.txt', length: f.size, checksum: sha(content) }],
      cachedState: {
        v: 1,
        zone: 'z',
        files: { 'a.txt': { sha256: sha(content), size: f.size, mtimeMs: f.mtimeMs } },
      },
    });
    expect(result.byClass.unchanged).toHaveLength(1);
    await rm(f.abs);
  });

  it('hashFile returns hex sha256', async () => {
    const f = await tmpFile('hello');
    expect(await hashFile(f.abs)).toBe(sha('hello'));
    await rm(f.abs);
  });
});
