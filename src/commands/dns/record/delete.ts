import type { ParsedInvocation } from '../../../manifest/types.js';
import { deleteRecord } from '../../../core/dns.js';
import { confirm, isInteractive } from '../../../ui/prompt.js';
import { createProgress } from '../../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { zoneId?: string; recordId?: string };
  const flags = inv.flags as { yes?: boolean };
  if (!args.zoneId || !args.recordId) {
    progress.fail('Usage: bunny dns:record:delete <zoneId> <recordId> [--yes]');
    return 1;
  }
  if (!flags.yes) {
    if (!isInteractive()) {
      progress.fail('Pass --yes in non-interactive shells.');
      return 1;
    }
    const ok = await confirm({ message: `Delete record ${args.recordId} in zone ${args.zoneId}?`, default: false });
    if (!ok) return 1;
  }
  await deleteRecord(Number.parseInt(args.zoneId, 10), Number.parseInt(args.recordId, 10));
  progress.succeed(`Deleted record ${args.recordId}.`);
  return 0;
}
