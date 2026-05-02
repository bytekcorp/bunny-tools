import type { ParsedInvocation } from '../../manifest/types.js';
import { listScripts } from '../../core/scripting.js';
import { renderTable } from '../../ui/table.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const flags = inv.flags as { json?: boolean };
  const scripts = await listScripts();
  if (flags.json) {
    process.stdout.write(JSON.stringify(scripts, null, 2) + '\n');
    return 0;
  }
  if (scripts.length === 0) {
    process.stdout.write('(no edge scripts)\n');
    return 0;
  }
  process.stdout.write(
    renderTable(scripts.map((s) => ({ id: s.Id, name: s.Name, type: s.ScriptType ?? '-', deployed: String(s.Deployed ?? false) }))) + '\n',
  );
  return 0;
}
