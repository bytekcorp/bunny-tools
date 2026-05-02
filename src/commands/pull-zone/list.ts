import type { ParsedInvocation } from '../../manifest/types.js';
import { listPullZones } from '../../core/zones.js';
import { renderTable } from '../../ui/table.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const flags = inv.flags as { json?: boolean };
  const zones = await listPullZones();
  if (flags.json) {
    process.stdout.write(JSON.stringify(zones, null, 2) + '\n');
    return 0;
  }
  if (zones.length === 0) {
    process.stdout.write('(no pull zones)\n');
    return 0;
  }
  process.stdout.write(
    renderTable(
      zones.map((z) => ({
        id: z.Id,
        name: z.Name,
        origin: z.OriginUrl ?? '-',
        enabled: String(z.Enabled),
        hostnames: z.Hostnames.map((h) => h.Value).join(',') || '-',
      })),
    ) + '\n',
  );
  return 0;
}
