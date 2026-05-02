// core/dns — typed wrappers + record-type validation. UI-free.

import { z } from 'zod';
import { createAccountClient } from '../api/account.js';
import type { DnsRecord, DnsZone } from '../api/account.js';
import { resolveCredential } from '../config/credential-resolver.js';
import { ValidationError } from '../api/errors.js';

// Bunny DNS record type → numeric code (per Bunny API spec).
export const RECORD_TYPE_CODES: Record<string, number> = {
  A: 0,
  AAAA: 1,
  CNAME: 2,
  TXT: 3,
  MX: 4,
  SRV: 8,
  CAA: 9,
  NS: 12,
};

export const SUPPORTED_TYPES = Object.keys(RECORD_TYPE_CODES);

export type SupportedType = keyof typeof RECORD_TYPE_CODES;

// zod discriminated union — required fields per type. Validates BEFORE we hit the API.
const baseFields = z.object({
  name: z.string(),
  value: z.string().min(1),
  ttl: z.number().int().positive().optional(),
});
const ARecord = baseFields.extend({ type: z.literal('A') });
const AAAARecord = baseFields.extend({ type: z.literal('AAAA') });
const CNAMERecord = baseFields.extend({ type: z.literal('CNAME') });
const TXTRecord = baseFields.extend({ type: z.literal('TXT') });
const MXRecord = baseFields.extend({
  type: z.literal('MX'),
  priority: z.number().int().nonnegative(),
});
const SRVRecord = baseFields.extend({
  type: z.literal('SRV'),
  priority: z.number().int().nonnegative(),
  weight: z.number().int().nonnegative(),
  port: z.number().int().positive(),
});
const CAARecord = baseFields.extend({
  type: z.literal('CAA'),
  flags: z.number().int().nonnegative(),
  tag: z.string().min(1),
});
const NSRecord = baseFields.extend({ type: z.literal('NS') });

export const RecordInputSchema = z.discriminatedUnion('type', [
  ARecord,
  AAAARecord,
  CNAMERecord,
  TXTRecord,
  MXRecord,
  SRVRecord,
  CAARecord,
  NSRecord,
]);

export type RecordInput = z.infer<typeof RecordInputSchema>;

export function parseRecordInput(raw: unknown): RecordInput {
  const result = RecordInputSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(
      `Invalid DNS record input: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  return result.data;
}

function toApiBody(rec: RecordInput): Record<string, unknown> {
  const code = RECORD_TYPE_CODES[rec.type];
  if (code === undefined) throw new ValidationError(`Unsupported DNS type: ${rec.type}`);
  const body: Record<string, unknown> = {
    Type: code,
    Name: rec.name,
    Value: rec.value,
  };
  if (rec.ttl !== undefined) body['Ttl'] = rec.ttl;
  if ('priority' in rec) body['Priority'] = rec.priority;
  if ('weight' in rec) body['Weight'] = rec.weight;
  if ('port' in rec) body['Port'] = rec.port;
  if ('flags' in rec) body['Flags'] = rec.flags;
  if ('tag' in rec) body['Tag'] = rec.tag;
  return body;
}

function client() {
  return createAccountClient({ resolveCredential: (s) => resolveCredential(s) });
}

export async function listZones(): Promise<DnsZone[]> {
  return client().listDnsZones();
}

export async function getZone(id: number): Promise<DnsZone> {
  return client().getDnsZone(id);
}

export async function createZone(domain: string): Promise<DnsZone> {
  return client().createDnsZone(domain);
}

export async function deleteZone(id: number): Promise<void> {
  await client().deleteDnsZone(id);
}

export async function listRecords(zoneId: number): Promise<DnsRecord[]> {
  const zone = await client().getDnsZone(zoneId);
  return zone.Records ?? [];
}

export async function addRecord(zoneId: number, raw: unknown): Promise<DnsRecord> {
  const parsed = parseRecordInput(raw);
  return client().addDnsRecord(zoneId, toApiBody(parsed));
}

export async function updateRecord(zoneId: number, recordId: number, body: Record<string, unknown>): Promise<DnsRecord> {
  return client().updateDnsRecord(zoneId, recordId, body);
}

export async function deleteRecord(zoneId: number, recordId: number): Promise<void> {
  await client().deleteDnsRecord(zoneId, recordId);
}

export function recordTypeName(code: number): string {
  return Object.entries(RECORD_TYPE_CODES).find(([, v]) => v === code)?.[0] ?? `code:${code}`;
}
