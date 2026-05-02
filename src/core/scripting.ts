// core/scripting — Edge Scripting (Bunny Compute) CRUD. UI-free.

import { readFile } from 'node:fs/promises';
import { createAccountClient } from '../api/account.js';
import type { EdgeScript } from '../api/account.js';
import { resolveCredential } from '../config/credential-resolver.js';

function client() {
  return createAccountClient({ resolveCredential: (s) => resolveCredential(s) });
}

export async function listScripts(): Promise<EdgeScript[]> {
  return client().listEdgeScripts();
}

export async function getScript(id: number): Promise<EdgeScript> {
  return client().getEdgeScript(id);
}

// Deploy reads a local source file and creates (or updates) the script.
// If `id` is provided, updates that script's code; otherwise creates new.
export async function deployScript(opts: {
  name: string;
  filePath: string;
  scriptType?: number;
  id?: number;
}): Promise<EdgeScript> {
  const code = await readFile(opts.filePath, 'utf8');
  const c = client();
  if (opts.id !== undefined) {
    return c.updateEdgeScriptCode(opts.id, { Code: code });
  }
  return c.createEdgeScript({
    Name: opts.name,
    Code: code,
    ...(opts.scriptType !== undefined ? { ScriptType: opts.scriptType } : {}),
  });
}

export async function deleteScript(id: number): Promise<void> {
  await client().deleteEdgeScript(id);
}
