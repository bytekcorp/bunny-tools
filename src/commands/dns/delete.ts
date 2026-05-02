import type { ParsedInvocation } from '../../manifest/types.js';
import { deleteZone } from '../../core/dns.js';
import { confirm, isInteractive } from '../../ui/prompt.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { id?: string };
  const flags = inv.flags as { yes?: boolean };
  if (!args.id) {
    progress.fail('Usage: bunny dns:delete <id> [--yes]');
    return 1;
  }
  if (!flags.yes) {
    if (!isInteractive()) {
      progress.fail('Pass --yes in non-interactive shells.');
      return 1;
    }
    const ok = await confirm({ message: `Delete DNS zone ${args.id}? This is irreversible.`, default: false });
    if (!ok) return 1;
  }
  await deleteZone(Number.parseInt(args.id, 10));
  progress.succeed(`Deleted DNS zone ${args.id}.`);
  return 0;
}
