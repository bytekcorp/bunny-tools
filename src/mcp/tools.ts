// MCP tools — high-level surface (~10 + escape hatch). Each calls into
// src/core/* directly (no CLI plumbing here). Inputs validated with zod.

import { z } from 'zod';
import { spawn } from 'node:child_process';
import { runDeploy } from '../core/deploy.js';
import { parsePurgeArg, runPurgeCommand } from '../core/purge.js';
import { listScopes } from '../core/auth.js';
import { listPath, deletePath, uploadFile } from '../core/storage-ops.js';
import {
  listStorageZones,
  getStorageZone,
  createStorageZone,
  deleteStorageZone,
  listPullZones,
  getPullZone,
  createPullZone,
  deletePullZone,
} from '../core/zones.js';
import { listZones as listDnsZones, listRecords, addRecord, deleteRecord } from '../core/dns.js';
import { loadBunnyJson } from '../config/bunny-json.js';
import { registry } from '../manifest/registry.js';
import { renderRegistryHelpJson } from '../manifest/render-help.js';
import { maskCredential } from '../config/credential-resolver.js';
import { resolveCredential } from '../config/credential-resolver.js';

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  /** Returns a JSON-serializable result. */
  run: (args: unknown) => Promise<unknown>;
};

const ZoneType = z.enum(['storage', 'pull']);

export const TOOLS: ToolDef[] = [
  {
    name: 'bunny.deploy',
    description: 'Run `bunny deploy` against the bunny.json in CWD. Walks publicDir, diffs vs storage zone, uploads changed files in parallel, optionally purges CDN. Returns counts and durations.',
    inputSchema: z.object({
      dryRun: z.boolean().optional(),
      deleteOrphans: z.boolean().optional(),
      concurrency: z.number().int().positive().max(64).optional(),
      purge: z.string().optional(),
    }),
    run: async (raw) => {
      const args = z
        .object({
          dryRun: z.boolean().optional(),
          deleteOrphans: z.boolean().optional(),
          concurrency: z.number().int().positive().max(64).optional(),
          purge: z.string().optional(),
        })
        .parse(raw);
      const { config } = await loadBunnyJson();
      return runDeploy({
        config,
        cwd: process.cwd(),
        ...(args.dryRun ? { dryRun: true } : {}),
        ...(args.deleteOrphans ? { deleteOrphans: true } : {}),
        ...(args.concurrency ? { concurrency: args.concurrency } : {}),
        ...(args.purge ? { purgeOverride: args.purge } : {}),
      });
    },
  },
  {
    name: 'bunny.purge',
    description: 'Purge CDN cache. Target is a URL or "pull-zone:<id>". Returns ok/failed counts.',
    inputSchema: z.object({ target: z.string() }),
    run: async (raw) => {
      const { target } = z.object({ target: z.string() }).parse(raw);
      return runPurgeCommand(parsePurgeArg(target));
    },
  },
  {
    name: 'bunny.storage_list',
    description: 'List a path within a storage zone.',
    inputSchema: z.object({
      zone: z.string(),
      path: z.string().default('/'),
      recursive: z.boolean().optional(),
    }),
    run: async (raw) => {
      const { zone, path, recursive } = z
        .object({ zone: z.string(), path: z.string().default('/'), recursive: z.boolean().optional() })
        .parse(raw);
      return listPath(zone, path, recursive ? { recursive: true } : {});
    },
  },
  {
    name: 'bunny.storage_upload',
    description: 'Upload a local file to a storage zone path.',
    inputSchema: z.object({ zone: z.string(), local: z.string(), remote: z.string() }),
    run: async (raw) => {
      const args = z.object({ zone: z.string(), local: z.string(), remote: z.string() }).parse(raw);
      await uploadFile(args.zone, args.local, args.remote);
      return { ok: true, remote: args.remote };
    },
  },
  {
    name: 'bunny.storage_delete',
    description: 'Delete a file or directory in a storage zone. Recursive when path resolves to a directory and recursive=true.',
    inputSchema: z.object({ zone: z.string(), path: z.string(), recursive: z.boolean().optional() }),
    run: async (raw) => {
      const args = z.object({ zone: z.string(), path: z.string(), recursive: z.boolean().optional() }).parse(raw);
      const count = await deletePath(args.zone, args.path, args.recursive ? { recursive: true } : {});
      return { deleted: count };
    },
  },
  {
    name: 'bunny.zones_list',
    description: 'List storage zones or pull zones.',
    inputSchema: z.object({ type: ZoneType }),
    run: async (raw) => {
      const { type } = z.object({ type: ZoneType }).parse(raw);
      return type === 'storage' ? listStorageZones() : listPullZones();
    },
  },
  {
    name: 'bunny.zone_get',
    description: 'Get a storage or pull zone by id (numeric) or name.',
    inputSchema: z.object({ type: ZoneType, idOrName: z.union([z.string(), z.number()]) }),
    run: async (raw) => {
      const { type, idOrName } = z
        .object({ type: ZoneType, idOrName: z.union([z.string(), z.number()]) })
        .parse(raw);
      if (type === 'storage') return getStorageZone(idOrName);
      return getPullZone(typeof idOrName === 'number' ? idOrName : Number.parseInt(idOrName, 10));
    },
  },
  {
    name: 'bunny.zone_create',
    description: 'Create a storage or pull zone.',
    inputSchema: z.object({
      type: ZoneType,
      name: z.string(),
      origin: z.string().url().optional(),
      region: z.string().optional(),
    }),
    run: async (raw) => {
      const args = z
        .object({
          type: ZoneType,
          name: z.string(),
          origin: z.string().url().optional(),
          region: z.string().optional(),
        })
        .parse(raw);
      if (args.type === 'storage') {
        return createStorageZone({ name: args.name, ...(args.region ? { region: args.region } : {}) });
      }
      if (!args.origin) throw new Error('pull zone create requires `origin`.');
      return createPullZone(args.name, args.origin);
    },
  },
  {
    name: 'bunny.zone_delete',
    description: 'Delete a storage or pull zone by numeric id.',
    inputSchema: z.object({ type: ZoneType, id: z.number().int().positive() }),
    run: async (raw) => {
      const { type, id } = z.object({ type: ZoneType, id: z.number().int().positive() }).parse(raw);
      if (type === 'storage') await deleteStorageZone(id);
      else await deletePullZone(id);
      return { ok: true };
    },
  },
  {
    name: 'bunny.dns_records',
    description: 'List DNS records for a zone, or DNS zones if no zoneId given.',
    inputSchema: z.object({ zoneId: z.number().int().positive().optional() }),
    run: async (raw) => {
      const { zoneId } = z.object({ zoneId: z.number().int().positive().optional() }).parse(raw);
      if (zoneId === undefined) return listDnsZones();
      return listRecords(zoneId);
    },
  },
  {
    name: 'bunny.dns_record_set',
    description: 'Add a DNS record. Type-specific required fields validated server-side.',
    inputSchema: z.object({
      zoneId: z.number().int().positive(),
      type: z.enum(['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'SRV', 'CAA', 'NS']),
      name: z.string(),
      value: z.string(),
      ttl: z.number().int().positive().optional(),
      priority: z.number().int().nonnegative().optional(),
      weight: z.number().int().nonnegative().optional(),
      port: z.number().int().positive().optional(),
      flags: z.number().int().nonnegative().optional(),
      tag: z.string().optional(),
    }),
    run: async (raw) => {
      // Validate at the MCP boundary BEFORE addRecord runs its own
      // discriminated-union check. Same shape as inputSchema; declared inline
      // so the schema parse and the run function share one source of truth.
      const parsed = z
        .object({
          zoneId: z.number().int().positive(),
          type: z.enum(['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'SRV', 'CAA', 'NS']),
          name: z.string(),
          value: z.string(),
          ttl: z.number().int().positive().optional(),
          priority: z.number().int().nonnegative().optional(),
          weight: z.number().int().nonnegative().optional(),
          port: z.number().int().positive().optional(),
          flags: z.number().int().nonnegative().optional(),
          tag: z.string().optional(),
        })
        .parse(raw);
      const { zoneId, ...rest } = parsed;
      return addRecord(zoneId, rest);
    },
  },
  {
    name: 'bunny.dns_record_delete',
    description: 'Delete a DNS record by zone + record id.',
    inputSchema: z.object({ zoneId: z.number().int().positive(), recordId: z.number().int().positive() }),
    run: async (raw) => {
      const { zoneId, recordId } = z
        .object({ zoneId: z.number().int().positive(), recordId: z.number().int().positive() })
        .parse(raw);
      await deleteRecord(zoneId, recordId);
      return { ok: true };
    },
  },
  {
    name: 'bunny.manifest',
    description: 'Returns the canonical bunny-tools command registry as JSON. Use this to discover the full CLI surface.',
    inputSchema: z.object({}),
    run: async () => renderRegistryHelpJson(registry),
  },
  {
    name: 'bunny.run',
    description:
      'Escape hatch: run any bunny-tools CLI invocation from the same working directory. Use when no dedicated MCP tool exists. Returns stdout, stderr, exitCode.',
    inputSchema: z.object({
      args: z.array(z.string()).min(1),
      cwd: z.string().optional(),
      timeoutMs: z.number().int().positive().max(300_000).optional(),
    }),
    run: async (raw) => {
      const { args, cwd, timeoutMs } = z
        .object({
          args: z.array(z.string()).min(1),
          cwd: z.string().optional(),
          timeoutMs: z.number().int().positive().max(300_000).optional(),
        })
        .parse(raw);
      // Reject `mcp` to prevent recursive boot.
      if (args[0] === 'mcp') throw new Error('Refusing to invoke `bunny mcp` via bunny.run.');
      return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [process.argv[1] ?? 'bunny', ...args], {
          cwd: cwd ?? process.cwd(),
          env: process.env,
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => (stdout += d.toString()));
        child.stderr.on('data', (d) => (stderr += d.toString()));
        const timer = timeoutMs
          ? setTimeout(() => {
              child.kill('SIGTERM');
              reject(new Error(`bunny.run timed out after ${timeoutMs}ms`));
            }, timeoutMs)
          : null;
        child.on('exit', (code) => {
          if (timer) clearTimeout(timer);
          resolve({ exitCode: code ?? 0, stdout, stderr });
        });
        child.on('error', reject);
      });
    },
  },
];

// Resource: masked current credentials view. Exposed for AI introspection.
export async function readConfigResource(): Promise<unknown> {
  const scopes = await listScopes();
  // Belt-and-suspenders: extra masking pass even though listScopes already masks.
  return scopes.map((s) => ({ scope: s.scope, value: maskCredential(s.masked) }));
}

// Re-export for tests:
export const _internal = { resolveCredential };
