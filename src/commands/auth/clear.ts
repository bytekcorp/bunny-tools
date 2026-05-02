// `bunny auth:clear --scope <...>` — remove a stored credential.

import type { ParsedInvocation } from '../../manifest/types.js';
import { clearKey, parseScopeFlag } from '../../core/auth.js';
import { confirm, isInteractive } from '../../ui/prompt.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const flags = inv.flags as { scope?: string; yes?: boolean };
  if (!flags.scope) {
    progress.fail('--scope is required.');
    return 1;
  }
  const scope = parseScopeFlag(flags.scope);

  if (!flags.yes) {
    if (!isInteractive()) {
      progress.fail('Pass --yes to confirm in non-interactive shells.');
      return 1;
    }
    const ok = await confirm({ message: `Clear stored credential for "${flags.scope}"?`, default: false });
    if (!ok) {
      progress.info('Aborted.');
      return 1;
    }
  }

  await clearKey(scope);
  progress.succeed(`Cleared ${flags.scope}.`);
  return 0;
}
