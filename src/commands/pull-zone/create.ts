import type { ParsedInvocation } from '../../manifest/types.js';
import { createPullZone } from '../../core/zones.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { name?: string };
  const flags = inv.flags as { origin?: string };
  if (!args.name || !flags.origin) {
    progress.fail('Usage: bunny pull-zone:create <name> --origin=<url>');
    return 1;
  }
  const pz = await createPullZone(args.name, flags.origin);
  progress.succeed(`Created pull zone ${pz.Name} (id=${pz.Id}).`);
  return 0;
}
