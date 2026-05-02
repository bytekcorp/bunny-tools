import { describe, expect, it, vi } from 'vitest';
import { createHttpClient, type AuthScope } from '../../src/api/http.js';
import { AuthError, BunnyApiError } from '../../src/api/errors.js';

const ACCOUNT_SCOPE: AuthScope = { kind: 'account' };
const BASE = 'https://api.example.test';

function fakeFetcher(
  responses: Array<{
    status: number;
    body?: unknown;
    headers?: Record<string, string>;
  }>,
) {
  let i = 0;
  return vi.fn(async () => {
    const r = responses[i++];
    if (!r) throw new Error('fetcher: ran out of programmed responses');
    const body = r.body === undefined ? '' : typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return {
      statusCode: r.status,
      headers: r.headers ?? {},
      body: {
        text: async () => body,
        arrayBuffer: async () => new TextEncoder().encode(body).buffer,
      },
    } as never;
  });
}

describe('createHttpClient', () => {
  it('returns parsed JSON on 200', async () => {
    const fetcher = fakeFetcher([{ status: 200, body: { ok: true } }]);
    const client = createHttpClient({
      resolveCredential: async () => 'k',
      fetcher,
      sleep: async () => {},
    });
    const r = await client.callBunny<{ ok: boolean }>({
      base: BASE,
      path: '/x',
      scope: ACCOUNT_SCOPE,
    });
    expect(r).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('throws AuthError on 401 without retry', async () => {
    const fetcher = fakeFetcher([{ status: 401, body: { Message: 'bad key' } }]);
    const client = createHttpClient({
      resolveCredential: async () => 'k',
      fetcher,
      sleep: async () => {},
    });
    await expect(
      client.callBunny({ base: BASE, path: '/x', scope: ACCOUNT_SCOPE }),
    ).rejects.toBeInstanceOf(AuthError);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('retries on 429 honoring Retry-After then succeeds', async () => {
    const fetcher = fakeFetcher([
      { status: 429, headers: { 'retry-after': '0' } },
      { status: 200, body: { ok: 1 } },
    ]);
    const sleep = vi.fn(async () => {});
    const client = createHttpClient({
      resolveCredential: async () => 'k',
      fetcher,
      sleep,
    });
    const r = await client.callBunny<{ ok: number }>({
      base: BASE,
      path: '/x',
      scope: ACCOUNT_SCOPE,
    });
    expect(r).toEqual({ ok: 1 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it('retries on 503 then succeeds', async () => {
    const fetcher = fakeFetcher([
      { status: 503 },
      { status: 200, body: { ok: 1 } },
    ]);
    const client = createHttpClient({
      resolveCredential: async () => 'k',
      fetcher,
      sleep: async () => {},
    });
    const r = await client.callBunny({ base: BASE, path: '/x', scope: ACCOUNT_SCOPE });
    expect(r).toEqual({ ok: 1 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('throws BunnyApiError after exhausting retries', async () => {
    const fetcher = fakeFetcher(
      Array.from({ length: 6 }, () => ({ status: 429, body: { Message: 'slow down' } })),
    );
    const client = createHttpClient({
      resolveCredential: async () => 'k',
      fetcher,
      sleep: async () => {},
    });
    await expect(
      client.callBunny({
        base: BASE,
        path: '/x',
        scope: ACCOUNT_SCOPE,
        retry: { max: 5, baseMs: 1 },
      }),
    ).rejects.toBeInstanceOf(BunnyApiError);
  });

  it('throws AuthError when resolver returns empty', async () => {
    const fetcher = fakeFetcher([{ status: 200, body: {} }]);
    const client = createHttpClient({
      resolveCredential: async () => '',
      fetcher,
      sleep: async () => {},
    });
    await expect(
      client.callBunny({ base: BASE, path: '/x', scope: ACCOUNT_SCOPE }),
    ).rejects.toBeInstanceOf(AuthError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns undefined on 204', async () => {
    const fetcher = fakeFetcher([{ status: 204 }]);
    const client = createHttpClient({
      resolveCredential: async () => 'k',
      fetcher,
      sleep: async () => {},
    });
    const r = await client.callBunny({ base: BASE, path: '/x', scope: ACCOUNT_SCOPE, method: 'POST' });
    expect(r).toBeUndefined();
  });

  it('parses Bunny error envelope on 400', async () => {
    const fetcher = fakeFetcher([
      { status: 400, body: { ErrorKey: 'pullzone.not_found', Field: 'Id', Message: 'Not found' } },
    ]);
    const client = createHttpClient({
      resolveCredential: async () => 'k',
      fetcher,
      sleep: async () => {},
    });
    try {
      await client.callBunny({ base: BASE, path: '/x', scope: ACCOUNT_SCOPE });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BunnyApiError);
      const e = err as BunnyApiError;
      expect(e.status).toBe(400);
      expect(e.errorKey).toBe('pullzone.not_found');
      expect(e.field).toBe('Id');
      expect(e.message).toBe('Not found');
    }
  });
});
