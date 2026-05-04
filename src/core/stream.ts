// core/stream - typed wrappers for Stream library + video CRUD. UI-free.
// Library CRUD uses account scope. Video CRUD uses per-library scope.

import { readFile } from 'node:fs/promises';
import { createStreamClient } from '../api/stream.js';
import type { Video, VideoLibrary } from '../api/stream.js';
import { resolveCredential } from '../config/credential-resolver.js';

function client() {
  return createStreamClient({ resolveCredential: (s) => resolveCredential(s) });
}

export async function listLibraries(): Promise<VideoLibrary[]> {
  return client().listLibraries();
}

export async function getLibrary(id: number): Promise<VideoLibrary> {
  return client().getLibrary(id);
}

export async function createLibrary(name: string, replicationRegions?: string[]): Promise<VideoLibrary> {
  return client().createLibrary(name, replicationRegions);
}

export async function deleteLibrary(id: number): Promise<void> {
  await client().deleteLibrary(id);
}

export async function listVideos(libraryId: string | number, collection?: string): Promise<Video[]> {
  const r = await client().listVideos(libraryId, collection ? { collection } : undefined);
  return r.items ?? [];
}

export type UploadResult = { guid: string; bytes: number };

// Two-step upload: create video metadata → PUT bytes.
export async function uploadVideo(
  libraryId: string | number,
  localPath: string,
  title?: string,
  collectionId?: string,
): Promise<UploadResult> {
  const c = client();
  const created = await c.createVideo(
    libraryId,
    title ?? localPath.split(/[/\\]/).pop() ?? 'video',
    collectionId,
  );
  const buf = await readFile(localPath);
  await c.uploadVideoBytes(libraryId, created.guid, buf);
  return { guid: created.guid, bytes: buf.length };
}

export async function deleteVideo(libraryId: string | number, videoGuid: string): Promise<void> {
  await client().deleteVideo(libraryId, videoGuid);
}
