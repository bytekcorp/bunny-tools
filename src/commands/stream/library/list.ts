import type { ParsedInvocation } from '../../../manifest/types.js';
import { listLibraries } from '../../../core/stream.js';
import { renderTable } from '../../../ui/table.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const flags = inv.flags as { json?: boolean };
  const libs = await listLibraries();
  if (flags.json) {
    process.stdout.write(JSON.stringify(libs, null, 2) + '\n');
    return 0;
  }
  if (libs.length === 0) {
    process.stdout.write('(no video libraries)\n');
    return 0;
  }
  process.stdout.write(
    renderTable(libs.map((l) => ({ id: l.Id, name: l.Name, storageZone: l.StorageZoneId ?? '-', pullZone: l.PullZoneId ?? '-' }))) + '\n',
  );
  return 0;
}
