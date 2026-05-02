// `bunny deploy` — sync public dir to storage zone and purge CDN. Thin wrapper.

import type { ParsedInvocation } from '../manifest/types.js';
import { loadBunnyJson } from '../config/bunny-json.js';
import { runDeploy } from '../core/deploy.js';
import { createProgress } from '../ui/progress.js';
import { renderTable } from '../ui/table.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const flags = inv.flags as {
    delete?: boolean;
    dryRun?: boolean;
    concurrency?: string;
    purge?: string;
    only?: string;
    json?: boolean;
  };

  let config;
  try {
    config = (await loadBunnyJson()).config;
  } catch (err) {
    progress.fail((err as Error).message);
    return 1;
  }

  progress.start(flags.dryRun ? 'Deploying (dry-run)' : 'Deploying');
  try {
    const result = await runDeploy({
      config,
      cwd: process.cwd(),
      ...(flags.dryRun ? { dryRun: true } : {}),
      ...(flags.delete ? { deleteOrphans: true } : {}),
      ...(flags.concurrency ? { concurrency: Number.parseInt(flags.concurrency, 10) } : {}),
      ...(flags.purge ? { purgeOverride: flags.purge } : {}),
      onEvent: (e) => {
        switch (e.type) {
          case 'phase':
            progress.update(`${e.phase}${e.message ? ` (${e.message})` : ''}`);
            break;
          case 'walk':
            progress.info(`walked ${e.total} files`);
            break;
          case 'diff':
            progress.info(
              `diff: ${e.new} new · ${e.changed} changed · ${e.unchanged} unchanged · ${e.orphan} orphan`,
            );
            break;
          case 'upload-progress':
            if (e.completed === e.total) progress.info(`uploaded ${e.total} files`);
            break;
          case 'delete-progress':
            if (e.completed === e.total) progress.info(`deleted ${e.total} orphans`);
            break;
          case 'purge':
            if (e.targets.length > 0) progress.info(`purged: ${e.targets.join(', ')}`);
            break;
          case 'warn':
            progress.warn(e.message);
            break;
        }
      },
    });

    if (flags.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      const summary = renderTable([
        {
          uploaded: result.uploaded,
          deleted: result.deleted,
          unchanged: result.unchanged,
          purged: result.purged,
          failed: result.failed.length,
          ms: result.durationMs,
        },
      ]);
      process.stdout.write(summary + '\n');
    }
    if (result.failed.length > 0) {
      for (const f of result.failed) progress.warn(`${f.path}: ${f.error}`);
      return 2;
    }
    progress.succeed(flags.dryRun ? 'Dry-run complete.' : 'Deploy complete.');
    return 0;
  } catch (err) {
    progress.fail((err as Error).message);
    return 1;
  }
}
