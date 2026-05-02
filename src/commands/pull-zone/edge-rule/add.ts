import type { ParsedInvocation } from '../../../manifest/types.js';
import { addEdgeRule } from '../../../core/zones.js';
import type { EdgeRule } from '../../../core/zones.js';
import { createProgress } from '../../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { pullZoneId?: string };
  const flags = inv.flags as { rule?: string };
  if (!args.pullZoneId || !flags.rule) {
    progress.fail('Usage: bunny pull-zone:edge-rule:add <pullZoneId> --rule=\'<json>\'');
    return 1;
  }
  let rule: EdgeRule;
  try {
    rule = JSON.parse(flags.rule) as EdgeRule;
  } catch (err) {
    progress.fail(`Invalid --rule JSON: ${(err as Error).message}`);
    return 1;
  }
  const next = await addEdgeRule(Number.parseInt(args.pullZoneId, 10), rule);
  progress.succeed(`Added edge rule. Pull zone now has ${next.length} rule(s).`);
  return 0;
}
