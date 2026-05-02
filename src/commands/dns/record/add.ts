import type { ParsedInvocation } from '../../../manifest/types.js';
import { addRecord, SUPPORTED_TYPES } from '../../../core/dns.js';
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
  };
  if (!args.zoneId || !args.type || args.name === undefined || !args.value) {
    progress.fail(
      `Usage: bunny dns:record:add <zoneId> <type> <name> <value> [flags]\nSupported types: ${SUPPORTED_TYPES.join(', ')}`,
    );
    return 1;
  }
  const raw = {
    type: args.type.toUpperCase(),
    name: args.name,
    value: args.value,
    ...(flags.ttl ? { ttl: Number.parseInt(flags.ttl, 10) } : {}),
    ...(flags.priority !== undefined ? { priority: Number.parseInt(flags.priority, 10) } : {}),
    ...(flags.weight !== undefined ? { weight: Number.parseInt(flags.weight, 10) } : {}),
    ...(flags.port !== undefined ? { port: Number.parseInt(flags.port, 10) } : {}),
    ...(flags.flags !== undefined ? { flags: Number.parseInt(flags.flags, 10) } : {}),
    ...(flags.tag ? { tag: flags.tag } : {}),
  };
  try {
    const created = await addRecord(Number.parseInt(args.zoneId, 10), raw);
    progress.succeed(`Added ${args.type.toUpperCase()} record (id=${created.Id}).`);
    return 0;
  } catch (err) {
    progress.fail((err as Error).message);
    return 1;
  }
}
