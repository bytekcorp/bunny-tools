// `bunny configure` — interactive (or --non-interactive) credential walkthrough
// for a named profile. Replaces the old `bunny auth set` flow.

import type { ParsedInvocation } from '../manifest/types.js';
import { runConfigure } from '../core/configure.js';
import { ask, confirm, isInteractive, pick } from '../ui/prompt.js';
import { createProgress } from '../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const flags = inv.flags as {
    nonInteractive?: boolean;
    profile?: string;
    accountKey?: string;
    storageZone?: string;
    storagePassword?: string;
    pullZone?: string;
    streamLibrary?: string;
    streamKey?: string;
  };

  // Profile precedence: --profile flag (this command) > BUNNY_PROFILE env > 'default'.
  // Note: the global --profile (-p) flag also lands in this command's flags via Commander
  // because it's a global option. Either way we read flags.profile.
  const profile = flags.profile ?? process.env['BUNNY_PROFILE'] ?? 'default';
  const interactive = !flags.nonInteractive && isInteractive();

  if (!interactive && !flags.accountKey) {
    progress.fail('Non-interactive mode requires --account-key.');
    return 1;
  }

  try {
    const result = await runConfigure(
      {
        profile,
        ...(flags.accountKey ? { accountKey: flags.accountKey } : {}),
        ...(flags.storageZone ? { storageZone: flags.storageZone } : {}),
        ...(flags.storagePassword ? { storagePassword: flags.storagePassword } : {}),
        ...(flags.pullZone ? { pullZoneId: Number.parseInt(flags.pullZone, 10) } : {}),
        ...(flags.streamLibrary ? { streamLibraryId: flags.streamLibrary } : {}),
        ...(flags.streamKey ? { streamKey: flags.streamKey } : {}),
      },
      { ask, pick, confirm, notify: (m) => progress.info(m) },
      { interactive },
    );
    progress.succeed(`Configured profile "${result.profile}". Stored: ${result.storedScopes.join(', ')}`);
    if (profile !== 'default') {
      progress.info(`Tip: \`bunny configure switch ${profile}\` to make this the active profile.`);
    }
    return 0;
  } catch (err) {
    progress.fail((err as Error).message);
    return 1;
  }
}
