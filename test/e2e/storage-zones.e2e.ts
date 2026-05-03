import { afterAll, describe, expect, it } from 'vitest';
import { bunnyCli, bunnyCliOk } from './helpers/bunny-cli.js';
import { register, cleanupAll } from './helpers/cleanup-registry.js';
import { extractIdNumeric as extractId } from './helpers/parse-output.js';
import { uniqueId } from './helpers/prefix.js';
import { E2E_ENABLED } from './helpers/env-guard.js';

describe.skipIf(!E2E_ENABLED)('e2e: storage-zone CRUD', () => {
  afterAll(async () => {
    await cleanupAll();
  });

  it('create + get-by-id + get-by-name + delete', async () => {
    const name = uniqueId('zone');
    const created = await bunnyCliOk(['storagezone', 'create', name]);
    const id = extractId(created);
    register('storagezone', id, name);

    // Get by id — must include Password field for downstream storage tests.
    const byId = await bunnyCliOk(['storagezone', 'get', String(id)]);
    expect(byId.stdout).toMatch(/"Password"/);
    expect(byId.stdout).toMatch(new RegExp(`"Name":\\s*"${name}"`));

    // Get by name — same shape.
    const byName = await bunnyCliOk(['storagezone', 'get', name]);
    expect(byName.stdout).toMatch(new RegExp(`"Id":\\s*${id}`));

    await bunnyCliOk(['storagezone', 'delete', String(id), '--yes']);

    // After delete, get-by-id should fail (404).
    const gone = await bunnyCli(['storagezone', 'get', String(id)]);
    expect(gone.exitCode).not.toBe(0);
  });

  it('uppercases lowercase --region (Bug #9 regression)', async () => {
    const name = uniqueId('zone-ny');
    const created = await bunnyCliOk(['storagezone', 'create', name, '--region=ny']);
    const id = extractId(created);
    register('storagezone', id, name);
    expect(`${created.stdout}${created.stderr}`).toMatch(/region=NY/);

    const detail = await bunnyCliOk(['storagezone', 'get', String(id)]);
    expect(detail.stdout).toMatch(/"Region":\s*"NY"/);

    await bunnyCliOk(['storagezone', 'delete', String(id), '--yes']);
  });

  it('update with raw --body succeeds', async () => {
    const name = uniqueId('zone-up');
    const created = await bunnyCliOk(['storagezone', 'create', name]);
    const id = extractId(created);
    register('storagezone', id, name);

    const r = await bunnyCli([
      'storagezone',
      'update',
      String(id),
      '--body={"ReplicationRegions":[]}',
    ]);
    expect(r.exitCode).toBe(0);

    await bunnyCliOk(['storagezone', 'delete', String(id), '--yes']);
  });

  it('list returns the zone we created', async () => {
    const name = uniqueId('zone-list');
    const created = await bunnyCliOk(['storagezone', 'create', name]);
    const id = extractId(created);
    register('storagezone', id, name);

    const list = await bunnyCliOk(['storagezone', 'list']);
    expect(list.stdout).toMatch(new RegExp(name));

    await bunnyCliOk(['storagezone', 'delete', String(id), '--yes']);
  });
});
