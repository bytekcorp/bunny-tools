import type { ParsedInvocation } from '../../../manifest/types.js';
import { enablePullZoneSSL } from '../../../core/zones.js';
import { createProgress } from '../../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { pullZoneId?: string; hostname?: string };
  const flags = inv.flags as { noForceSsl?: boolean };
  if (!args.pullZoneId || !args.hostname) {
    progress.fail('Usage: bunny pullzone hostname enable-ssl <pullZoneId> <hostname>');
    return 1;
  }
  progress.start(`Requesting SSL certificate for ${args.hostname} (may take up to 90s)…`);
  try {
    const result = await enablePullZoneSSL(
      Number.parseInt(args.pullZoneId, 10),
      args.hostname,
      flags.noForceSsl ? { noForceSSL: true } : {},
    );
    const seconds = Math.round(result.waitedMs / 1000);
    const sslBit = result.forceSslSet ? ' (ForceSSL enabled)' : '';
    progress.succeed(
      result.waitedMs === 0
        ? `${args.hostname} already has a certificate${sslBit}.`
        : `SSL certificate provisioned for ${args.hostname} in ${seconds}s${sslBit}.`,
    );
    return 0;
  } catch (err) {
    progress.fail((err as Error).message);
    return 1;
  }
}
