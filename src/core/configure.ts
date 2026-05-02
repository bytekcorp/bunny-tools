// core/configure — aws-style guided global setup.
// UI-free: takes a `prompt` callback for interactive input. CLI wires real prompts;
// tests inject deterministic answers.

import { setCredential } from '../config/credential-resolver.js';
import { createAccountClient } from '../api/account.js';
import { resolveCredential } from '../config/credential-resolver.js';
import { AuthError } from '../api/errors.js';

export type ConfigureInput = {
  accountKey?: string;
  storageZone?: string;
  storagePassword?: string;
  pullZoneId?: number;
  streamLibraryId?: string;
  streamKey?: string;
};

export type ConfigureCallbacks = {
  /** Read input. Mode 'mask' should not echo the value. */
  ask: (q: { name: string; message: string; mode: 'plain' | 'mask' }) => Promise<string>;
  /** Pick from a list. Returns the chosen value. */
  pick: (q: { name: string; message: string; choices: Array<{ value: string; label: string }> }) => Promise<string>;
  /** Confirm yes/no. */
  confirm: (q: { message: string; default: boolean }) => Promise<boolean>;
  /** Best-effort status updates for the user. */
  notify?: (msg: string) => void;
};

export type ConfigureResult = {
  storedScopes: string[];
  /** Recommended bunny.json bootstrap derived from picks. */
  suggestedBunnyJson: {
    deploy: {
      publicDir: string;
      storageZone: string;
      pullZones: Array<{ id: number; purge: 'all' }>;
    };
  } | null;
};

export async function runConfigure(
  input: ConfigureInput,
  cb: ConfigureCallbacks,
  options: { interactive: boolean } = { interactive: true },
): Promise<ConfigureResult> {
  // Step 1 — account key.
  const accountKey =
    input.accountKey ??
    (options.interactive
      ? await cb.ask({ name: 'accountKey', message: 'Bunny account API key', mode: 'mask' })
      : undefined);
  if (!accountKey) throw new AuthError('Account API key required (--account-key or interactive).');
  await setCredential({ kind: 'account' }, accountKey);
  cb.notify?.('Account key stored.');

  // Step 2 — validate by listing zones.
  const acct = createAccountClient({ resolveCredential });
  const zones = await acct.listStorageZones();
  cb.notify?.(`Validated: account has ${zones.length} storage zone(s).`);

  // Step 3 — choose default storage zone.
  let storageZone = input.storageZone;
  if (!storageZone && options.interactive) {
    if (zones.length === 0) {
      storageZone = await cb.ask({
        name: 'storageZone',
        message: 'No zones found on account. Storage zone name to provision later',
        mode: 'plain',
      });
    } else {
      storageZone = await cb.pick({
        name: 'storageZone',
        message: 'Default storage zone',
        choices: zones.map((z) => ({ value: z.Name, label: `${z.Name} (region=${z.Region}, files=${z.FilesStored})` })),
      });
    }
  }
  if (!storageZone) {
    return { storedScopes: ['account'], suggestedBunnyJson: null };
  }

  // Step 4 — storage password.
  const storagePassword =
    input.storagePassword ??
    (options.interactive
      ? await cb.ask({
          name: 'storagePassword',
          message: `Storage zone password for "${storageZone}"`,
          mode: 'mask',
        })
      : undefined);
  const storedScopes = ['account'];
  if (storagePassword) {
    await setCredential({ kind: 'storage', zone: storageZone }, storagePassword);
    storedScopes.push(`storage:${storageZone}`);
    cb.notify?.(`Storage zone password stored for ${storageZone}.`);
  }

  // Step 5 — optional pull zone.
  let pullZoneId = input.pullZoneId;
  if (pullZoneId === undefined && options.interactive) {
    const pullZones = await acct.listPullZones();
    const matched = pullZones.filter((p) => p.Name === storageZone || p.Name.includes(storageZone!));
    const candidates = matched.length > 0 ? matched : pullZones;
    if (candidates.length > 0) {
      const wantPick = await cb.confirm({
        message: `Set a default pull zone? (${candidates.length} candidate${candidates.length === 1 ? '' : 's'})`,
        default: candidates.length === 1,
      });
      if (wantPick) {
        const choice = await cb.pick({
          name: 'pullZone',
          message: 'Default pull zone',
          choices: candidates.map((p) => ({ value: String(p.Id), label: `${p.Name} (id=${p.Id})` })),
        });
        pullZoneId = Number.parseInt(choice, 10);
      }
    }
  }

  // Step 6 — optional stream.
  if (input.streamLibraryId && input.streamKey) {
    await setCredential({ kind: 'stream', libraryId: input.streamLibraryId }, input.streamKey);
    storedScopes.push(`stream:${input.streamLibraryId}`);
  }

  return {
    storedScopes,
    suggestedBunnyJson: {
      deploy: {
        publicDir: 'dist',
        storageZone,
        pullZones: pullZoneId !== undefined ? [{ id: pullZoneId, purge: 'all' }] : [],
      },
    },
  };
}
