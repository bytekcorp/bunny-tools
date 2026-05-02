import type { ParsedInvocation } from '../../manifest/types.js';
import { getStorageZone } from '../../core/zones.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { idOrName?: string };
  if (!args.idOrName) {
    progress.fail('Usage: bunny storage-zone:get <id|name>');
    return 1;
  }
  const idOrName = /^\d+$/.test(args.idOrName) ? Number.parseInt(args.idOrName, 10) : args.idOrName;
  const zone = await getStorageZone(idOrName);
  process.stdout.write(JSON.stringify(zone, null, 2) + '\n');
  return 0;
}
