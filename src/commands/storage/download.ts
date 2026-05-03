import type { ParsedInvocation } from '../../manifest/types.js';
import { downloadFile, resolveActiveZone } from '../../core/storage-ops.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { remote?: string; local?: string };
  const flags = inv.flags as { zone?: string; region?: string };
  if (!args.remote || !args.local) {
    progress.fail('Usage: bunny storage download <remote> <local> [--zone=<name>]');
    return 1;
  }
  let zone: string;
  try {
    zone = await resolveActiveZone(flags.zone);
  } catch (err) {
    progress.fail((err as Error).message);
    return 1;
  }
  await downloadFile(zone, args.remote, args.local, flags.region);
  progress.succeed(`Downloaded ${zone}:${args.remote} → ${args.local}`);
  return 0;
}
