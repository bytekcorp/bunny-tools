import type { ParsedInvocation } from '../../manifest/types.js';
import { updateStorageZone } from '../../core/zones.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { id?: string };
  const flags = inv.flags as { body?: string };
  if (!args.id || !flags.body) {
    progress.fail('Usage: bunny storage-zone:update <id> --body=\'<json>\'');
    return 1;
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(flags.body) as Record<string, unknown>;
  } catch (err) {
    progress.fail(`Invalid --body JSON: ${(err as Error).message}`);
    return 1;
  }
  await updateStorageZone(Number.parseInt(args.id, 10), body);
  progress.succeed(`Updated storage zone ${args.id}.`);
  return 0;
}
