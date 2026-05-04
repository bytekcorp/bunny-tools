// `bunny configure list` - show all profiles + their scopes (masked). Marks active.

import type { ParsedInvocation } from '../../manifest/types.js';
import { listProfiles } from '../../config/credential-resolver.js';
import { listScopes } from '../../core/auth.js';
import { renderTable } from '../../ui/table.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const flags = inv.flags as { json?: boolean };
  const { active, profiles } = await listProfiles();

  type Row = { profile: string; active: string; scope: string; value: string };
  const rows: Row[] = [];
  const detail: Record<string, Array<{ scope: string; value: string }>> = {};

  for (const p of profiles) {
    const scopes = await listScopes(p);
    detail[p] = scopes.map((s) => ({ scope: s.scope, value: s.masked }));
    if (scopes.length === 0) {
      rows.push({ profile: p, active: p === active ? '*' : ' ', scope: '(no credentials)', value: '' });
    } else {
      for (const s of scopes) {
        rows.push({ profile: p, active: p === active ? '*' : ' ', scope: s.scope, value: s.masked });
      }
    }
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify({ active, profiles: detail }, null, 2) + '\n');
    return 0;
  }

  if (profiles.length === 0) {
    process.stdout.write('(no profiles configured) - run `bunny configure` to create one.\n');
    return 0;
  }
  process.stdout.write(renderTable(rows) + '\n');
  return 0;
}
