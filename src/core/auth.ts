// core/auth — scope helpers + thin profile-aware wrappers around the resolver.
// CLI commands and MCP tools use these. UI-free.

import type { AuthScope } from '../api/http.js';
import {
  clearCredential,
  getActiveProfile,
  listScopesInProfile,
  maskCredential,
  resolveCredential,
  scopeToAccount,
  setCredential,
} from '../config/credential-resolver.js';

export type StoredScope = {
  scope: string;
  storedIn: 'env' | 'keychain' | 'file' | 'unknown';
  masked: string;
};

export async function setKey(
  scope: AuthScope,
  value: string,
  opts: { profile?: string } = {},
): Promise<{ storedIn: 'keychain' | 'file'; profile: string }> {
  if (!value || value.length === 0) {
    throw new Error('Cannot store empty credential.');
  }
  return setCredential(scope, value, opts);
}

export async function clearKey(scope: AuthScope, opts: { profile?: string } = {}): Promise<void> {
  return clearCredential(scope, opts);
}

// List scopes stored in the given profile (or active if omitted).
export async function listScopes(profile?: string): Promise<StoredScope[]> {
  const p = profile ?? (await getActiveProfile());
  const accounts = await listScopesInProfile(p);
  const out: StoredScope[] = [];
  for (const account of accounts) {
    const scope = parseAccountString(account);
    if (!scope) continue;
    try {
      const value = await resolveCredential(scope, { profile: p });
      out.push({
        scope: scopeToAccount(scope),
        storedIn: 'unknown',
        masked: maskCredential(value),
      });
    } catch {
      // skip unresolvable
    }
  }
  return out;
}

// "storage:my-zone" / "stream:42" / "account" / "database:main" → AuthScope.
export function parseAccountString(raw: string): AuthScope | null {
  if (raw === 'account') return { kind: 'account' };
  const idx = raw.indexOf(':');
  if (idx < 0) return null;
  const kind = raw.slice(0, idx);
  const id = raw.slice(idx + 1);
  if (id.length === 0) return null;
  if (kind === 'storage') return { kind: 'storage', zone: id };
  if (kind === 'stream') return { kind: 'stream', libraryId: id };
  if (kind === 'database') return { kind: 'database', name: id };
  return null;
}

export function parseScopeFlag(scopeFlag: string): AuthScope {
  const parsed = parseAccountString(scopeFlag);
  if (!parsed) {
    throw new Error(
      `Invalid --scope value "${scopeFlag}". Use one of: account, storage:<zone>, stream:<lib>, database:<name>.`,
    );
  }
  return parsed;
}
