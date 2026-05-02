import type { ParsedInvocation } from '../../manifest/types.js';
import { getPullZone } from '../../core/zones.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { id?: string };
  if (!args.id) {
    progress.fail('Usage: bunny pull-zone:get <id>');
    return 1;
  }
  const pz = await getPullZone(Number.parseInt(args.id, 10));
  process.stdout.write(JSON.stringify(pz, null, 2) + '\n');
  return 0;
}
