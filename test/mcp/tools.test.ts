import { describe, expect, it } from 'vitest';
import { TOOLS } from '../../src/mcp/tools.js';

describe('MCP tools', () => {
  it('exposes ~12 high-level tools + run escape hatch', () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toContain('bunny.deploy');
    expect(names).toContain('bunny.purge');
    expect(names).toContain('bunny.storage_list');
    expect(names).toContain('bunny.storage_upload');
    expect(names).toContain('bunny.storage_delete');
    expect(names).toContain('bunny.zones_list');
    expect(names).toContain('bunny.zone_get');
    expect(names).toContain('bunny.zone_create');
    expect(names).toContain('bunny.zone_delete');
    expect(names).toContain('bunny.dns_records');
    expect(names).toContain('bunny.dns_record_set');
    expect(names).toContain('bunny.dns_record_delete');
    expect(names).toContain('bunny.manifest');
    expect(names).toContain('bunny.init');
    expect(names).toContain('bunny.run');
  });

  it('all tool names are unique', () => {
    const seen = new Set<string>();
    for (const t of TOOLS) {
      expect(seen.has(t.name), `duplicate: ${t.name}`).toBe(false);
      seen.add(t.name);
    }
  });

  it('hard-cap: ≤ 20 tools (~14 high-level + 4 hostname + init + escape hatch + buffer)', () => {
    expect(TOOLS.length).toBeLessThanOrEqual(20);
  });

  it('every tool has a non-empty description', () => {
    for (const t of TOOLS) {
      expect(t.description, `${t.name} missing description`).toBeTruthy();
      expect(t.description.length).toBeGreaterThan(20);
    }
  });

  it('manifest tool runs and returns a registry shape', async () => {
    const tool = TOOLS.find((t) => t.name === 'bunny.manifest')!;
    const result = (await tool.run({})) as { binary: string; commands: unknown[] };
    expect(result.binary).toBe('bunny');
    expect(Array.isArray(result.commands)).toBe(true);
  });

  it('input validation rejects malformed args (storage_upload requires zone)', async () => {
    const tool = TOOLS.find((t) => t.name === 'bunny.storage_upload')!;
    await expect(tool.run({ local: 'a', remote: 'b' })).rejects.toThrow();
  });

  it('bunny.run refuses to spawn `mcp` (avoid recursion)', async () => {
    const tool = TOOLS.find((t) => t.name === 'bunny.run')!;
    await expect(tool.run({ args: ['mcp'] })).rejects.toThrowError(/Refusing/);
  });
});
