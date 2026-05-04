import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createLibrary,
  deleteLibrary,
  deleteVideo,
  listLibraries,
  listVideos,
  uploadVideo,
} from '../../src/core/stream.js';
import { getMockAgent } from '../setup.js';

describe('core/stream', () => {
  let scratch: string;
  let envBackup: Record<string, string | undefined> = {};

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'stream-'));
    envBackup['XDG_CONFIG_HOME'] = process.env['XDG_CONFIG_HOME'];
    envBackup['BUNNY_API_KEY'] = process.env['BUNNY_API_KEY'];
    envBackup['BUNNY_STREAM_KEY'] = process.env['BUNNY_STREAM_KEY'];
    envBackup['BUNNY_STREAM_KEY_42'] = process.env['BUNNY_STREAM_KEY_42'];
    process.env['XDG_CONFIG_HOME'] = scratch;
    process.env['BUNNY_API_KEY'] = 'acct';
    process.env['BUNNY_STREAM_KEY'] = 'stream-default';
    process.env['BUNNY_STREAM_KEY_42'] = 'stream-lib-42';
  });

  afterEach(async () => {
    for (const [k, v] of Object.entries(envBackup)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    envBackup = {};
    await rm(scratch, { recursive: true, force: true });
  });

  it('listLibraries paginates from /videolibrary', async () => {
    getMockAgent()
      .get('https://api.bunny.net')
      .intercept({ path: /\/videolibrary.*/, method: 'GET' })
      .reply(200, {
        Items: [
          { Id: 1, Name: 'main' },
          { Id: 2, Name: 'archive' },
        ],
        HasMoreItems: false,
      });
    const libs = await listLibraries();
    expect(libs).toHaveLength(2);
    expect(libs[0]?.Name).toBe('main');
  });

  it('createLibrary POSTs name (and replication) to /videolibrary', async () => {
    getMockAgent()
      .get('https://api.bunny.net')
      .intercept({ path: '/videolibrary', method: 'POST' })
      .reply(201, { Id: 99, Name: 'created' });
    const lib = await createLibrary('created', ['ny', 'la']);
    expect(lib.Id).toBe(99);
  });

  it('deleteLibrary DELETEs by id', async () => {
    getMockAgent()
      .get('https://api.bunny.net')
      .intercept({ path: '/videolibrary/7', method: 'DELETE' })
      .reply(204, '');
    await expect(deleteLibrary(7)).resolves.toBeUndefined();
  });

  it('listVideos hits video.bunnycdn.com with per-library scope', async () => {
    getMockAgent()
      .get('https://video.bunnycdn.com')
      .intercept({ path: /\/library\/42\/videos.*/, method: 'GET' })
      .reply(200, { items: [{ guid: 'a', title: 't', dateUploaded: '', views: 0, isPublic: true, length: 0, status: 4, framerate: 30, width: 1920, height: 1080 }], totalItems: 1 });
    const videos = await listVideos(42);
    expect(videos).toHaveLength(1);
    expect(videos[0]?.guid).toBe('a');
  });

  it('uploadVideo creates then uploads bytes', async () => {
    const file = join(scratch, 'tiny.mp4');
    await writeFile(file, Buffer.from('fake-video-bytes'));
    const pool = getMockAgent().get('https://video.bunnycdn.com');
    pool.intercept({ path: '/library/42/videos', method: 'POST' }).reply(201, { guid: 'new-guid' });
    pool.intercept({ path: '/library/42/videos/new-guid', method: 'PUT' }).reply(200, '');
    const r = await uploadVideo(42, file, 'title-a');
    expect(r.guid).toBe('new-guid');
    expect(r.bytes).toBe(16);
  });

  it('deleteVideo DELETEs by guid', async () => {
    getMockAgent()
      .get('https://video.bunnycdn.com')
      .intercept({ path: '/library/42/videos/g', method: 'DELETE' })
      .reply(204, '');
    await expect(deleteVideo(42, 'g')).resolves.toBeUndefined();
  });
});
