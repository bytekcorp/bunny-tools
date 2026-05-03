import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bunnyCliOk } from './helpers/bunny-cli.js';
import { register, cleanupAll } from './helpers/cleanup-registry.js';
import { spawnMcpClient, unwrapJson, type McpHandle } from './helpers/mcp-client.js';
import { extractIdNumeric, extractPassword } from './helpers/parse-output.js';
import { suitePrefix, uniqueId } from './helpers/prefix.js';
import { E2E_ENABLED } from './helpers/env-guard.js';

// e2e for the MCP server end of bunny-tools. Spawns `bunny mcp`, connects
// the SDK Client over stdio, and exercises every active MCP tool against
// the real account. Catches drift the CLI e2e suite can't see — schema
// validation, output serialization, and error envelopes are wrapper-layer
// concerns that don't surface through CLI tests.
//
// Storage tests require a pre-fetched zone password baked into the MCP
// server's env (the resolver chain reads BUNNY_STORAGE_PASSWORD at server
// start, not per-call). beforeAll creates a throwaway zone via the CLI,
// extracts its password, then spawns the MCP server with the password in
// scope.

describe.skipIf(!E2E_ENABLED)('e2e: MCP server', () => {
  let mcp: McpHandle;
  let storageZoneId = 0;
  let storageZoneName = '';
  let storagePassword = '';
  let dnsZoneId = 0;
  const dnsDomain = `${suitePrefix()}-mcp.invalid`;
  // Reuses chien.do's first pull zone for the purge test; only purge
  // accepts a fictional URL without setup. Other write ops use throwaway
  // resources we create + delete here.
  const KNOWN_PURGE_URL = 'https://chien.b-cdn.net/no-such-file.js';

  beforeAll(async () => {
    // 1. Create a throwaway storage zone via the CLI so we can extract its
    // password and pass it to the MCP server's env. Cleanup-registry tracks
    // both this zone and the DNS zone we'll create below.
    storageZoneName = uniqueId('mcp-zone');
    const created = await bunnyCliOk(['storagezone', 'create', storageZoneName]);
    storageZoneId = extractIdNumeric(created);
    register('storagezone', storageZoneId, storageZoneName);

    const detail = await bunnyCliOk(['storagezone', 'get', String(storageZoneId)]);
    storagePassword = extractPassword(detail.stdout);

    // 2. Same trick for DNS — pre-create a `.invalid` zone we can mutate
    // safely. Skipping DNS-zone create via MCP because our CLI suite
    // already covers that path; this file focuses on the MCP wrapper layer.
    const dnsCreated = await bunnyCliOk(['dns', 'create', dnsDomain]);
    dnsZoneId = extractIdNumeric(dnsCreated);
    register('dns', dnsZoneId, dnsDomain);

    // 3. Bunny propagates storage-zone passwords into the data plane on a
    // ~5-second delay. Without this wait, the first MCP storage_upload
    // returns 401 even though the password is correct.
    await new Promise((r) => setTimeout(r, 6000));

    // 4. Spawn the MCP server with the storage password in scope.
    mcp = await spawnMcpClient({
      [`BUNNY_STORAGE_PASSWORD_${storageZoneName.replaceAll('-', '_').toUpperCase()}`]: storagePassword,
    });
  }, 90000);

  afterAll(async () => {
    if (mcp) await mcp.close();
    await cleanupAll();
  });

  // -----------------------------------------------------------------------
  // Handshake — proves the MCP server registers all expected tools.
  // -----------------------------------------------------------------------

  it('listTools returns ≥14 active tools (rc.22)', async () => {
    const result = await mcp.client.listTools();
    expect(result.tools.length).toBeGreaterThanOrEqual(14);
    const names = result.tools.map((t) => t.name);
    // Spot-check a handful — full list locked down in unit tests.
    expect(names).toContain('bunny.manifest');
    expect(names).toContain('bunny.zones_list');
    expect(names).toContain('bunny.zone_get');
    expect(names).toContain('bunny.deploy');
    expect(names).toContain('bunny.purge');
  });

  // -----------------------------------------------------------------------
  // Read-only tools — pure introspection paths. Failures here mean
  // serialization regressions, not credential issues.
  // -----------------------------------------------------------------------

  it('bunny.run executes whoami end-to-end', async () => {
    const r = await mcp.client.callTool({
      name: 'bunny.run',
      arguments: { args: ['whoami'] },
    });
    const payload = unwrapJson<{ exitCode: number; stdout: string }>(
      r as { content?: Array<{ type: string; text?: string }> },
    );
    expect(payload.exitCode).toBe(0);
    expect(payload.stdout).toMatch(/account/i);
  });

  it('bunny.manifest returns the registry with ≥40 commands', async () => {
    const r = await mcp.client.callTool({ name: 'bunny.manifest', arguments: {} });
    const reg = unwrapJson<{ commands: Array<{ name: string }> }>(
      r as { content?: Array<{ type: string; text?: string }> },
    );
    expect(reg.commands.length).toBeGreaterThanOrEqual(40);
  });

  it('bunny.zones_list (storage) returns array including our test zone', async () => {
    const r = await mcp.client.callTool({
      name: 'bunny.zones_list',
      arguments: { type: 'storage' },
    });
    const zones = unwrapJson<Array<{ Id: number; Name: string }>>(
      r as { content?: Array<{ type: string; text?: string }> },
    );
    expect(Array.isArray(zones)).toBe(true);
    expect(zones.some((z) => z.Id === storageZoneId)).toBe(true);
  });

  it('bunny.zones_list (pull) returns array', async () => {
    const r = await mcp.client.callTool({
      name: 'bunny.zones_list',
      arguments: { type: 'pull' },
    });
    const zones = unwrapJson<Array<{ Id: number }>>(
      r as { content?: Array<{ type: string; text?: string }> },
    );
    expect(Array.isArray(zones)).toBe(true);
  });

  it('bunny.zone_get by numeric id returns Password field', async () => {
    const r = await mcp.client.callTool({
      name: 'bunny.zone_get',
      arguments: { type: 'storage', idOrName: storageZoneId },
    });
    const zone = unwrapJson<{ Id: number; Name: string; Password: string }>(
      r as { content?: Array<{ type: string; text?: string }> },
    );
    expect(zone.Id).toBe(storageZoneId);
    expect(zone.Password.length).toBeGreaterThan(10);
  });

  it('bunny.dns_records returns all zones when zoneId omitted', async () => {
    const r = await mcp.client.callTool({ name: 'bunny.dns_records', arguments: {} });
    const zones = unwrapJson<Array<{ Id: number; Records: unknown[] }>>(
      r as { content?: Array<{ type: string; text?: string }> },
    );
    expect(Array.isArray(zones)).toBe(true);
    expect(zones.some((z) => z.Id === dnsZoneId)).toBe(true);
  });

  it('bunny.dns_records returns just records when zoneId given', async () => {
    const r = await mcp.client.callTool({
      name: 'bunny.dns_records',
      arguments: { zoneId: dnsZoneId },
    });
    const records = unwrapJson<Array<{ Id: number }>>(
      r as { content?: Array<{ type: string; text?: string }> },
    );
    expect(Array.isArray(records)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Storage tools — exercise the storage:<zone> credential resolver.
  // -----------------------------------------------------------------------

  it('bunny.storage_list, upload, delete round-trip via MCP env', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'bt-mcp-storage-'));
    const localPath = join(tmp, 'mcp-test.txt');
    await writeFile(localPath, 'mcp-smoke');

    try {
      // Upload
      const up = await mcp.client.callTool({
        name: 'bunny.storage_upload',
        arguments: { zone: storageZoneName, local: localPath, remote: '/mcp-test.txt' },
      });
      // Surface the full response on error so failures are debuggable —
      // storage env propagation is the most likely failure mode here.
      if ((up as { isError?: boolean }).isError) {
        const text = (up as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? '';
        throw new Error(`storage_upload returned isError: ${text}`);
      }
      const upRes = unwrapJson<{ ok: boolean }>(
        up as { content?: Array<{ type: string; text?: string }> },
      );
      expect(upRes.ok).toBe(true);

      // List — confirm the file appears
      const list = await mcp.client.callTool({
        name: 'bunny.storage_list',
        arguments: { zone: storageZoneName, path: '/' },
      });
      const entries = unwrapJson<Array<{ path?: string; size?: number; isDirectory?: boolean }>>(
        list as { content?: Array<{ type: string; text?: string }> },
      );
      expect(Array.isArray(entries)).toBe(true);
      expect(entries.some((e) => (e.path ?? '').includes('mcp-test.txt'))).toBe(true);

      // Delete — tool returns `{deleted: <count>}` not `{ok}`
      const del = await mcp.client.callTool({
        name: 'bunny.storage_delete',
        arguments: { zone: storageZoneName, path: '/mcp-test.txt' },
      });
      const delRes = unwrapJson<{ deleted: number }>(
        del as { content?: Array<{ type: string; text?: string }> },
      );
      expect(delRes.deleted).toBeGreaterThanOrEqual(1);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  // -----------------------------------------------------------------------
  // Write tools with cleanup — round-trip create/delete through MCP.
  // -----------------------------------------------------------------------

  it('bunny.zone_create + bunny.zone_delete round-trip', async () => {
    const name = uniqueId('mcp-zc');
    const created = await mcp.client.callTool({
      name: 'bunny.zone_create',
      arguments: { type: 'storage', name },
    });
    const zone = unwrapJson<{ Id: number; Name: string }>(
      created as { content?: Array<{ type: string; text?: string }> },
    );
    expect(zone.Name).toBe(name);
    register('storagezone', zone.Id, name);

    const deleted = await mcp.client.callTool({
      name: 'bunny.zone_delete',
      arguments: { type: 'storage', id: zone.Id },
    });
    const delRes = unwrapJson<{ ok: boolean }>(
      deleted as { content?: Array<{ type: string; text?: string }> },
    );
    expect(delRes.ok).toBe(true);
  });

  it('bunny.dns_record_set + bunny.dns_record_delete round-trip', async () => {
    const set = await mcp.client.callTool({
      name: 'bunny.dns_record_set',
      arguments: {
        zoneId: dnsZoneId,
        type: 'TXT',
        name: 'mcp-e2e',
        value: 'smoke',
        ttl: 300,
      },
    });
    const record = unwrapJson<{ Id: number; Type: number; Value: string }>(
      set as { content?: Array<{ type: string; text?: string }> },
    );
    expect(record.Value).toBe('smoke');

    const deleted = await mcp.client.callTool({
      name: 'bunny.dns_record_delete',
      arguments: { zoneId: dnsZoneId, recordId: record.Id },
    });
    const delRes = unwrapJson<{ ok: boolean }>(
      deleted as { content?: Array<{ type: string; text?: string }> },
    );
    expect(delRes.ok).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Purge — write op that returns no payload beyond an ok envelope. Bunny
  // accepts purge requests for any URL on a zone they own, even fictional
  // paths; no setup needed beyond a known CDN hostname.
  // -----------------------------------------------------------------------

  it('bunny.purge accepts a CDN URL', async () => {
    const r = await mcp.client.callTool({
      name: 'bunny.purge',
      arguments: { target: KNOWN_PURGE_URL },
    });
    const res = unwrapJson<{ ok: number; failed: unknown[] }>(
      r as { content?: Array<{ type: string; text?: string }> },
    );
    expect(res.ok).toBe(1);
    expect(res.failed).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Negative input — proves the zod schema validates and the MCP error
  // envelope is well-formed (not a crash).
  // -----------------------------------------------------------------------

  it('bunny.zone_get returns isError envelope on missing required argument', async () => {
    // MCP encodes tool errors as `{isError: true, content: [{type:'text', text:'...'}]}`
    // rather than throwing. Test the protocol-level shape, not exception flow.
    const result = await mcp.client.callTool({
      name: 'bunny.zone_get',
      arguments: { type: 'storage' },
    });
    expect((result as { isError?: boolean }).isError).toBe(true);
    const text = (result as { content?: Array<{ type: string; text?: string }> }).content?.[0]
      ?.text ?? '';
    expect(text).toMatch(/idOrName|required|invalid/i);
  });

  // -----------------------------------------------------------------------
  // bunny.deploy and bunny.init are skipped here — deploy needs a full
  // bunny.json + tmpdir setup that overlaps with deploy.e2e.ts, and init
  // is interactive in spirit (the non-interactive form is exercised by
  // unit tests in test/core/init.test.ts). Re-add if the wrapper layer
  // ever gets new logic worth covering.
  // -----------------------------------------------------------------------
  it.skip('bunny.deploy (covered indirectly by deploy.e2e.ts via CLI)', () => {});
  it.skip('bunny.init (interactive shape; non-interactive covered by unit)', () => {});
});

// `KNOWN_PURGE_URL` reserved for future purge variants.
void 0;
