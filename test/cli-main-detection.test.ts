// Regression: when bunny-tools is installed via `npm install -g`, the binary
// at `<prefix>/bin/bunny` is a symlink to `<prefix>/lib/node_modules/bunny-tools/dist/cli.js`.
// rc.10–rc.14 used `import.meta.url === \`file://${process.argv[1]}\`` for main
// detection — that compared the symlink path to the resolved real path and
// always returned false, so the program never ran. Fixed in rc.15 by routing
// process.argv[1] through realpathSync before comparing.
//
// This test spawns the BUILT dist/cli.js (run `npm run build` first) through
// a temp symlink and asserts that --version prints. Without the realpath fix
// it would print nothing.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, symlinkSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = resolve(__dirname, '..');
const BUILT_CLI = join(PROJECT_ROOT, 'dist', 'cli.js');

function isBuilt(): boolean {
  try {
    return existsSync(BUILT_CLI) && statSync(BUILT_CLI).isFile();
  } catch {
    return false;
  }
}

describe('cli main detection (rc.15 regression)', () => {
  it.skipIf(!isBuilt())('runs through a symlinked binary path', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'bunny-cli-symlink-'));
    const link = join(tmp, 'bunny');
    symlinkSync(BUILT_CLI, link);
    try {
      const r = spawnSync('node', [link, '--version'], { encoding: 'utf8' });
      expect(r.status).toBe(0);
      // Version output goes to stdout via Commander when --version is used.
      // Without the fix this is empty.
      expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it.skipIf(!isBuilt())('runs through the direct (non-symlinked) path', () => {
    const r = spawnSync('node', [BUILT_CLI, '--version'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
