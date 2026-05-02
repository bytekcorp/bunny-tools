// Bounded promise pool for parallel uploads. Per-file errors collected
// rather than aborting the run; caller decides how to surface them.

export type UploadJob<T = void> = () => Promise<T>;

export type UploadResult<T = void> = {
  ok: true;
  index: number;
  value: T;
} | {
  ok: false;
  index: number;
  error: Error;
};

export type RunPoolOptions = {
  concurrency: number;
  onProgress?: (completed: number, total: number) => void;
};

export async function runPool<T>(
  jobs: UploadJob<T>[],
  opts: RunPoolOptions,
): Promise<UploadResult<T>[]> {
  const results = new Array<UploadResult<T>>(jobs.length);
  let nextIndex = 0;
  let completed = 0;
  const concurrency = Math.max(1, Math.min(opts.concurrency, jobs.length || 1));

  async function worker(): Promise<void> {
    for (;;) {
      const i = nextIndex++;
      if (i >= jobs.length) return;
      const job = jobs[i];
      if (!job) return;
      try {
        const value = await job();
        results[i] = { ok: true, index: i, value };
      } catch (err) {
        results[i] = { ok: false, index: i, error: err as Error };
      }
      completed++;
      opts.onProgress?.(completed, jobs.length);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

export function summarizeResults<T>(results: UploadResult<T>[]): {
  ok: number;
  failed: number;
  errors: Array<{ index: number; error: Error }>;
} {
  const errors: Array<{ index: number; error: Error }> = [];
  let ok = 0;
  for (const r of results) {
    if (r.ok) ok++;
    else errors.push({ index: r.index, error: r.error });
  }
  return { ok, failed: errors.length, errors };
}
