// core/aliases — read/write `.bunnyrc` aliases. UI-free.

import { join } from 'node:path';
import type { Bunnyrc } from '../config/bunnyrc.js';
import { loadBunnyrc, saveBunnyrc } from '../config/bunnyrc.js';

export type ResolvedAlias = {
  name: string;
  storageZone: string;
  region?: string;
  pullZones: number[];
};

export async function loadOrEmpty(cwd = process.cwd()): Promise<{ rc: Bunnyrc; filePath: string }> {
  const { rc, filePath } = await loadBunnyrc(cwd);
  return {
    rc: rc ?? { aliases: {} },
    filePath: filePath ?? join(cwd, '.bunnyrc'),
  };
}

export async function listAliases(cwd = process.cwd()): Promise<{
  active: string | null;
  aliases: ResolvedAlias[];
}> {
  const { rc } = await loadOrEmpty(cwd);
  const aliases: ResolvedAlias[] = Object.entries(rc.aliases).map(([name, entry]) => ({
    name,
    storageZone: entry.storageZone,
    ...(entry.region ? { region: entry.region } : {}),
    pullZones: entry.pullZones,
  }));
  return { active: rc.default ?? null, aliases };
}

export async function setActiveAlias(name: string, cwd = process.cwd()): Promise<void> {
  const { rc, filePath } = await loadOrEmpty(cwd);
  if (!rc.aliases[name]) {
    throw new Error(
      `Alias "${name}" not found. Available: ${Object.keys(rc.aliases).join(', ') || '(none)'}`,
    );
  }
  rc.default = name;
  await saveBunnyrc(filePath, rc);
}

export async function upsertAlias(name: string, alias: Omit<ResolvedAlias, 'name'>, cwd = process.cwd()): Promise<void> {
  const { rc, filePath } = await loadOrEmpty(cwd);
  rc.aliases[name] = {
    storageZone: alias.storageZone,
    ...(alias.region ? { region: alias.region } : {}),
    pullZones: alias.pullZones,
  };
  if (!rc.default) rc.default = name;
  await saveBunnyrc(filePath, rc);
}

export async function getActiveAliasOverlay(cwd = process.cwd()): Promise<ResolvedAlias | null> {
  const { rc } = await loadOrEmpty(cwd);
  if (!rc.default) return null;
  const entry = rc.aliases[rc.default];
  if (!entry) return null;
  return {
    name: rc.default,
    storageZone: entry.storageZone,
    ...(entry.region ? { region: entry.region } : {}),
    pullZones: entry.pullZones,
  };
}
