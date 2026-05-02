import type { ParsedInvocation } from '../../manifest/types.js';
import { downloadFile } from '../../core/storage-ops.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { remote?: string; local?: string };
  const flags = inv.flags as { zone?: string; region?: string };
  if (!args.remote || !args.local || !flags.zone) {
    progress.fail('Usage: bunny storage:download <remote> <local> --zone=<name>');
    return 1;
  }
  await downloadFile(flags.zone, args.remote, args.local, flags.region);
  progress.succeed(`Downloaded ${flags.zone}:${args.remote} → ${args.local}`);
  return 0;
}
