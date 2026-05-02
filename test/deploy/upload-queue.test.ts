import { describe, expect, it, vi } from 'vitest';
import { runPool, summarizeResults } from '../../src/deploy/upload-queue.js';

describe('runPool', () => {
  it('runs all jobs and returns ordered results', async () => {
    const jobs = [1, 2, 3, 4, 5].map((n) => async () => n * 2);
    const results = await runPool(jobs, { concurrency: 2 });
    expect(results.map((r) => (r.ok ? r.value : -1))).toEqual([2, 4, 6, 8, 10]);
  });

  it('caps concurrency', async () => {
    let active = 0;
    let peak = 0;
    const jobs = Array.from({ length: 10 }, () => async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    await runPool(jobs, { concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('captures per-job errors without aborting siblings', async () => {
    const jobs = [
      async () => 'ok',
      async () => {
        throw new Error('boom');
      },
      async () => 'fine',
    ];
    const results = await runPool(jobs, { concurrency: 3 });
    expect(results[0]?.ok).toBe(true);
    expect(results[1]?.ok).toBe(false);
    expect(results[2]?.ok).toBe(true);
  });

  it('summarizeResults aggregates ok/failed counts', async () => {
    const results = await runPool(
      [async () => 'a', async () => { throw new Error('x'); }, async () => 'b'],
      { concurrency: 2 },
    );
    const sum = summarizeResults(results);
    expect(sum.ok).toBe(2);
    expect(sum.failed).toBe(1);
    expect(sum.errors[0]?.error.message).toBe('x');
  });

  it('emits onProgress callbacks', async () => {
    const progress = vi.fn();
    await runPool(
      [async () => 1, async () => 2, async () => 3],
      { concurrency: 2, onProgress: progress },
    );
    expect(progress).toHaveBeenCalledTimes(3);
    expect(progress).toHaveBeenLastCalledWith(3, 3);
  });
});
