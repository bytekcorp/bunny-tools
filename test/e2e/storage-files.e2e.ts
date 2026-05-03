import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bunnyCli, bunnyCliOk } from './helpers/bunny-cli.js';
import { register, cleanupAll } from './helpers/cleanup-registry.js';
import { extractIdNumeric, extractPassword } from './helpers/parse-output.js';
import { uniqueId } from './helpers/prefix.js';
import { E2E_ENABLED } from './helpers/env-guard.js';

describe.skipIf(!E2E_ENABLED)('e2e: storage files (Bug #1 + #2 regression)', () => {
  let zoneId = 0;
  let zoneName = '';
  let storagePassword = '';
  let scratch = '';
  const env = (): Record<string, string> => ({ BUNNY_STORAGE_PASSWORD: storagePassword });

  beforeAll(async () => {
    zoneName = uniqueId('files');
    const created = await bunnyCliOk(['storagezone', 'create', zoneName]);
    zoneId = extractIdNumeric(created);
    register('storagezone', zoneId, zoneName);

    const detail = await bunnyCliOk(['storagezone', 'get', String(zoneId)]);
    storagePassword = extractPassword(detail.stdout);

    // Bunny needs a few seconds to propagate the new zone's password into
    // the storage data plane (`storage.bunnycdn.com`). Without this the
    // first upload comes back 401. Empirically ~5s suffices.
    await new Promise((r) => setTimeout(r, 6000));

    scratch = await mkdtemp(join(tmpdir(), 'bt-e2e-files-'));
    await mkdir(join(scratch, 'sub'), { recursive: true });
    await writeFile(join(scratch, 'index.html'), '<html>hi</html>');
    await writeFile(join(scratch, 'style.css'), 'body{color:red}');
    await writeFile(join(scratch, 'sub/app.js'), 'console.log(1)');
  }, 60000);

  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
    await cleanupAll();
  });

  it('upload + list / + download (byte-identical) + delete', async () => {
    await bunnyCliOk(
      ['storage', 'upload', join(scratch, 'index.html'), '/index.html', `--zone=${zoneName}`],
      { env: env() },
    );

    const list = await bunnyCliOk(['storage', 'list', '/', `--zone=${zoneName}`], { env: env() });
    expect(list.stdout).toMatch(/index\.html/);

    const downloadPath = join(scratch, 'index.dl.html');
    await bunnyCliOk(
      ['storage', 'download', '/index.html', downloadPath, `--zone=${zoneName}`],
      { env: env() },
    );
    const original = await readFile(join(scratch, 'index.html'));
    const downloaded = await readFile(downloadPath);
    expect(downloaded.equals(original)).toBe(true);

    await bunnyCliOk(['storage', 'delete', '/index.html', `--zone=${zoneName}`, '--yes'], {
      env: env(),
    });
  });

  it('bare `storage list` (no path) defaults to / (Bug #2 regression)', async () => {
    // Pre-populate so list has something to show.
    await bunnyCliOk(
      ['storage', 'upload', join(scratch, 'style.css'), '/style.css', `--zone=${zoneName}`],
      { env: env() },
    );

    const r = await bunnyCli(['storage', 'list', `--zone=${zoneName}`], { env: env() });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/style\.css/);
  });

  it('subdir listing returns entries (Bug #1 regression)', async () => {
    await bunnyCliOk(
      ['storage', 'upload', join(scratch, 'sub/app.js'), '/sub/app.js', `--zone=${zoneName}`],
      { env: env() },
    );

    const noSlash = await bunnyCliOk(['storage', 'list', '/sub', `--zone=${zoneName}`], {
      env: env(),
    });
    expect(noSlash.stdout).toMatch(/app\.js/);

    const trailing = await bunnyCliOk(['storage', 'list', '/sub/', `--zone=${zoneName}`], {
      env: env(),
    });
    expect(trailing.stdout).toMatch(/app\.js/);
  });

  it('list / --recursive walks subdirs (Bug #1 regression)', async () => {
    const r = await bunnyCliOk(['storage', 'list', '/', `--zone=${zoneName}`, '--recursive'], {
      env: env(),
    });
    expect(r.stdout).toMatch(/style\.css/);
    expect(r.stdout).toMatch(/sub\/app\.js/);
  });

  it('storage sync uploads a directory tree', async () => {
    // Drop a fresh dir that doesn't overlap prior uploads.
    const syncDir = join(scratch, 'sync');
    await mkdir(syncDir, { recursive: true });
    await writeFile(join(syncDir, 'a.txt'), 'a');
    await writeFile(join(syncDir, 'b.txt'), 'b');

    const r = await bunnyCliOk(['storage', 'sync', syncDir, `--zone=${zoneName}`], {
      env: env(),
    });
    expect(r.stderr + r.stdout).toMatch(/Synced/);
  });

  it('delete /<subdir> --recursive cleans subtree', async () => {
    const r = await bunnyCli(
      ['storage', 'delete', '/sub', '--recursive', `--zone=${zoneName}`, '--yes'],
      { env: env() },
    );
    expect(r.exitCode).toBe(0);
    const after = await bunnyCliOk(['storage', 'list', '/', `--zone=${zoneName}`, '--recursive'], {
      env: env(),
    });
    expect(after.stdout).not.toMatch(/sub\/app\.js/);
  });

  it('refuses to delete the zone root', async () => {
    const r = await bunnyCli(
      ['storage', 'delete', '/', '--recursive', `--zone=${zoneName}`, '--yes'],
      { env: env() },
    );
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr + r.stdout).toMatch(/zone root|storagezone delete/i);
  });
});
