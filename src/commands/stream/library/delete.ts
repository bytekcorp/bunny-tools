import type { ParsedInvocation } from '../../../manifest/types.js';
import { deleteLibrary } from '../../../core/stream.js';
import { confirm, isInteractive } from '../../../ui/prompt.js';
import { createProgress } from '../../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { id?: string };
  const flags = inv.flags as { yes?: boolean };
  if (!args.id) {
    progress.fail('Usage: bunny stream library delete <id> [--yes]');
    return 1;
  }
  const id = Number.parseInt(args.id, 10);
  if (Number.isNaN(id)) {
    progress.fail('Library id must be a number.');
    return 1;
  }
  if (!flags.yes) {
    if (!isInteractive()) {
      progress.fail('Pass --yes to confirm in non-interactive shells.');
      return 1;
    }
    const ok = await confirm({
      message: `Delete video library ${id}? This is irreversible.`,
      default: false,
    });
    if (!ok) {
      progress.info('Aborted.');
      return 1;
    }
  }
  await deleteLibrary(id);
  progress.succeed(`Deleted video library ${id}.`);
  return 0;
}
