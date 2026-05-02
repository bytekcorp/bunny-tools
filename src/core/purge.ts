// core/purge — dispatch purge requests to the account API. UI-free.

import { createAccountClient } from '../api/account.js';
import type { AccountClient } from '../api/account.js';
import { resolveCredential } from '../config/credential-resolver.js';

export type PurgeTarget =
  | { kind: 'url'; url: string }
  | { kind: 'tag'; pullZoneId: number; tag: string }
  | { kind: 'pullzone'; pullZoneId: number }
  | { kind: 'all'; pullZoneIds: number[] };

export type PurgeResult = {
  ok: number;
  failed: Array<{ target: string; error: string }>;
};

export function parsePurgeArg(raw: string): PurgeTarget {
  if (raw === 'all') {
    throw new Error('`all` purge requires a pullzone context; use `pullzone:<id>` or configure pullZones in bunny.json.');
  }
  if (raw.startsWith('tag:')) {
    throw new Error('Tag purge requires a pullzone context; use `--purge=tag:<name>` inside `bunny deploy`.');
  }
  // Accept both new `pullzone:` and legacy `pull-zone:` to ease migration mid-session.
  const pzPrefix = raw.startsWith('pullzone:') ? 'pullzone:' : raw.startsWith('pull-zone:') ? 'pull-zone:' : null;
  if (pzPrefix) {
    const id = Number.parseInt(raw.slice(pzPrefix.length), 10);
    if (!Number.isFinite(id)) throw new Error(`Invalid pullzone id in "${raw}".`);
    return { kind: 'pullzone', pullZoneId: id };
  }
  if (/^https?:\/\//.test(raw)) return { kind: 'url', url: raw };
  throw new Error(`Unrecognized purge target "${raw}". Expected URL or "pullzone:<id>".`);
}

// High-level entry used by `bunny purge` command — instantiates its own client
// so the command layer doesn't need to import src/api/* directly.
export async function runPurgeCommand(target: PurgeTarget): Promise<PurgeResult> {
  const client = createAccountClient({ resolveCredential: (s) => resolveCredential(s) });
  return runPurge(client, target);
}

export async function runPurge(
  client: AccountClient,
  target: PurgeTarget,
): Promise<PurgeResult> {
  const failed: PurgeResult['failed'] = [];
  let ok = 0;

  async function safe(label: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
      ok++;
    } catch (err) {
      failed.push({ target: label, error: (err as Error).message });
    }
  }

  switch (target.kind) {
    case 'url':
      await safe(target.url, () => client.purgeByUrl(target.url));
      break;
    case 'tag':
      await safe(`pull-zone:${target.pullZoneId} tag=${target.tag}`, () =>
        client.purgePullZoneByTag(target.pullZoneId, target.tag),
      );
      break;
    case 'pullzone':
      await safe(`pull-zone:${target.pullZoneId}`, () => client.purgePullZone(target.pullZoneId));
      break;
    case 'all':
      for (const id of target.pullZoneIds) {
        await safe(`pull-zone:${id}`, () => client.purgePullZone(id));
      }
      break;
  }

  return { ok, failed };
}
