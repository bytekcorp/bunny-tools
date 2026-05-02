import type { ParsedInvocation } from '../../manifest/types.js';
import { createZone } from '../../core/dns.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { domain?: string };
  if (!args.domain) {
    progress.fail('Usage: bunny dns:create <domain>');
    return 1;
  }
  const zone = await createZone(args.domain);
  progress.succeed(`Created DNS zone for ${zone.Domain} (id=${zone.Id}).`);
  return 0;
}
