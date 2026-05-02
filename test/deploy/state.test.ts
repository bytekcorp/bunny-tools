import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyState, loadState, saveState } from '../../src/deploy/state.js';

describe('state file', () => {
  it('round-trips through save/load', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'state-'));
    try {
      const path = join(dir, '.bunny-state.json');
      const fresh = emptyState('my-zone');
      fresh.files['a.txt'] = { sha256: 'a'.repeat(64), size: 1, mtimeMs: 1 };
      await saveState(path, fresh);
      const loaded = await loadState(path);
      expect(loaded?.zone).toBe('my-zone');
      expect(loaded?.files['a.txt']?.sha256).toBe('a'.repeat(64));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns null for missing file', async () => {
    expect(await loadState('/nonexistent/path/state.json')).toBeNull();
  });

  it('treats malformed state as empty (no crash)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'state-bad-'));
    try {
      const path = join(dir, '.bunny-state.json');
      await writeFile(path, '{ invalid');
      const loaded = await loadState(path);
      expect(loaded).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('treats wrong-version state as empty', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'state-v-'));
    try {
      const path = join(dir, '.bunny-state.json');
      await writeFile(path, JSON.stringify({ v: 99, zone: 'z', files: {} }));
      const loaded = await loadState(path);
      expect(loaded).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
