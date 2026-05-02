// `bunny configure switch <profile>` — set the active profile.

import type { ParsedInvocation } from '../../manifest/types.js';
import { setActiveProfile } from '../../config/credential-resolver.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { profile?: string };
  if (!args.profile) {
    progress.fail('Usage: bunny configure switch <profile>');
    return 1;
  }
  await setActiveProfile(args.profile);
  progress.succeed(`Active profile is now "${args.profile}".`);
  return 0;
}
