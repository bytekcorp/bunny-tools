import type { ParsedInvocation } from '../../../manifest/types.js';
import { updateRecord } from '../../../core/dns.js';
import { createProgress } from '../../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { zoneId?: string; recordId?: string };
  const flags = inv.flags as { body?: string };
  if (!args.zoneId || !args.recordId || !flags.body) {
    progress.fail('Usage: bunny dns:record:update <zoneId> <recordId> --body=\'<json>\'');
    return 1;
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(flags.body) as Record<string, unknown>;
  } catch (err) {
    progress.fail(`Invalid --body JSON: ${(err as Error).message}`);
    return 1;
  }
  await updateRecord(Number.parseInt(args.zoneId, 10), Number.parseInt(args.recordId, 10), body);
  progress.succeed(`Updated record ${args.recordId} in zone ${args.zoneId}.`);
  return 0;
}
