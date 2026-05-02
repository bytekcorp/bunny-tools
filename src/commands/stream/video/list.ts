import type { ParsedInvocation } from '../../../manifest/types.js';
import { listVideos } from '../../../core/stream.js';
import { renderTable } from '../../../ui/table.js';
import { createProgress } from '../../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { library?: string };
  const flags = inv.flags as { collection?: string; json?: boolean };
  if (!args.library) {
    progress.fail('Usage: bunny stream:video:list <library> [--collection=<id>]');
    return 1;
  }
  const videos = await listVideos(args.library, flags.collection);
  if (flags.json) {
    process.stdout.write(JSON.stringify(videos, null, 2) + '\n');
    return 0;
  }
  if (videos.length === 0) {
    process.stdout.write('(no videos)\n');
    return 0;
  }
  process.stdout.write(
    renderTable(
      videos.map((v) => ({
        guid: v.guid,
        title: v.title,
        length: v.length,
        views: v.views,
        status: v.status,
      })),
    ) + '\n',
  );
  return 0;
}
