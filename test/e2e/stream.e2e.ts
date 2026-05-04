import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bunnyCli, bunnyCliOk } from './helpers/bunny-cli.js';
import { register, cleanupAll } from './helpers/cleanup-registry.js';
import { extractIdNumeric, extractApiKey } from './helpers/parse-output.js';
import { uniqueId } from './helpers/prefix.js';
import { E2E_ENABLED } from './helpers/env-guard.js';

const __filename = fileURLToPath(import.meta.url);
const FIXTURE = resolve(dirname(__filename), 'fixtures/tiny-video.mp4');

describe.skipIf(!E2E_ENABLED)('e2e: Stream library + video', () => {
  let libId = 0;
  let libKey = '';
  const env = (): Record<string, string> => ({ BUNNY_STREAM_KEY: libKey });

  beforeAll(async () => {
    const name = uniqueId('lib');
    const created = await bunnyCliOk(['stream', 'library', 'create', name]);
    libId = extractIdNumeric(created);
    register('stream-library', libId, name);

    // The library's per-library API key isn't surfaced by the create
    // command's render. Pull it via direct GET against the videolibrary API
    // — we only need it to authenticate video uploads downstream. This is
    // the same pattern users follow today.
    const detail = await fetch(`https://api.bunny.net/videolibrary/${libId}`, {
      headers: { AccessKey: process.env['BUNNY_API_KEY']! },
    });
    libKey = extractApiKey(await detail.text());

    // Bunny needs a few seconds to propagate a freshly-created library's
    // API key into the video API. Without this, the first POST to
    // /library/{id}/videos comes back 401. Empirically ~5s suffices.
    await new Promise((r) => setTimeout(r, 6000));
  }, 60000);

  afterAll(async () => {
    await cleanupAll();
  });

  it('library list contains the new library', async () => {
    const list = await bunnyCliOk(['stream', 'library', 'list']);
    expect(list.stdout).toMatch(new RegExp(String(libId)));
  });

  it('video upload (positional <library> <file>) + list + delete', async () => {
    const uploaded = await bunnyCliOk(
      ['stream', 'video', 'upload', String(libId), FIXTURE, '--title=bt-e2e-video'],
      { env: env() },
    );
    const guidMatch = (uploaded.stderr + uploaded.stdout).match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );
    expect(guidMatch).not.toBeNull();
    const guid = guidMatch![0];

    const list = await bunnyCliOk(['stream', 'video', 'list', String(libId)], { env: env() });
    expect(list.stdout).toMatch(new RegExp(guid));

    await bunnyCliOk(['stream', 'video', 'delete', String(libId), guid, '--yes'], {
      env: env(),
    });
  });

  it('library delete (Bug #8 regression — command exists)', async () => {
    // Sanity check: the registered command must exist. Cleanup runs in
    // afterAll via the registry; this test asserts the command itself
    // routes to the implementation rather than producing "unknown command".
    const help = await bunnyCli(['stream', 'library', 'delete', '--help']);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toMatch(/Delete a Stream/i);
  });
});
