import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { ConfigError } from '../api/errors.js';

// Storage regions Bunny exposes.
export const STORAGE_REGIONS = ['ny', 'la', 'sg', 'syd', 'uk', 'se', 'br', 'jh'] as const;
export type StorageRegion = (typeof STORAGE_REGIONS)[number];

// Per-pull-zone purge strategy.
const PurgeSpec = z.union([
  z.literal('all'),
  z.literal('none'),
  z.string().startsWith('tag:'),
  z.array(z.string()).min(1), // explicit URL list
]);

const PullZoneEntry = z.object({
  id: z.number().int().positive(),
  purge: PurgeSpec.default('all'),
  tag: z.string().optional(),
});

// `headers` - Netlify/Cloudflare-style declarative response headers per path
// pattern. Compiled to edge rules at deploy time; one rule per (pattern, key)
// pair. `Cache-Control: max-age=N` is special-cased to OverrideCacheTime +
// OverrideBrowserCacheTime; other directives fall through to SetResponseHeader.
const HeaderRule = z.object({
  pattern: z.string().min(1),
  headers: z.record(z.string().min(1), z.string()),
});

// `edgeRules` - raw edge rule declarations. Pass-through after marker. Each
// entry maps 1:1 to a Bunny edge rule on the configured pull zones.
const EdgeRuleSpec = z.object({
  description: z.string().min(1),
  actionType: z.enum([
    'ForceSSL',
    'Redirect',
    'OriginUrl',
    'OverrideCacheTime',
    'BlockRequest',
    'SetResponseHeader',
    'SetRequestHeader',
    'ForceDownload',
    'DisableTokenAuthentication',
    'EnableTokenAuthentication',
    'OverrideCacheTimePublic',
    'IgnoreCacheControl',
    'DisableCors',
    'EnableCors',
    'BypassPermaCache',
    'OverrideBrowserCacheTime',
  ]),
  actionParameter1: z.string(),
  actionParameter2: z.string().optional(),
  triggerType: z.enum([
    'Url',
    'RequestHeader',
    'ResponseHeader',
    'UrlExtension',
    'CountryCode',
    'RemoteIP',
    'StatusCode',
  ]),
  triggerPatterns: z.array(z.string().min(1)).min(1),
  triggerMatchingType: z.enum(['Any', 'All', 'None']).default('Any'),
  enabled: z.boolean().default(true),
});

const DeployBlock = z.object({
  publicDir: z.string().min(1),
  ignore: z.array(z.string()).default([]),
  mimeTypes: z.record(z.string().regex(/^\./), z.string().min(1)).default({}),
  // Declarative response headers per glob pattern. See HeaderRule above.
  headers: z.array(HeaderRule).default([]),
  // Lower-level raw edge rules. Use when `headers` isn't expressive enough
  // (e.g. trigger by country code, status code, request header).
  edgeRules: z.array(EdgeRuleSpec).default([]),
  storageZone: z.string().min(1),
  region: z.enum(STORAGE_REGIONS).optional(),
  concurrency: z.number().int().positive().max(64).default(8),
  pullZones: z.array(PullZoneEntry).default([]),
});

export type HeaderRuleSpec = z.infer<typeof HeaderRule>;
export type EdgeRuleSpecInput = z.infer<typeof EdgeRuleSpec>;

export const BunnyJsonSchema = z.object({
  $schema: z.string().optional(),
  deploy: DeployBlock,
});

export type BunnyJson = z.infer<typeof BunnyJsonSchema>;

export async function loadBunnyJson(cwd: string = process.cwd()): Promise<{
  config: BunnyJson;
  filePath: string;
}> {
  const filePath = await findBunnyJson(cwd);
  if (!filePath) {
    throw new ConfigError(
      `bunny.json not found searching from ${cwd}. Run \`bunny init\` to create one.`,
    );
  }
  const raw = await readFile(filePath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`bunny.json at ${filePath} is not valid JSON: ${(err as Error).message}`);
  }
  const result = BunnyJsonSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(
      `bunny.json at ${filePath} failed validation:\n${formatZodIssues(result.error.issues)}`,
    );
  }
  return { config: result.data, filePath };
}

async function findBunnyJson(start: string): Promise<string | null> {
  let dir = resolve(start);
  // Walk up to filesystem root.
  for (;;) {
    const candidate = join(dir, 'bunny.json');
    try {
      await readFile(candidate);
      return candidate;
    } catch {
      // not found here
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function formatZodIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}
