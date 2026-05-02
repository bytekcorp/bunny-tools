import type { ParsedInvocation } from '../../manifest/types.js';
import { listZones } from '../../core/dns.js';
import { renderTable } from '../../ui/table.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const flags = inv.flags as { json?: boolean };
  const zones = await listZones();
  if (flags.json) {
    process.stdout.write(JSON.stringify(zones, null, 2) + '\n');
    return 0;
  }
  if (zones.length === 0) {
    process.stdout.write('(no DNS zones)\n');
    return 0;
  }
  process.stdout.write(renderTable(zones.map((z) => ({ id: z.Id, domain: z.Domain }))) + '\n');
  return 0;
}
