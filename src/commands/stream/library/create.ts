import type { ParsedInvocation } from '../../../manifest/types.js';
import { createLibrary } from '../../../core/stream.js';
import { createProgress } from '../../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { name?: string };
  const flags = inv.flags as { replicate?: string };
  if (!args.name) {
    progress.fail('Usage: bunny stream:library:create <name> [--replicate=<r,r>]');
    return 1;
  }
  const replicationRegions = flags.replicate ? flags.replicate.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  const lib = await createLibrary(args.name, replicationRegions);
  progress.succeed(`Created video library ${lib.Name} (id=${lib.Id}).`);
  return 0;
}
