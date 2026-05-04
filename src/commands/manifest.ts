// `bunny manifest` - emits the canonical command registry as JSON.
// AI agents and external tooling read this to discover the CLI surface.

import { registry } from '../manifest/registry.js';
import { renderRegistryHelpJson } from '../manifest/render-help.js';
import type { ParsedInvocation } from '../manifest/types.js';

export async function run(invocation: ParsedInvocation): Promise<number> {
  const flags = invocation.flags as { pretty?: boolean; names?: boolean };
  // rc.10 (M5): --names emits one command name per line - useful for shell
  // completion or quick inspection without the JSON wall.
  if (flags.names) {
    const active = registry.commands.filter((c) => c.status === 'active').map((c) => c.name);
    for (const name of active) process.stdout.write(`${name}\n`);
    return 0;
  }
  const data = renderRegistryHelpJson(registry);
  process.stdout.write(JSON.stringify(data, null, flags.pretty ? 2 : 0) + '\n');
  return 0;
}
