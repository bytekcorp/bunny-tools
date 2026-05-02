import type { ParsedInvocation } from '../../manifest/types.js';
import { listPath } from '../../core/storage-ops.js';
import { createProgress } from '../../ui/progress.js';
import { renderTable } from '../../ui/table.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { path?: string };
  const flags = inv.flags as { zone?: string; recursive?: boolean; json?: boolean; region?: string };
  if (!flags.zone) {
    progress.fail('--zone required.');
    return 1;
  }
  const path = args.path ?? '/';
  const entries = await listPath(flags.zone, path, {
    ...(flags.recursive ? { recursive: true } : {}),
    ...(flags.region ? { region: flags.region } : {}),
  });
  if (flags.json) {
    process.stdout.write(JSON.stringify(entries, null, 2) + '\n');
    return 0;
  }
  if (entries.length === 0) {
    process.stdout.write('(empty)\n');
    return 0;
  }
  process.stdout.write(
    renderTable(entries.map((e) => ({ kind: e.isDirectory ? 'dir' : 'file', size: e.size, path: e.path }))) + '\n',
  );
  return 0;
}
