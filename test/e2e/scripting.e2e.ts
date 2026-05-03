import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bunnyCli, bunnyCliOk } from './helpers/bunny-cli.js';
import { register, cleanupAll } from './helpers/cleanup-registry.js';
import { extractIdNumeric } from './helpers/parse-output.js';
import { uniqueId } from './helpers/prefix.js';
import { E2E_ENABLED } from './helpers/env-guard.js';

describe.skipIf(!E2E_ENABLED)('e2e: Edge Scripting (Bug #7 regression)', () => {
  let scratch = '';
  let scriptPath = '';

  beforeAll(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'bt-e2e-scripting-'));
    scriptPath = join(scratch, 's.js');
    await writeFile(
      scriptPath,
      "addEventListener('fetch', e => e.respondWith(new Response('v1')))\n",
    );
  });

  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
    await cleanupAll();
  });

  it('deploy create + list + update via --id (Bug #7) + delete', async () => {
    const name = uniqueId('script');
    const created = await bunnyCliOk(['scripting', 'deploy', name, `--file=${scriptPath}`]);
    const id = extractIdNumeric(created);
    register('scripting', id, name);

    const list = await bunnyCliOk(['scripting', 'list']);
    expect(list.stdout).toMatch(new RegExp(name));

    // Bug #7 regression: update mode used to crash because /code returns 204
    // and the client tried to read .Name from undefined. Must succeed AND
    // surface the script's name in the success message.
    await writeFile(
      scriptPath,
      "addEventListener('fetch', e => e.respondWith(new Response('v2')))\n",
    );
    const updated = await bunnyCliOk([
      'scripting',
      'deploy',
      name,
      `--file=${scriptPath}`,
      `--id=${id}`,
    ]);
    expect(updated.stderr + updated.stdout).toMatch(/Updated edge script/);
    expect(updated.stderr + updated.stdout).toMatch(new RegExp(name));

    await bunnyCliOk(['scripting', 'delete', String(id), '--yes']);

    const after = await bunnyCli(['scripting', 'list']);
    expect(after.stdout).not.toMatch(new RegExp(name));
  });
});
