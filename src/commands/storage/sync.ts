// `storage:sync` — thin sync of a local dir to a storage zone, no purge.
// Reuses the walk + parallel-upload primitives from src/deploy/.

import type { ParsedInvocation } from '../../manifest/types.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { walkPublicDir } from '../../deploy/walk.js';
import { runPool, summarizeResults } from '../../deploy/upload-queue.js';
import { contentTypeFor } from '../../util/content-type.js';
import { uploadFile } from '../../core/storage-ops.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { local?: string; remote?: string };
  const flags = inv.flags as { zone?: string; region?: string; concurrency?: string; delete?: boolean };
  if (!args.local || !flags.zone) {
    progress.fail('Usage: bunny storage:sync <local> [remote] --zone=<name>');
    return 1;
  }
  const concurrency = flags.concurrency ? Number.parseInt(flags.concurrency, 10) : 8;
  const remoteRoot = (args.remote ?? '/').replace(/\/+$/, '');

  const files = await walkPublicDir({ publicDir: args.local });
  progress.info(`syncing ${files.length} files to ${flags.zone}:${remoteRoot}/`);

  const jobs = files.map((f) => async () => {
    const remote = `${remoteRoot}/${f.path}`.replace(/^\/+/, '/');
    // Reuse uploadFile so region resolution + auth is consistent.
    await uploadFile(flags.zone!, join(args.local!, f.path), remote, flags.region);
    // suppress unused-var warning if readFile/contentTypeFor unused at this layer:
    void readFile;
    void contentTypeFor;
  });

  const results = await runPool(jobs, {
    concurrency,
    onProgress: (c, t) => progress.update(`uploaded ${c}/${t}`),
  });
  const sum = summarizeResults(results);
  if (sum.failed > 0) {
    for (const e of sum.errors) progress.warn(`${files[e.index]?.path ?? '?'}: ${e.error.message}`);
    progress.fail(`Sync finished with ${sum.failed} failure(s).`);
    return 2;
  }
  progress.succeed(`Synced ${sum.ok} files.`);
  return 0;
}
