// `bunny auth:list` — show stored credential scopes (masked).

import type { ParsedInvocation } from '../../manifest/types.js';
import { listScopes } from '../../core/auth.js';
import { renderTable } from '../../ui/table.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const flags = inv.flags as { json?: boolean };
  const scopes = await listScopes();

  if (flags.json) {
    process.stdout.write(JSON.stringify(scopes, null, 2) + '\n');
    return 0;
  }

  if (scopes.length === 0) {
    process.stdout.write('No credentials stored. Run `bunny configure` or `bunny auth:set --scope <...>`.\n');
    return 0;
  }
  process.stdout.write(renderTable(scopes.map((s) => ({ scope: s.scope, value: s.masked }))) + '\n');
  return 0;
}
