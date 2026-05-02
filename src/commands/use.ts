// `bunny use <alias>` — switch active alias from .bunnyrc.

import type { ParsedInvocation } from '../manifest/types.js';
import { listAliases, setActiveAlias } from '../core/aliases.js';
import { renderTable } from '../ui/table.js';
import { createProgress } from '../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { alias?: string };
  const flags = inv.flags as { list?: boolean; json?: boolean };

  if (flags.list || !args.alias) {
    const { active, aliases } = await listAliases();
    if (flags.json) {
      process.stdout.write(JSON.stringify({ active, aliases }, null, 2) + '\n');
      return 0;
    }
    if (aliases.length === 0) {
      process.stdout.write('No aliases configured. Run `bunny init` to create one.\n');
      return 0;
    }
    const rows = aliases.map((a) => ({
      active: a.name === active ? '*' : ' ',
      name: a.name,
      storageZone: a.storageZone,
      region: a.region ?? '(auto)',
      pullZones: a.pullZones.join(',') || '-',
    }));
    process.stdout.write(renderTable(rows) + '\n');
    return 0;
  }

  await setActiveAlias(args.alias);
  progress.succeed(`Active alias → ${args.alias}.`);
  return 0;
}
