// Stream API client. Two endpoints:
// - https://api.bunny.net (account scope) - library CRUD
// - https://video.bunnycdn.com (per-library scope `stream:<libraryId>`) - video CRUD

import type { CredentialResolver } from './http.js';
import { createHttpClient } from './http.js';

const ACCOUNT_BASE = 'https://api.bunny.net';
const VIDEO_BASE = 'https://video.bunnycdn.com';

export type VideoLibrary = {
  Id: number;
  Name: string;
  ApiKey?: string;
  ReadOnlyApiKey?: string;
  StorageZoneId?: number;
  PullZoneId?: number;
  DateCreated?: string;
};

export type Video = {
  guid: string;
  title: string;
  dateUploaded: string;
  views: number;
  isPublic: boolean;
  length: number;
  status: number;
  framerate: number;
  width: number;
  height: number;
};

export type StreamClientOptions = {
  resolveCredential: CredentialResolver;
};

export function createStreamClient(opts: StreamClientOptions) {
  const { callBunny } = createHttpClient({ resolveCredential: opts.resolveCredential });

  // Account-scoped: library CRUD lives on api.bunny.net.
  async function listAllLibraries(): Promise<VideoLibrary[]> {
    const out: VideoLibrary[] = [];
    let page = 1;
    for (;;) {
      const res = await callBunny<{ Items: VideoLibrary[]; HasMoreItems: boolean }>({
        base: ACCOUNT_BASE,
        path: '/videolibrary',
        scope: { kind: 'account' },
        query: { page, perPage: 1000 },
      });
      out.push(...(res.Items ?? []));
      if (!res.HasMoreItems) return out;
      page++;
      if (page > 100) throw new Error('Pagination runaway on /videolibrary');
    }
  }

  return {
    listLibraries: () => listAllLibraries(),
    getLibrary: (id: number) =>
      callBunny<VideoLibrary>({
        base: ACCOUNT_BASE,
        path: `/videolibrary/${id}`,
        scope: { kind: 'account' },
      }),
    createLibrary: (name: string, replicationRegions?: string[]) =>
      callBunny<VideoLibrary>({
        base: ACCOUNT_BASE,
        path: '/videolibrary',
        method: 'POST',
        scope: { kind: 'account' },
        body: {
          Name: name,
          ...(replicationRegions ? { ReplicationRegions: replicationRegions } : {}),
        },
      }),
    deleteLibrary: (id: number) =>
      callBunny<void>({
        base: ACCOUNT_BASE,
        path: `/videolibrary/${id}`,
        method: 'DELETE',
        scope: { kind: 'account' },
      }),

    // Per-library scope: video CRUD lives on video.bunnycdn.com.
    listVideos: (libraryId: string | number, opts?: { collection?: string }) =>
      callBunny<{ items: Video[]; totalItems: number }>({
        base: VIDEO_BASE,
        path: `/library/${libraryId}/videos`,
        scope: { kind: 'stream', libraryId: String(libraryId) },
        query: { ...(opts?.collection ? { collection: opts.collection } : {}), page: 1, itemsPerPage: 1000 },
      }),
    createVideo: (libraryId: string | number, title: string, collectionId?: string) =>
      callBunny<{ guid: string }>({
        base: VIDEO_BASE,
        path: `/library/${libraryId}/videos`,
        method: 'POST',
        scope: { kind: 'stream', libraryId: String(libraryId) },
        body: { title, ...(collectionId ? { collectionId } : {}) },
      }),
    uploadVideoBytes: (libraryId: string | number, videoGuid: string, body: Buffer) =>
      callBunny<void>({
        base: VIDEO_BASE,
        path: `/library/${libraryId}/videos/${videoGuid}`,
        method: 'PUT',
        scope: { kind: 'stream', libraryId: String(libraryId) },
        body,
        contentType: 'application/octet-stream',
      }),
    deleteVideo: (libraryId: string | number, videoGuid: string) =>
      callBunny<void>({
        base: VIDEO_BASE,
        path: `/library/${libraryId}/videos/${videoGuid}`,
        method: 'DELETE',
        scope: { kind: 'stream', libraryId: String(libraryId) },
      }),
  };
}

export type StreamClient = ReturnType<typeof createStreamClient>;
