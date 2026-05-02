import type { ParsedInvocation } from '../../manifest/types.js';
import { uploadFile } from '../../core/storage-ops.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { local?: string; remote?: string };
  const flags = inv.flags as { zone?: string; region?: string };
  if (!args.local || !args.remote) {
    progress.fail('Usage: bunny storage:upload <local> <remote> --zone=<name>');
    return 1;
  }
  if (!flags.zone) {
    progress.fail('--zone required.');
    return 1;
  }
  await uploadFile(flags.zone, args.local, args.remote, flags.region);
  progress.succeed(`Uploaded ${args.local} → ${flags.zone}:${args.remote}`);
  return 0;
}
