// `bunny configure` — aws-style guided global setup. Thin wrapper over core.

import type { ParsedInvocation } from '../manifest/types.js';
import { runConfigure } from '../core/configure.js';
import { ask, confirm, isInteractive, pick } from '../ui/prompt.js';
import { createProgress } from '../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const flags = inv.flags as {
    nonInteractive?: boolean;
    accountKey?: string;
    storageZone?: string;
    storagePassword?: string;
  };
  const interactive = !flags.nonInteractive && isInteractive();

  if (!interactive) {
    if (!flags.accountKey) {
      progress.fail('Non-interactive mode requires --account-key (and typically --storage-zone, --storage-password).');
      return 1;
    }
  }

  try {
    const result = await runConfigure(
      {
        ...(flags.accountKey ? { accountKey: flags.accountKey } : {}),
        ...(flags.storageZone ? { storageZone: flags.storageZone } : {}),
        ...(flags.storagePassword ? { storagePassword: flags.storagePassword } : {}),
      },
      {
        ask,
        pick,
        confirm,
        notify: (m) => progress.info(m),
      },
      { interactive },
    );
    progress.succeed(`Configured. Stored: ${result.storedScopes.join(', ')}`);
    if (result.suggestedBunnyJson) {
      progress.info(
        `Tip: \`bunny init\` will pre-fill bunny.json with storageZone="${result.suggestedBunnyJson.deploy.storageZone}".`,
      );
    }
    return 0;
  } catch (err) {
    progress.fail((err as Error).message);
    return 1;
  }
}
