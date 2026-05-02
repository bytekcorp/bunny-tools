import type { ParsedInvocation } from '../../../manifest/types.js';
import { listEdgeRules } from '../../../core/zones.js';
import { renderTable } from '../../../ui/table.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const args = inv.args as { pullZoneId?: string };
  const flags = inv.flags as { json?: boolean };
  if (!args.pullZoneId) {
    process.stderr.write('Usage: bunny pull-zone:edge-rule:list <pullZoneId>\n');
    return 1;
  }
  const rules = await listEdgeRules(Number.parseInt(args.pullZoneId, 10));
  if (flags.json) {
    process.stdout.write(JSON.stringify(rules, null, 2) + '\n');
    return 0;
  }
  if (rules.length === 0) {
    process.stdout.write('(no edge rules)\n');
    return 0;
  }
  process.stdout.write(
    renderTable(
      rules.map((r) => ({
        guid: r.Guid ?? '-',
        action: r.ActionType,
        enabled: String(r.Enabled ?? true),
        description: r.Description ?? '-',
      })),
    ) + '\n',
  );
  return 0;
}
