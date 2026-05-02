import type { ParsedInvocation } from '../../../manifest/types.js';
import { deleteEdgeRule } from '../../../core/zones.js';
import { createProgress } from '../../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { pullZoneId?: string; ruleGuid?: string };
  if (!args.pullZoneId || !args.ruleGuid) {
    progress.fail('Usage: bunny pull-zone:edge-rule:delete <pullZoneId> <ruleGuid>');
    return 1;
  }
  await deleteEdgeRule(Number.parseInt(args.pullZoneId, 10), args.ruleGuid);
  progress.succeed(`Deleted edge rule ${args.ruleGuid}.`);
  return 0;
}
