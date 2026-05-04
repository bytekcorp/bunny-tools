// `bunny deploy` - sync public dir to storage zone and purge CDN. Thin wrapper.

import type { ParsedInvocation } from '../manifest/types.js';
import { loadBunnyJson } from '../config/bunny-json.js';
import { runDeploy } from '../core/deploy.js';
import { createProgress } from '../ui/progress.js';
import { renderTable } from '../ui/table.js';

const ORPHAN_PREVIEW_COUNT = 10;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const flags = inv.flags as {
    delete?: boolean;
    dryRun?: boolean;
    concurrency?: string;
    purge?: string;
    only?: string;
    json?: boolean;
    verbose?: boolean;
  };

  let config;
  let configFilePath: string;
  try {
    const loaded = await loadBunnyJson();
    config = loaded.config;
    configFilePath = loaded.filePath;
  } catch (err) {
    progress.fail((err as Error).message);
    return 1;
  }

  progress.start(flags.dryRun ? 'Deploying (dry-run)' : 'Deploying');
  try {
    const result = await runDeploy({
      config,
      configFilePath,
      cwd: process.cwd(),
      ...(flags.dryRun ? { dryRun: true } : {}),
      ...(flags.delete ? { deleteOrphans: true } : {}),
      ...(flags.concurrency ? { concurrency: Number.parseInt(flags.concurrency, 10) } : {}),
      ...(flags.purge ? { purgeOverride: flags.purge } : {}),
      ...(flags.verbose ? { verbose: true } : {}),
      onEvent: (e) => {
        switch (e.type) {
          case 'phase':
            progress.update(`${e.phase}${e.message ? ` (${e.message})` : ''}`);
            break;
          case 'walk':
            progress.info(`walked ${e.total} files`);
            break;
          case 'diff': {
            progress.info(
              `diff: ${e.new} new · ${e.changed} changed · ${e.unchanged} unchanged · ${e.orphan} orphan`,
            );
            // Show orphan paths so dry-run consumers know what would be deleted.
            // Verbose lists all; default lists first 10 + count.
            if (e.orphan > 0) {
              const limit = flags.verbose ? e.orphan : ORPHAN_PREVIEW_COUNT;
              const preview = e.orphanPaths.slice(0, limit);
              const remainder = e.orphan - preview.length;
              const tail = remainder > 0 ? `, ... (${remainder} more)` : '';
              progress.info(`would delete: ${preview.join(', ')}${tail}`);
            }
            break;
          }
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
          case 'mime':
            progress.info(`${e.path} [${e.contentType}] (${formatBytes(e.size)})`);
            break;
          case 'large-file':
            progress.warn(`large file: ${e.path} (${formatBytes(e.size)})`);
            break;
          case 'migrate-ignores':
            progress.info(
              `Upgraded bunny.json default ignores (${e.from} → ${e.to} entries) to rc.33+ baseline.`,
            );
            break;
          case 'auto-spawned-pz':
            // Not emitted by deploy; included for type completeness.
            break;
          case 'edge-rules-sync':
            if (e.added > 0 || e.updated > 0 || e.deleted > 0) {
              progress.info(
                `synced edge rules on PZ ${e.pullZoneId}: +${e.added} added, ~${e.updated} updated, -${e.deleted} deleted`,
              );
            }
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
