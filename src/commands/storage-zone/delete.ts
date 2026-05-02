import type { ParsedInvocation } from '../../manifest/types.js';
import { deleteStorageZone } from '../../core/zones.js';
import { confirm, isInteractive } from '../../ui/prompt.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { id?: string };
  const flags = inv.flags as { yes?: boolean };
  if (!args.id) {
    progress.fail('Usage: bunny storage-zone:delete <id> [--yes]');
    return 1;
  }
  if (!flags.yes) {
    if (!isInteractive()) {
      progress.fail('Pass --yes to confirm in non-interactive shells.');
      return 1;
    }
    const ok = await confirm({ message: `Delete storage zone ${args.id}?`, default: false });
    if (!ok) {
      progress.info('Aborted.');
      return 1;
    }
  }
  await deleteStorageZone(Number.parseInt(args.id, 10));
  progress.succeed(`Deleted storage zone ${args.id}.`);
  return 0;
}
