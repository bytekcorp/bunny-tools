// core/auth — typed wrappers around the credential resolver. UI-free.
// CLI commands and (later) MCP tools both call into these.

import type { AuthScope } from '../api/http.js';
import {
  clearCredential,
  listCredentialScopes,
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

export async function setKey(scope: AuthScope, value: string): Promise<{ storedIn: 'keychain' | 'file' }> {
  if (!value || value.length === 0) {
    throw new Error('Cannot store empty credential.');
  }
  return setCredential(scope, value);
}

export async function clearKey(scope: AuthScope): Promise<void> {
  return clearCredential(scope);
}

export async function listScopes(): Promise<StoredScope[]> {
  const accounts = await listCredentialScopes();
  const out: StoredScope[] = [];
  for (const account of accounts) {
    const scope = parseAccountString(account);
    if (!scope) continue;
    try {
      const value = await resolveCredential(scope);
      out.push({
        scope: scopeToAccount(scope),
        storedIn: 'unknown',
        masked: maskCredential(value),
      });
    } catch {
      // Skip scopes that can't be resolved (e.g. transient keychain issues).
    }
  }
  return out;
}

// Parse "storage:my-zone" / "stream:42" / "account" / "database:main" back to AuthScope.
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
