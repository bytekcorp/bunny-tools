import type { ParsedInvocation } from '../../manifest/types.js';
import { deleteScript } from '../../core/scripting.js';
import { confirm, isInteractive } from '../../ui/prompt.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { id?: string };
  const flags = inv.flags as { yes?: boolean };
  if (!args.id) {
    progress.fail('Usage: bunny scripting:delete <id> [--yes]');
    return 1;
  }
  if (!flags.yes) {
    if (!isInteractive()) {
      progress.fail('Pass --yes in non-interactive shells.');
      return 1;
    }
    const ok = await confirm({ message: `Delete edge script ${args.id}?`, default: false });
    if (!ok) return 1;
  }
  await deleteScript(Number.parseInt(args.id, 10));
  progress.succeed(`Deleted edge script ${args.id}.`);
  return 0;
}
