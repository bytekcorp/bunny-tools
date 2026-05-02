// `bunny configure remove [--profile=<name>] [--scope=<scope>]` — remove a profile
// (all its scopes) or remove a single scope within a profile.

import type { ParsedInvocation } from '../../manifest/types.js';
import { clearCredential, getActiveProfile, removeProfile } from '../../config/credential-resolver.js';
import { parseScopeFlag } from '../../core/auth.js';
import { confirm, isInteractive } from '../../ui/prompt.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const flags = inv.flags as { profile?: string; scope?: string; yes?: boolean };

  const profile = flags.profile ?? (await getActiveProfile());

  // If --scope provided, remove just that scope from the profile.
  if (flags.scope) {
    const scope = parseScopeFlag(flags.scope);
    if (!flags.yes) {
      if (!isInteractive()) {
        progress.fail('Pass --yes to confirm in non-interactive shells.');
        return 1;
      }
      const ok = await confirm({
        message: `Remove ${flags.scope} from profile "${profile}"?`,
        default: false,
      });
      if (!ok) return 1;
    }
    await clearCredential(scope, { profile });
    progress.succeed(`Removed ${flags.scope} from profile "${profile}".`);
    return 0;
  }

  // Otherwise remove the entire profile.
  if (!flags.yes) {
    if (!isInteractive()) {
      progress.fail('Pass --yes to confirm removal in non-interactive shells.');
      return 1;
    }
    const ok = await confirm({
      message: `Remove ENTIRE profile "${profile}" (all stored credentials)?`,
      default: false,
    });
    if (!ok) return 1;
  }
  await removeProfile(profile);
  progress.succeed(`Profile "${profile}" removed.`);
  return 0;
}
