import type { ParsedInvocation } from '../../../manifest/types.js';
import { addRecord, SUPPORTED_TYPES } from '../../../core/dns.js';
import { getPullZone } from '../../../core/zones.js';
import { createProgress } from '../../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { zoneId?: string; type?: string; name?: string; value?: string };
  const flags = inv.flags as {
    ttl?: string;
    priority?: string;
    weight?: string;
    port?: string;
    flags?: string;
    tag?: string;
    linkName?: string;
    pullZone?: string;
  };
  if (!args.zoneId || !args.type || args.name === undefined) {
    progress.fail(
      `Usage: bunny dns record add <zoneId> <type> <name> <value> [flags]\nSupported types: ${SUPPORTED_TYPES.join(', ')}`,
    );
    return 1;
  }

  const upperType = args.type.toUpperCase();

  // Convenience: --pull-zone=<id> auto-resolves to the pull zone's name and
  // sets LinkName=<id>. Saves users the `bunny pullzone get <id>` step for
  // the common "wire DNS to a pull zone" workflow.
  let resolvedValue = args.value;
  let resolvedLinkName = flags.linkName;
  if (flags.pullZone) {
    if (upperType !== 'PULLZONE') {
      progress.fail('--pull-zone only applies to PULLZONE record type.');
      return 1;
    }
    try {
      const pz = await getPullZone(Number.parseInt(flags.pullZone, 10));
      resolvedValue = resolvedValue ?? pz.Name;
      resolvedLinkName = resolvedLinkName ?? String(pz.Id);
    } catch (err) {
      progress.fail(`--pull-zone lookup failed: ${(err as Error).message}`);
      return 1;
    }
  }

  if (!resolvedValue) {
    progress.fail('Missing <value>. For PULLZONE: pass the pz name or use --pull-zone=<id>.');
    return 1;
  }

  const raw = {
    type: upperType,
    name: args.name,
    value: resolvedValue,
    ...(flags.ttl ? { ttl: Number.parseInt(flags.ttl, 10) } : {}),
    ...(flags.priority !== undefined ? { priority: Number.parseInt(flags.priority, 10) } : {}),
    ...(flags.weight !== undefined ? { weight: Number.parseInt(flags.weight, 10) } : {}),
    ...(flags.port !== undefined ? { port: Number.parseInt(flags.port, 10) } : {}),
    ...(flags.flags !== undefined ? { flags: Number.parseInt(flags.flags, 10) } : {}),
    ...(flags.tag ? { tag: flags.tag } : {}),
    ...(resolvedLinkName ? { linkName: resolvedLinkName } : {}),
  };
  try {
    const created = await addRecord(Number.parseInt(args.zoneId, 10), raw);
    progress.succeed(`Added ${upperType} record (id=${created.Id}).`);
    return 0;
  } catch (err) {
    progress.fail((err as Error).message);
    return 1;
  }
}
