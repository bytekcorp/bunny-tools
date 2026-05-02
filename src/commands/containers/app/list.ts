import type { ParsedInvocation } from '../../../manifest/types.js';
import { listApps } from '../../../core/containers.js';
import { renderTable } from '../../../ui/table.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const flags = inv.flags as { json?: boolean };
  const apps = await listApps();
  if (flags.json) {
    process.stdout.write(JSON.stringify(apps, null, 2) + '\n');
    return 0;
  }
  if (apps.length === 0) {
    process.stdout.write('(no container apps)\n');
    return 0;
  }
  process.stdout.write(
    renderTable(apps.map((a) => ({ id: a.Id, name: a.Name, image: a.Image ?? '-', status: a.Status ?? '-', region: a.Region ?? '-' }))) + '\n',
  );
  return 0;
}
