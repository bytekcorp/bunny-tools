import type { ParsedInvocation } from '../../../manifest/types.js';
import { setHostnameForceSSL } from '../../../core/zones.js';
import { formatBunnyError } from '../../../util/format-error.js';
import { createProgress } from '../../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { pullZoneId?: string; hostname?: string };
  const flags = inv.flags as { off?: boolean };
  if (!args.pullZoneId || !args.hostname) {
    progress.fail('Usage: bunny pullzone hostname force-ssl <pullZoneId> <hostname> [--off]');
    return 1;
  }
  const force = !flags.off;
  try {
    await setHostnameForceSSL(Number.parseInt(args.pullZoneId, 10), args.hostname, force);
    progress.succeed(`ForceSSL ${force ? 'enabled' : 'disabled'} for ${args.hostname}.`);
    return 0;
  } catch (err) {
    progress.fail(formatBunnyError(err));
    return 1;
  }
}
