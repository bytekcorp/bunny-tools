import type { ParsedInvocation } from '../../manifest/types.js';
import { resolveActiveZone, uploadFile } from '../../core/storage-ops.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { local?: string; remote?: string };
  const flags = inv.flags as { zone?: string; region?: string };
  if (!args.local || !args.remote) {
    progress.fail('Usage: bunny storage upload <local> <remote> [--zone=<name>]');
    return 1;
  }
  let zone: string;
  try {
    zone = await resolveActiveZone(flags.zone);
  } catch (err) {
    progress.fail((err as Error).message);
    return 1;
  }
  await uploadFile(zone, args.local, args.remote, flags.region);
  progress.succeed(`Uploaded ${args.local} → ${zone}:${args.remote}`);
  return 0;
}
