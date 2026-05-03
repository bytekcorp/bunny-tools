// core/zones — typed wrappers for storage-zone + pull-zone CRUD.
// Edge rules live inside pull-zone responses; mutate via list+update flow.

import { createAccountClient } from '../api/account.js';
import type { PullZone, StorageZone } from '../api/account.js';
import { resolveCredential } from '../config/credential-resolver.js';

function client() {
  return createAccountClient({ resolveCredential: (s) => resolveCredential(s) });
}

// Storage zones --------------------------------------------------------------

export async function listStorageZones(): Promise<StorageZone[]> {
  return client().listStorageZones();
}

export async function getStorageZone(idOrName: string | number): Promise<StorageZone> {
  if (typeof idOrName === 'number') return client().getStorageZone(idOrName);
  const found = await client().getStorageZoneByName(idOrName);
  if (!found) throw new Error(`Storage zone "${idOrName}" not found.`);
  return found;
}

export type StorageZoneCreateInput = {
  name: string;
  region?: string;
  replicationRegions?: string[];
  zoneTier?: number;
};

export async function createStorageZone(input: StorageZoneCreateInput): Promise<StorageZone> {
  return client().createStorageZone({
    Name: input.name,
    ...(input.region ? { Region: input.region } : {}),
    ...(input.replicationRegions ? { ReplicationRegions: input.replicationRegions } : {}),
    ...(input.zoneTier !== undefined ? { ZoneTier: input.zoneTier } : {}),
  });
}

export async function updateStorageZone(id: number, body: Record<string, unknown>): Promise<StorageZone> {
  return client().updateStorageZone(id, body);
}

export async function deleteStorageZone(id: number): Promise<void> {
  await client().deleteStorageZone(id);
}

// Pull zones -----------------------------------------------------------------

export async function listPullZones(): Promise<PullZone[]> {
  return client().listPullZones();
}

export async function getPullZone(id: number): Promise<PullZone> {
  return client().getPullZone(id);
}

export async function createPullZone(name: string, originUrl: string): Promise<PullZone> {
  return client().createPullZone({ Name: name, OriginUrl: originUrl });
}

export async function updatePullZone(id: number, body: Record<string, unknown>): Promise<PullZone> {
  return client().updatePullZone(id, body);
}

export async function deletePullZone(id: number): Promise<void> {
  await client().deletePullZone(id);
}

// Edge rules — listed via the parent pull zone object, but mutated through
// dedicated subresource endpoints. Bunny's `POST /pullzone/{id}` silently
// drops EdgeRules in the body, so list-then-update with the rules array
// looks successful but never persists — we must hit /edgerules/addOrUpdate.

export type EdgeRule = {
  Guid?: string;
  ActionType: number;
  TriggerMatchingType?: number;
  Triggers?: unknown[];
  ActionParameter1?: string;
  ActionParameter2?: string;
  Description?: string;
  Enabled?: boolean;
};

type PullZoneWithRules = PullZone & { EdgeRules?: EdgeRule[] };

export async function listEdgeRules(pullZoneId: number): Promise<EdgeRule[]> {
  const pz = (await client().getPullZone(pullZoneId)) as PullZoneWithRules;
  return pz.EdgeRules ?? [];
}

export async function addEdgeRule(pullZoneId: number, rule: EdgeRule): Promise<EdgeRule[]> {
  await client().addOrUpdateEdgeRule(pullZoneId, rule as unknown as Record<string, unknown>);
  return listEdgeRules(pullZoneId);
}

export async function deleteEdgeRule(pullZoneId: number, ruleGuid: string): Promise<EdgeRule[]> {
  await client().deleteEdgeRule(pullZoneId, ruleGuid);
  return listEdgeRules(pullZoneId);
}

// Hostnames — same dedicated-subresource pattern as edge rules. Returns the
// updated hostname list after each mutation so callers can confirm state.

export async function listPullZoneHostnames(pullZoneId: number): Promise<string[]> {
  const pz = await client().getPullZone(pullZoneId);
  return (pz.Hostnames ?? []).map((h) => h.Value);
}

export async function addPullZoneHostname(pullZoneId: number, hostname: string): Promise<string[]> {
  await client().addPullZoneHostname(pullZoneId, hostname);
  return listPullZoneHostnames(pullZoneId);
}

export async function removePullZoneHostname(pullZoneId: number, hostname: string): Promise<string[]> {
  await client().removePullZoneHostname(pullZoneId, hostname);
  return listPullZoneHostnames(pullZoneId);
}
