// `bunny purge <target>` - standalone CDN cache purge.

import type { ParsedInvocation } from '../manifest/types.js';
import { parsePurgeArg, runPurgeCommand } from '../core/purge.js';
import { createProgress } from '../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { target?: string };
  if (!args.target) {
    progress.fail('Purge target required: <url> | pull-zone:<id>.');
    return 1;
  }
  let target;
  try {
    target = parsePurgeArg(args.target);
  } catch (err) {
    progress.fail((err as Error).message);
    return 1;
  }
  const result = await runPurgeCommand(target);
  for (const f of result.failed) progress.warn(`${f.target}: ${f.error}`);
  if (result.failed.length > 0 && result.ok === 0) {
    progress.fail('Purge failed.');
    return 2;
  }
  progress.succeed(`Purged ${result.ok} target(s).`);
  return 0;
}
