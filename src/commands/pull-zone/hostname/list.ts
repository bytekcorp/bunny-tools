import type { ParsedInvocation } from '../../../manifest/types.js';
import { listPullZoneHostnames } from '../../../core/zones.js';
import { renderTable } from '../../../ui/table.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const args = inv.args as { pullZoneId?: string };
  const flags = inv.flags as { json?: boolean };
  if (!args.pullZoneId) {
    process.stderr.write('Usage: bunny pullzone hostname list <pullZoneId>\n');
    return 1;
  }
  const hosts = await listPullZoneHostnames(Number.parseInt(args.pullZoneId, 10));
  if (flags.json) {
    process.stdout.write(JSON.stringify(hosts, null, 2) + '\n');
    return 0;
  }
  if (hosts.length === 0) {
    process.stdout.write('(no hostnames)\n');
    return 0;
  }
  process.stdout.write(renderTable(hosts.map((h) => ({ hostname: h }))) + '\n');
  return 0;
}
