// `bunny auth:set --scope <...>` — store a single key.

import type { ParsedInvocation } from '../../manifest/types.js';
import { parseScopeFlag, setKey } from '../../core/auth.js';
import { ask, isInteractive } from '../../ui/prompt.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const flags = inv.flags as { scope?: string; value?: string };
  if (!flags.scope) {
    progress.fail('--scope is required (e.g. account, storage:my-zone, stream:42, database:main).');
    return 1;
  }
  const scope = parseScopeFlag(flags.scope);

  const value =
    flags.value ??
    (isInteractive()
      ? await ask({ name: 'value', message: `Value for scope ${flags.scope}`, mode: 'mask' })
      : undefined);
  if (!value) {
    progress.fail('No value provided. Pass --value or run interactively.');
    return 1;
  }

  const { storedIn } = await setKey(scope, value);
  progress.succeed(`Stored ${flags.scope} (${storedIn}).`);
  return 0;
}
