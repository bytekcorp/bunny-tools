import type { ParsedInvocation } from '../../manifest/types.js';
import { deployScript } from '../../core/scripting.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { name?: string };
  const flags = inv.flags as { file?: string; id?: string; type?: string };
  if (!args.name || !flags.file) {
    progress.fail('Usage: bunny scripting:deploy <name> --file=<path> [--id=<existingId>] [--type=<n>]');
    return 1;
  }
  const result = await deployScript({
    name: args.name,
    filePath: flags.file,
    ...(flags.id ? { id: Number.parseInt(flags.id, 10) } : {}),
    ...(flags.type ? { scriptType: Number.parseInt(flags.type, 10) } : {}),
  });
  progress.succeed(
    `${flags.id ? 'Updated' : 'Created'} edge script ${result.Name} (id=${result.Id}).`,
  );
  return 0;
}
