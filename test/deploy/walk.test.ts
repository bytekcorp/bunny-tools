import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walkPublicDir } from '../../src/deploy/walk.js';

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'walk-test-'));
  await mkdir(join(dir, 'sub'), { recursive: true });
  await writeFile(join(dir, 'index.html'), '<html></html>');
  await writeFile(join(dir, 'sub', 'app.js'), 'console.log(1)');
  await writeFile(join(dir, 'sub', 'private.tmp'), 'skip');
  await writeFile(join(dir, '.DS_Store'), 'mac junk');
  return dir;
}

describe('walkPublicDir', () => {
  it('finds all files including dotfiles', async () => {
    const dir = await fixture();
    try {
      const files = await walkPublicDir({ publicDir: dir });
      const names = files.map((f) => f.path).sort();
      expect(names).toContain('index.html');
      expect(names).toContain('sub/app.js');
      expect(names).toContain('.DS_Store');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('honors gitignore-style patterns', async () => {
    const dir = await fixture();
    try {
      const files = await walkPublicDir({
        publicDir: dir,
        ignorePatterns: ['**/.*', '**/*.tmp'],
      });
      const names = files.map((f) => f.path);
      expect(names).not.toContain('.DS_Store');
      expect(names).not.toContain('sub/private.tmp');
      expect(names).toContain('index.html');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('warns when a directory exceeds perDirCap', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'walk-cap-'));
    try {
      for (let i = 0; i < 5; i++) await writeFile(join(dir, `f${i}.txt`), 'x');
      const warnings: string[] = [];
      await walkPublicDir({
        publicDir: dir,
        perDirCap: 3,
        onWarn: (m) => warnings.push(m),
      });
      expect(warnings.some((w) => w.includes('5 files'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
