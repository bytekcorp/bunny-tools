import { describe, expect, it } from 'vitest';
import { findCommand, listMcpTools, registry } from '../../src/manifest/registry.js';

describe('registry', () => {
  it('has the right binary + cli name', () => {
    expect(registry.cliName).toBe('bunny-tools');
    expect(registry.binary).toBe('bunny');
    expect(registry.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('command names are unique', () => {
    const seen = new Set<string>();
    for (const c of registry.commands) {
      expect(seen.has(c.name), `duplicate command: ${c.name}`).toBe(false);
      seen.add(c.name);
    }
  });

  it('every command has a non-empty summary', () => {
    for (const c of registry.commands) {
      expect(c.summary, `${c.name} missing summary`).toBeTruthy();
    }
  });

  it('every active command declares a load() function', () => {
    for (const c of registry.commands) {
      if (c.status === 'active') {
        expect(c.load, `${c.name} active but no load()`).toBeDefined();
      }
    }
  });

  it('phase 1 + 2 active commands present', () => {
    const active = registry.commands.filter((c) => c.status === 'active').map((c) => c.name);
    expect(active).toContain('manifest');
    expect(active).toContain('init');
    expect(active).toContain('configure');
    expect(active).toContain('auth:set');
    expect(active).toContain('auth:list');
    expect(active).toContain('auth:clear');
    expect(active).toContain('use');
    expect(active).toContain('deploy');
    expect(active).toContain('purge');
  });

  it('listMcpTools returns commands that declare mcp', () => {
    const tools = listMcpTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(t.tool).toMatch(/^bunny\./);
      expect(t.name).toBeTruthy();
    }
  });

  it('findCommand looks up by name', () => {
    expect(findCommand('manifest')?.name).toBe('manifest');
    expect(findCommand('does-not-exist')).toBeUndefined();
  });

  it('mcp tool list is hard-capped (≤ 12 v0.1 surface)', () => {
    expect(listMcpTools().length).toBeLessThanOrEqual(12);
  });
});
