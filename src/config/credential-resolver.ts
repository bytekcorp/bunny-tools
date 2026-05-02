// Credential-resolver chain: flag → scoped env → generic env → OS keychain → JSON file → prompt.
// This module reads/writes the *location* of credentials at runtime; it never embeds them.

import { atomicWriteJson, readJsonOrNull } from '../util/fs.js';
import { logger } from '../util/logger.js';
import { configDir, credentialsFile } from '../util/paths.js';
import { AuthError } from '../api/errors.js';
import type { AuthScope } from '../api/http.js';

const KEYCHAIN_SERVICE = 'bunny-tools';

// Lazy keytar import — keytar is a native module, optional at runtime.
async function loadKeytar(): Promise<KeytarLike | null> {
  try {
    const mod = await import('keytar');
    const keytar =
      (mod as unknown as { default?: KeytarLike }).default ?? (mod as unknown as KeytarLike);
    return keytar;
  } catch (err) {
    logger.debug(`keytar unavailable; falling back to file storage: ${(err as Error).message}`);
    return null;
  }
}

type KeytarLike = {
  setPassword: (service: string, account: string, value: string) => Promise<void>;
  getPassword: (service: string, account: string) => Promise<string | null>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
  findCredentials: (service: string) => Promise<Array<{ account: string; password: string }>>;
};

export function scopeToAccount(scope: AuthScope): string {
  switch (scope.kind) {
    case 'account':
      return 'account';
    case 'storage':
      return `storage:${scope.zone}`;
    case 'stream':
      return `stream:${scope.libraryId}`;
    case 'database':
      return `database:${scope.name}`;
  }
}

// Sanitize a scope identifier into an env-var-safe suffix.
// All non-[A-Z0-9] characters become `_`, including separators. We deliberately
// emit `_x{N}` for any `_` runs longer than 1 to avoid collisions like `my-app`
// and `my_app` both becoming `MY_APP`.
export function envVarSuffix(raw: string): string {
  const upper = raw.toUpperCase();
  let out = '';
  let runLen = 0;
  for (const ch of upper) {
    const safe = /[A-Z0-9]/.test(ch) ? ch : '_';
    if (safe === '_') {
      runLen++;
    } else {
      if (runLen > 0) {
        out += runLen === 1 ? '_' : `_X${runLen}`;
      }
      out += ch;
      runLen = 0;
    }
  }
  if (runLen > 0) out += runLen === 1 ? '_' : `_X${runLen}`;
  return out;
}

export function scopeToEnvVars(scope: AuthScope): string[] {
  switch (scope.kind) {
    case 'account':
      return ['BUNNY_ACCOUNT_KEY'];
    case 'storage':
      return [`BUNNY_STORAGE_PASSWORD_${envVarSuffix(scope.zone)}`, 'BUNNY_STORAGE_PASSWORD'];
    case 'stream':
      return [`BUNNY_STREAM_KEY_${envVarSuffix(scope.libraryId)}`, 'BUNNY_STREAM_KEY'];
    case 'database':
      return [`BUNNY_DATABASE_KEY_${envVarSuffix(scope.name)}`];
  }
}

export type ResolverOverrides = {
  flag?: string;
  prompt?: (scope: AuthScope) => Promise<string>;
  keytar?: KeytarLike | null;
};

type FileStore = Record<string, string>;

async function readFileStore(): Promise<FileStore> {
  const data = await readJsonOrNull<FileStore>(credentialsFile());
  return data ?? {};
}

export async function resolveCredential(
  scope: AuthScope,
  overrides: ResolverOverrides = {},
): Promise<string> {
  // 1) Explicit flag override.
  if (overrides.flag && overrides.flag.length > 0) return overrides.flag;

  // 2) Env vars (scoped first, then generic fallback).
  for (const name of scopeToEnvVars(scope)) {
    const v = process.env[name];
    if (v && v.length > 0) return v;
  }

  // 3) Keychain.
  const keytar = overrides.keytar !== undefined ? overrides.keytar : await loadKeytar();
  if (keytar) {
    try {
      const v = await keytar.getPassword(KEYCHAIN_SERVICE, scopeToAccount(scope));
      if (v && v.length > 0) return v;
    } catch (err) {
      logger.debug(`keychain read failed: ${(err as Error).message}`);
    }
  }

  // 4) File store.
  const store = await readFileStore();
  const fileVal = store[scopeToAccount(scope)];
  if (fileVal && fileVal.length > 0) return fileVal;

  // 5) Interactive prompt (TTY only).
  if (overrides.prompt && process.stdin.isTTY) {
    return overrides.prompt(scope);
  }

  throw new AuthError(
    `No credential found for scope ${scopeToAccount(scope)}. ` +
      `Set one via \`bunny auth set\` or env var (${scopeToEnvVars(scope).join(', ')}).`,
  );
}

export async function setCredential(
  scope: AuthScope,
  value: string,
  overrides: { keytar?: KeytarLike | null } = {},
): Promise<{ storedIn: 'keychain' | 'file' }> {
  const keytar = overrides.keytar !== undefined ? overrides.keytar : await loadKeytar();
  if (keytar) {
    try {
      await keytar.setPassword(KEYCHAIN_SERVICE, scopeToAccount(scope), value);
      return { storedIn: 'keychain' };
    } catch (err) {
      logger.debug(`keychain write failed; falling back to file: ${(err as Error).message}`);
    }
  }
  const store = await readFileStore();
  store[scopeToAccount(scope)] = value;
  await atomicWriteJson(credentialsFile(), store, { mode: 0o600 });
  return { storedIn: 'file' };
}

export async function clearCredential(
  scope: AuthScope,
  overrides: { keytar?: KeytarLike | null } = {},
): Promise<void> {
  const keytar = overrides.keytar !== undefined ? overrides.keytar : await loadKeytar();
  if (keytar) {
    try {
      await keytar.deletePassword(KEYCHAIN_SERVICE, scopeToAccount(scope));
    } catch (err) {
      logger.debug(`keychain delete failed: ${(err as Error).message}`);
    }
  }
  const store = await readFileStore();
  delete store[scopeToAccount(scope)];
  await atomicWriteJson(credentialsFile(), store, { mode: 0o600 });
}

export function maskCredential(value: string): string {
  if (value.length <= 4) return '***';
  return `***${value.slice(-4)}`;
}

export async function listCredentialScopes(
  overrides: { keytar?: KeytarLike | null } = {},
): Promise<string[]> {
  const found = new Set<string>();
  const keytar = overrides.keytar !== undefined ? overrides.keytar : await loadKeytar();
  if (keytar) {
    try {
      const creds = await keytar.findCredentials(KEYCHAIN_SERVICE);
      for (const c of creds) found.add(c.account);
    } catch (err) {
      logger.debug(`keychain list failed: ${(err as Error).message}`);
    }
  }
  const store = await readFileStore();
  for (const k of Object.keys(store)) found.add(k);
  return [...found].sort();
}

export const _internal = { configDir, credentialsFile, KEYCHAIN_SERVICE };
