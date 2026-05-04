import type { ParsedInvocation } from '../../manifest/types.js';
import { connectDomain } from '../../core/domain.js';
import { formatBunnyError } from '../../util/format-error.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { pullZoneId?: string; hostname?: string };
  // Commander negates `--no-X` flags as the inverse of `--X`. Read the
  // negative-form flags via their positive name (false = was passed).
  const flags = inv.flags as {
    dnsZone?: string;
    name?: string;
    wait?: boolean;
    timeout?: string;
    forceSsl?: boolean;
  };
  if (!args.pullZoneId || !args.hostname) {
    progress.fail('Usage: bunny domain connect <pullZoneId> <hostname>');
    return 1;
  }

  const pullZoneId = Number.parseInt(args.pullZoneId, 10);
  const dnsZoneId = flags.dnsZone ? Number.parseInt(flags.dnsZone, 10) : undefined;
  const timeoutMs = flags.timeout ? Number.parseInt(flags.timeout, 10) * 1000 : undefined;
  const noWait = flags.wait === false;
  const noForceSsl = flags.forceSsl === false;

  progress.start(
    flags.dnsZone
      ? `Connecting ${args.hostname} to PZ ${pullZoneId} (linking + cert + DNS)…`
      : `Connecting ${args.hostname} to PZ ${pullZoneId} (linking + cert)…`,
  );

  try {
    const result = await connectDomain(pullZoneId, args.hostname, {
      ...(dnsZoneId !== undefined ? { dnsZoneId } : {}),
      ...(flags.name !== undefined ? { recordName: flags.name } : {}),
      ...(noWait ? { noWait: true } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(noForceSsl ? { noForceSSL: true } : {}),
    });
    const certBit = noWait
      ? '(cert pending - re-run or check `bunny pullzone get`)'
      : `cert ready (${Math.round(result.certWaitedMs / 1000)}s wait)`;
    const dnsBit = result.dnsRecordId !== undefined ? `, DNS record id=${result.dnsRecordId}` : '';
    progress.succeed(`${args.hostname} connected - ${certBit}${dnsBit}.`);
    return 0;
  } catch (err) {
    progress.fail(formatBunnyError(err));
    return 1;
  }
}
