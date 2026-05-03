import type { ParsedInvocation } from '../../../manifest/types.js';
import { addPullZoneHostname } from '../../../core/zones.js';
import { createProgress } from '../../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { pullZoneId?: string; hostname?: string };
  if (!args.pullZoneId || !args.hostname) {
    progress.fail('Usage: bunny pullzone hostname add <pullZoneId> <hostname>');
    return 1;
  }
  try {
    const hosts = await addPullZoneHostname(Number.parseInt(args.pullZoneId, 10), args.hostname);
    progress.succeed(`Linked ${args.hostname}. Pull zone now has ${hosts.length} hostname(s).`);
    return 0;
  } catch (err) {
    progress.fail((err as Error).message);
    return 1;
  }
}
