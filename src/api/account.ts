// Account API client (https://api.bunny.net). Account-scoped endpoints used
// by deploy + purge + zone CRUD. Always paginates page=1+, never page=0.

import type { CredentialResolver } from './http.js';
import { createHttpClient } from './http.js';

const BASE = 'https://api.bunny.net';

export type StorageZone = {
  Id: number;
  Name: string;
  Region: string;
  StorageUsed: number;
  FilesStored: number;
  ReplicationRegions: string[];
  PullZones: Array<{ Id: number; Name: string }>;
};

export type PullZone = {
  Id: number;
  Name: string;
  OriginUrl: string | null;
  Enabled: boolean;
  Hostnames: Array<{ Value: string }>;
};

export type AccountClientOptions = {
  resolveCredential: CredentialResolver;
  base?: string;
};

export function createAccountClient(opts: AccountClientOptions) {
  const { callBunny } = createHttpClient({ resolveCredential: opts.resolveCredential });
  const base = opts.base ?? BASE;

  // Generic paginator. Always uses page=1+ to avoid Bunny's `page=0` array footgun.
  async function listAll<T>(path: string, extraQuery: Record<string, string | number> = {}): Promise<T[]> {
    const out: T[] = [];
    let page = 1;
    for (;;) {
      const res = await callBunny<{ Items: T[]; HasMoreItems: boolean }>({
        base,
        path,
        scope: { kind: 'account' },
        query: { ...extraQuery, page, perPage: 1000 },
      });
      out.push(...(res.Items ?? []));
      if (!res.HasMoreItems) return out;
      page++;
      if (page > 100) throw new Error(`Pagination runaway on ${path}; aborted at page 100.`);
    }
  }

  return {
    listStorageZones: () => listAll<StorageZone>('/storagezone'),
    getStorageZoneByName: async (name: string): Promise<StorageZone | undefined> => {
      const zones = await listAll<StorageZone>('/storagezone', { search: name });
      return zones.find((z) => z.Name === name);
    },
    getStorageZone: (id: number) =>
      callBunny<StorageZone>({ base, path: `/storagezone/${id}`, scope: { kind: 'account' } }),
    createStorageZone: (body: { Name: string; Region?: string; ReplicationRegions?: string[]; ZoneTier?: number }) =>
      callBunny<StorageZone>({ base, path: '/storagezone', method: 'POST', scope: { kind: 'account' }, body }),
    deleteStorageZone: (id: number) =>
      callBunny<void>({ base, path: `/storagezone/${id}`, method: 'DELETE', scope: { kind: 'account' } }),
    updateStorageZone: (id: number, body: Record<string, unknown>) =>
      callBunny<StorageZone>({ base, path: `/storagezone/${id}`, method: 'POST', scope: { kind: 'account' }, body }),

    listPullZones: () => listAll<PullZone>('/pullzone'),
    getPullZone: (id: number) =>
      callBunny<PullZone>({ base, path: `/pullzone/${id}`, scope: { kind: 'account' } }),
    createPullZone: (body: { Name: string; OriginUrl: string }) =>
      callBunny<PullZone>({ base, path: '/pullzone', method: 'POST', scope: { kind: 'account' }, body }),
    updatePullZone: (id: number, body: Record<string, unknown>) =>
      callBunny<PullZone>({ base, path: `/pullzone/${id}`, method: 'POST', scope: { kind: 'account' }, body }),
    deletePullZone: (id: number) =>
      callBunny<void>({ base, path: `/pullzone/${id}`, method: 'DELETE', scope: { kind: 'account' } }),

    purgeByUrl: (url: string, async = false) =>
      callBunny<void>({
        base,
        path: '/purge',
        method: 'POST',
        scope: { kind: 'account' },
        query: { url, async },
      }),
    purgePullZoneByTag: (pullZoneId: number, cacheTag: string) =>
      callBunny<void>({
        base,
        path: `/pullzone/${pullZoneId}/purgeCache`,
        method: 'POST',
        scope: { kind: 'account' },
        body: { CacheTag: cacheTag },
      }),
    purgePullZone: (pullZoneId: number) =>
      callBunny<void>({
        base,
        path: `/pullzone/${pullZoneId}/purgeCache`,
        method: 'POST',
        scope: { kind: 'account' },
        body: {},
      }),

    // DNS
    listDnsZones: () => listAll<DnsZone>('/dnszone'),
    getDnsZone: (id: number) =>
      callBunny<DnsZone>({ base, path: `/dnszone/${id}`, scope: { kind: 'account' } }),
    createDnsZone: (domain: string) =>
      callBunny<DnsZone>({
        base,
        path: '/dnszone',
        method: 'POST',
        scope: { kind: 'account' },
        body: { Domain: domain },
      }),
    deleteDnsZone: (id: number) =>
      callBunny<void>({ base, path: `/dnszone/${id}`, method: 'DELETE', scope: { kind: 'account' } }),
    addDnsRecord: (zoneId: number, body: Record<string, unknown>) =>
      callBunny<DnsRecord>({
        base,
        path: `/dnszone/${zoneId}/records`,
        method: 'PUT',
        scope: { kind: 'account' },
        body,
      }),
    updateDnsRecord: (zoneId: number, recordId: number, body: Record<string, unknown>) =>
      callBunny<DnsRecord>({
        base,
        path: `/dnszone/${zoneId}/records/${recordId}`,
        method: 'POST',
        scope: { kind: 'account' },
        body,
      }),
    deleteDnsRecord: (zoneId: number, recordId: number) =>
      callBunny<void>({
        base,
        path: `/dnszone/${zoneId}/records/${recordId}`,
        method: 'DELETE',
        scope: { kind: 'account' },
      }),
  };
}

export type AccountClient = ReturnType<typeof createAccountClient>;

export type DnsZone = {
  Id: number;
  Domain: string;
  Records?: DnsRecord[];
};

export type DnsRecord = {
  Id: number;
  Type: number;
  Name: string;
  Value: string;
  Ttl?: number;
  Priority?: number;
  Weight?: number;
  Port?: number;
  Flags?: number;
  Tag?: string;
  Disabled?: boolean;
};

// Map Bunny's region-code response field to the storage-endpoint subdomain.
// Bunny returns codes like "DE", "NY"; storage subdomains are lowercase.
// Storage regions: ny, la, sg, syd, uk, se, br, jh.
export function regionCodeToSubdomain(code: string): string {
  const lower = code.toLowerCase();
  // Some legacy zones return "DE" → use as the default `storage.bunnycdn.com` (no subdomain prefix).
  // For unknown codes, return as-is and let the user override via bunny.json.deploy.region.
  if (lower === 'de' || lower === 'falkenstein') return ''; // primary endpoint
  return lower;
}

export function storageBaseUrl(region: string): string {
  const sub = region.length > 0 ? `${region}.` : '';
  return `https://${sub}storage.bunnycdn.com`;
}
