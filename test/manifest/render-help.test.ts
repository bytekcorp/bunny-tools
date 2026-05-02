import { describe, expect, it } from 'vitest';
import {
  renderCommandHelpJson,
  renderCommandHelpText,
  renderRegistryHelpJson,
  summarizeRegistry,
} from '../../src/manifest/render-help.js';
import { findCommand, registry } from '../../src/manifest/registry.js';

describe('render-help', () => {
  it('text help includes binary + summary', () => {
    const cmd = findCommand('manifest')!;
    const text = renderCommandHelpText(cmd, registry.binary);
    expect(text).toContain(`bunny manifest`);
    expect(text).toContain(cmd.summary);
  });

  it('JSON help contains stable shape', () => {
    const cmd = findCommand('manifest')!;
    const json = renderCommandHelpJson(cmd);
    expect(json.name).toBe('manifest');
    expect(json.status).toBe('active');
    expect(Array.isArray(json.flags)).toBe(true);
    expect(json.mcp).toEqual({
      tool: 'bunny.manifest',
      description: expect.any(String),
    });
  });

  it('renderRegistryHelpJson lists every command', () => {
    const out = renderRegistryHelpJson(registry);
    expect(out.commands.length).toBe(registry.commands.length);
    expect(out.binary).toBe('bunny');
  });

  it('summarizeRegistry counts statuses + phases', () => {
    const s = summarizeRegistry(registry);
    expect(s.active + s.planned + s.deprecated).toBe(registry.commands.length);
    expect(Object.keys(s.byPhase).length).toBeGreaterThan(0);
  });
});
