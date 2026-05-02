import type { ParsedInvocation } from '../../manifest/types.js';
import { listStorageZones } from '../../core/zones.js';
import { renderTable } from '../../ui/table.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const flags = inv.flags as { json?: boolean };
  const zones = await listStorageZones();
  if (flags.json) {
    process.stdout.write(JSON.stringify(zones, null, 2) + '\n');
    return 0;
  }
  if (zones.length === 0) {
    process.stdout.write('(no storage zones)\n');
    return 0;
  }
  process.stdout.write(
    renderTable(
      zones.map((z) => ({
        id: z.Id,
        name: z.Name,
        region: z.Region,
        files: z.FilesStored,
        bytes: z.StorageUsed,
        replication: z.ReplicationRegions.join(',') || '-',
      })),
    ) + '\n',
  );
  return 0;
}
