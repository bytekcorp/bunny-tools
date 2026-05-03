import { describe, expect, it } from 'vitest';
import { bunnyCli, bunnyCliOk } from './helpers/bunny-cli.js';
import { E2E_ENABLED } from './helpers/env-guard.js';

describe.skipIf(!E2E_ENABLED)('e2e: account read-only smoke', () => {
  it('bunny whoami exits 0 and reports stored credentials', async () => {
    const r = await bunnyCliOk(['whoami']);
    // whoami renders a table to stdout describing scopes + reachable counts.
    expect(r.stdout).toMatch(/scope/i);
    expect(r.stdout).toMatch(/account/i);
  });

  it('bunny manifest --names emits at least 40 active commands', async () => {
    const r = await bunnyCliOk(['manifest', '--names']);
    const names = r.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    expect(names.length).toBeGreaterThanOrEqual(40);
    // Sanity: a few core commands must appear so a rendering regression
    // (e.g. names mode dropping output) gets caught.
    expect(names).toContain('deploy');
    expect(names).toContain('storagezone list');
    expect(names).toContain('pullzone list');
    expect(names).toContain('manifest');
  });

  it('bunny storagezone list exits 0 and renders the expected columns', async () => {
    const r = await bunnyCli(['storagezone', 'list']);
    expect(r.exitCode).toBe(0);
    // Drift smoke: the table renderer derives column names from the API
    // response shape. If Bunny renames a field, the header row changes.
    // Asserting on header text catches that without coupling to specific
    // user data.
    expect(r.stdout).toMatch(/\bid\b/);
    expect(r.stdout).toMatch(/\bname\b/);
    expect(r.stdout).toMatch(/\bregion\b/);
  });
});
