// MCP tools — high-level surface (~10 + escape hatch). Each calls into
// src/core/* directly (no CLI plumbing here). Inputs validated with zod.

import { z } from 'zod';
import { spawn } from 'node:child_process';
import { runDeploy } from '../core/deploy.js';
import { parsePurgeArg, runPurgeCommand } from '../core/purge.js';
import { listScopes } from '../core/auth.js';
import { FEATURES, runInit } from '../core/init.js';
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
  addPullZoneHostname,
  removePullZoneHostname,
  listPullZoneHostnames,
  enablePullZoneSSL,
  setHostnameForceSSL,
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
    description:
      '**Recommended for CI/CD.** End-to-end deploy: walks publicDir, diffs vs storage zone, uploads changed files with proper MIME types in parallel, optionally purges CDN. Replaces custom upload scripts. Returns counts and durations.',
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
    name: 'bunny.pullzone_hostname_list',
    description: 'List custom hostnames linked to a pull zone.',
    inputSchema: z.object({ pullZoneId: z.number().int().positive() }),
    run: async (raw) => {
      const { pullZoneId } = z.object({ pullZoneId: z.number().int().positive() }).parse(raw);
      return { hostnames: await listPullZoneHostnames(pullZoneId) };
    },
  },
  {
    name: 'bunny.pullzone_hostname_add',
    description:
      'Idempotent state-setter: link hostname + provision Let\'s Encrypt cert + enable ForceSSL (HTTP→HTTPS redirect). Pass `noForceSSL=true` to provision cert without the redirect (re-running with this flag flips ForceSSL OFF if previously on). Returns { ok, hostname, hasCertificate, forceSslSet? }.',
    inputSchema: z.object({
      pullZoneId: z.number().int().positive(),
      hostname: z.string().min(1),
      noForceSSL: z.boolean().optional(),
      timeoutMs: z.number().int().positive().max(300_000).optional(),
    }),
    run: async (raw) => {
      const { pullZoneId, hostname, noForceSSL, timeoutMs } = z
        .object({
          pullZoneId: z.number().int().positive(),
          hostname: z.string().min(1),
          noForceSSL: z.boolean().optional(),
          timeoutMs: z.number().int().positive().max(300_000).optional(),
        })
        .parse(raw);

      // Idempotent linking — only POST addHostname when not already present.
      const existing = await listPullZoneHostnames(pullZoneId);
      if (!existing.includes(hostname)) {
        await addPullZoneHostname(pullZoneId, hostname);
      }

      const sslResult = await enablePullZoneSSL(pullZoneId, hostname, {
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        ...(noForceSSL ? { noForceSSL: true } : {}),
      });
      // State assertion when --no-force-ssl: ensure ForceSSL=false even if a
      // prior run left it true. enablePullZoneSSL with noForceSSL skips the
      // auto-flip-on but doesn't actively turn it off.
      if (noForceSSL) {
        await setHostnameForceSSL(pullZoneId, hostname, false);
      }
      return {
        ok: true,
        hostname,
        linked: true,
        hasCertificate: sslResult.hasCertificate,
        ...(sslResult.forceSslSet ? { forceSslSet: true } : {}),
        ...(noForceSSL ? { forceSslSet: false } : {}),
      };
    },
  },
  {
    name: 'bunny.pullzone_hostname_remove',
    description: 'Unlink a custom hostname from a pull zone.',
    inputSchema: z.object({
      pullZoneId: z.number().int().positive(),
      hostname: z.string().min(1),
    }),
    run: async (raw) => {
      const { pullZoneId, hostname } = z
        .object({ pullZoneId: z.number().int().positive(), hostname: z.string().min(1) })
        .parse(raw);
      const hostnames = await removePullZoneHostname(pullZoneId, hostname);
      return { ok: true, hostnames };
    },
  },
  {
    name: 'bunny.domain_connect',
    description:
      'Atomic Connect Domain: link hostname to pull zone, provision Let\'s Encrypt cert (waits up to 90s), optionally create apex Type-7 DNS record. Mirrors the Bunny dashboard "Connect Domain" button. Idempotent — safe to re-run. Pass `dnsZoneId` to also create the DNS record.',
    inputSchema: z.object({
      pullZoneId: z.number().int().positive(),
      hostname: z.string().min(1),
      dnsZoneId: z.number().int().positive().optional(),
      recordName: z.string().optional(),
      noForceSSL: z.boolean().optional(),
    }),
    run: async (raw) => {
      const args = z
        .object({
          pullZoneId: z.number().int().positive(),
          hostname: z.string().min(1),
          dnsZoneId: z.number().int().positive().optional(),
          recordName: z.string().optional(),
          noForceSSL: z.boolean().optional(),
        })
        .parse(raw);
      const { connectDomain } = await import('../core/domain.js');
      return connectDomain(args.pullZoneId, args.hostname, {
        ...(args.dnsZoneId !== undefined ? { dnsZoneId: args.dnsZoneId } : {}),
        ...(args.recordName !== undefined ? { recordName: args.recordName } : {}),
        ...(args.noForceSSL ? { noForceSSL: true } : {}),
      });
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
    description:
      'Add a DNS record. Standard types (A/AAAA/CNAME/TXT/MX/SRV/CAA/NS) plus Bunny routing types (REDIRECT/FLATTEN/PULLZONE/PTR/SCRIPT). For PULLZONE: pass `pullZoneId` (number) and we auto-derive value+linkName — mirrors the CLI `--pull-zone` convenience. SCRIPT still requires linkName.',
    inputSchema: z.object({
      zoneId: z.number().int().positive(),
      type: z.enum([
        'A', 'AAAA', 'CNAME', 'TXT', 'MX', 'REDIRECT', 'FLATTEN', 'PULLZONE',
        'SRV', 'CAA', 'PTR', 'SCRIPT', 'NS',
      ]),
      name: z.string(),
      // Optional for PULLZONE when pullZoneId is set; otherwise required.
      value: z.string().optional(),
      ttl: z.number().int().positive().optional(),
      priority: z.number().int().nonnegative().optional(),
      weight: z.number().int().nonnegative().optional(),
      port: z.number().int().positive().optional(),
      flags: z.number().int().nonnegative().optional(),
      tag: z.string().optional(),
      linkName: z.string().optional(),
      pullZoneId: z.number().int().positive().optional(),
    }),
    run: async (raw) => {
      const parsed = z
        .object({
          zoneId: z.number().int().positive(),
          type: z.enum([
            'A', 'AAAA', 'CNAME', 'TXT', 'MX', 'REDIRECT', 'FLATTEN', 'PULLZONE',
            'SRV', 'CAA', 'PTR', 'SCRIPT', 'NS',
          ]),
          name: z.string(),
          value: z.string().optional(),
          ttl: z.number().int().positive().optional(),
          priority: z.number().int().nonnegative().optional(),
          weight: z.number().int().nonnegative().optional(),
          port: z.number().int().positive().optional(),
          flags: z.number().int().nonnegative().optional(),
          tag: z.string().optional(),
          linkName: z.string().optional(),
          pullZoneId: z.number().int().positive().optional(),
        })
        .parse(raw);
      const { zoneId, pullZoneId, ...rest } = parsed;

      // PULLZONE convenience: when pullZoneId is given, fetch the PZ and
      // derive both Value (PZ name) and LinkName (PZ id as string). User
      // can still pass value/linkName explicitly to override.
      let resolved: typeof rest = rest;
      if (parsed.type === 'PULLZONE' && pullZoneId !== undefined) {
        const pz = await getPullZone(pullZoneId);
        resolved = {
          ...rest,
          value: rest.value ?? pz.Name,
          linkName: rest.linkName ?? String(pz.Id),
        };
      }

      if (!resolved.value) {
        throw new Error(
          parsed.type === 'PULLZONE'
            ? 'PULLZONE record requires either `pullZoneId` (recommended) or both `value` and `linkName`.'
            : 'value is required',
        );
      }
      return addRecord(zoneId, resolved);
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
    name: 'bunny.init',
    description:
      'Initialize a bunny.json + store credentials in one call. Non-interactive shape. Use this to bootstrap a project. Returns the result with bunnyJsonPath, storedScopes, features.',
    inputSchema: z.object({
      features: z.array(z.enum(FEATURES)).min(1),
      accountKey: z.string().optional(),
      publicDir: z.string().optional(),
      storageZone: z.string().optional(),
      storagePassword: z.string().optional(),
      region: z.string().optional(),
      pullZoneId: z.number().int().optional(),
      purge: z.string().optional(),
      streamLibraryId: z.string().optional(),
      streamKey: z.string().optional(),
      cwd: z.string().optional(),
      force: z.boolean().optional(),
    }),
    run: async (raw) => {
      const args = z
        .object({
          features: z.array(z.enum(FEATURES)).min(1),
          accountKey: z.string().optional(),
          publicDir: z.string().optional(),
          storageZone: z.string().optional(),
          storagePassword: z.string().optional(),
          region: z.string().optional(),
          pullZoneId: z.number().int().optional(),
          purge: z.string().optional(),
          streamLibraryId: z.string().optional(),
          streamKey: z.string().optional(),
          cwd: z.string().optional(),
          force: z.boolean().optional(),
        })
        .parse(raw);
      const noopAsk = async () => {
        throw new Error('bunny.init MCP tool is non-interactive; provide all required fields.');
      };
      const { cwd, force, ...input } = args;
      return runInit(
        input,
        {
          ask: noopAsk,
          pick: noopAsk,
          multiselect: async () => args.features,
          confirm: async () => false,
        },
        { interactive: false, ...(cwd ? { cwd } : {}), ...(force ? { force: true } : {}) },
      );
    },
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
      // Re-spawn the SAME entry point that's running this MCP server. In
      // production builds that's `node dist/cli.js`; in dev (tsx) it's
      // `node --import tsx src/cli.ts`. process.execArgv carries the loader
      // flags so the child can execute a .ts entry too — without forwarding
      // execArgv, the child would crash when argv[1] is a TypeScript file.
      const argv1 = process.argv[1] ?? 'bunny';
      const childArgs = [...process.execArgv, argv1, ...args];
      return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, childArgs, {
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
