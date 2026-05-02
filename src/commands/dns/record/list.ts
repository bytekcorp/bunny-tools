import type { ParsedInvocation } from '../../../manifest/types.js';
import { listRecords, recordTypeName } from '../../../core/dns.js';
import { renderTable } from '../../../ui/table.js';
import { createProgress } from '../../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { zoneId?: string };
  const flags = inv.flags as { type?: string; json?: boolean };
  if (!args.zoneId) {
    progress.fail('Usage: bunny dns:record:list <zoneId>');
    return 1;
  }
  let records = await listRecords(Number.parseInt(args.zoneId, 10));
  if (flags.type) {
    records = records.filter((r) => recordTypeName(r.Type) === flags.type!.toUpperCase());
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify(records, null, 2) + '\n');
    return 0;
  }
  if (records.length === 0) {
    process.stdout.write('(no records)\n');
    return 0;
  }
  process.stdout.write(
    renderTable(
      records.map((r) => ({
        id: r.Id,
        type: recordTypeName(r.Type),
        name: r.Name || '@',
        value: r.Value,
        ttl: r.Ttl ?? '-',
      })),
    ) + '\n',
  );
  return 0;
}
