import type { ParsedInvocation } from '../../manifest/types.js';
import { getZone } from '../../core/dns.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { id?: string };
  if (!args.id) {
    progress.fail('Usage: bunny dns:get <id>');
    return 1;
  }
  const zone = await getZone(Number.parseInt(args.id, 10));
  process.stdout.write(JSON.stringify(zone, null, 2) + '\n');
  return 0;
}
