import type { ParsedInvocation } from '../../../manifest/types.js';
import { deleteApp } from '../../../core/containers.js';
import { confirm, isInteractive } from '../../../ui/prompt.js';
import { createProgress } from '../../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { id?: string };
  const flags = inv.flags as { yes?: boolean };
  if (!args.id) {
    progress.fail('Usage: bunny containers:app:delete <id> [--yes]');
    return 1;
  }
  if (!flags.yes) {
    if (!isInteractive()) {
      progress.fail('Pass --yes in non-interactive shells.');
      return 1;
    }
    const ok = await confirm({ message: `Delete container app ${args.id}?`, default: false });
    if (!ok) return 1;
  }
  await deleteApp(args.id);
  progress.succeed(`Deleted container app ${args.id}.`);
  return 0;
}
