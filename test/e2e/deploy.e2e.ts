import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bunnyCliOk } from './helpers/bunny-cli.js';
import { register, cleanupAll } from './helpers/cleanup-registry.js';
import { extractIdNumeric, extractPassword } from './helpers/parse-output.js';
import { uniqueId } from './helpers/prefix.js';
import { E2E_ENABLED } from './helpers/env-guard.js';

describe.skipIf(!E2E_ENABLED)('e2e: full deploy pipeline', () => {
  let zoneId = 0;
  let zoneName = '';
  let storagePassword = '';
  let publicDir = '';

  const env = (): Record<string, string> => ({ BUNNY_STORAGE_PASSWORD: storagePassword });

  beforeAll(async () => {
    zoneName = uniqueId('deploy');
    const created = await bunnyCliOk(['storagezone', 'create', zoneName]);
    zoneId = extractIdNumeric(created);
    register('storagezone', zoneId, zoneName);

    const detail = await bunnyCliOk(['storagezone', 'get', String(zoneId)]);
    storagePassword = extractPassword(detail.stdout);

    // Storage password takes ~5s to propagate after zone creation; first
    // upload otherwise returns 401.
    await new Promise((r) => setTimeout(r, 6000));

    publicDir = await mkdtemp(join(tmpdir(), 'bt-e2e-deploy-'));
    await mkdir(join(publicDir, 'sub'), { recursive: true });
    await writeFile(join(publicDir, 'index.html'), '<html>v1</html>');
    await writeFile(join(publicDir, 'style.css'), 'body{color:red}');
    await writeFile(join(publicDir, 'sub/app.js'), 'console.log(1)');
    await writeFile(
      join(publicDir, 'bunny.json'),
      JSON.stringify({
        deploy: {
          publicDir: '.',
          ignore: ['bunny.json', '.bunny-state.json'],
          storageZone: zoneName,
          concurrency: 4,
        },
      }),
    );
  }, 60000);

  afterAll(async () => {
    await rm(publicDir, { recursive: true, force: true });
    await cleanupAll();
  });

  it('--dry-run reports 3 new files without uploading', async () => {
    const r = await bunnyCliOk(['deploy', '--dry-run'], { env: env(), cwd: publicDir });
    expect(r.stderr + r.stdout).toMatch(/3 new/);
  });

  it('full deploy uploads all files (uses listRecursive — Bug #1 regression)', async () => {
    const r = await bunnyCliOk(['deploy'], { env: env(), cwd: publicDir });
    const merged = r.stderr + r.stdout;
    expect(merged).toMatch(/uploaded 3 files/);
    expect(merged).toMatch(/Deploy complete/);

    // Verify via recursive list — confirms listRecursive walks subdirs.
    const list = await bunnyCliOk(['storage', 'list', '/', `--zone=${zoneName}`, '--recursive'], {
      env: env(),
    });
    expect(list.stdout).toMatch(/index\.html/);
    expect(list.stdout).toMatch(/sub\/app\.js/);
  });

  it('re-deploy without changes hits state cache (3 unchanged)', async () => {
    const r = await bunnyCliOk(['deploy'], { env: env(), cwd: publicDir });
    expect(r.stderr + r.stdout).toMatch(/unchanged/);
  });

  it('modify a file then re-deploy detects exactly 1 change', async () => {
    await writeFile(join(publicDir, 'style.css'), 'body{color:GREEN}');
    const r = await bunnyCliOk(['deploy'], { env: env(), cwd: publicDir });
    const merged = r.stderr + r.stdout;
    expect(merged).toMatch(/1 changed/);
  });
});
