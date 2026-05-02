// `bunny manifest` — emits the canonical command registry as JSON.
// AI agents and external tooling read this to discover the CLI surface.

import { registry } from '../manifest/registry.js';
import { renderRegistryHelpJson } from '../manifest/render-help.js';
import type { ParsedInvocation } from '../manifest/types.js';

export async function run(invocation: ParsedInvocation): Promise<number> {
  const pretty = invocation.flags.pretty === true;
  const data = renderRegistryHelpJson(registry);
  process.stdout.write(JSON.stringify(data, null, pretty ? 2 : 0) + '\n');
  return 0;
}
