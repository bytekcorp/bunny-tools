// Compile + diff + apply for declarative edge rules. Reads `bunny.json
// deploy.headers` and `deploy.edgeRules`, compiles to Bunny's EdgeRule
// shape, diffs against the PZ's existing rules, and POSTs add/update/delete
// to bring remote in sync. Skipped entirely when both arrays are empty.
//
// Managed rules are tagged via Description prefix `managed-by-bunny-tools:`.
// Rules without that prefix are user-owned (created via dashboard or raw
// API) and never touched.

import { createHash } from 'node:crypto';
import {
  addEdgeRule,
  deleteEdgeRule,
  listEdgeRules,
  type EdgeRule,
  type EdgeRuleTrigger,
} from './zones.js';
import type {
  BunnyJson,
  EdgeRuleSpecInput,
  HeaderRuleSpec,
} from '../config/bunny-json.js';

// Bunny edge-rule ActionType enum (from API reference). Names match
// what we expose in `bunny.json deploy.edgeRules.actionType`.
const ACTION_TYPES = {
  ForceSSL: 0,
  Redirect: 1,
  OriginUrl: 2,
  OverrideCacheTime: 3,
  BlockRequest: 4,
  SetResponseHeader: 5,
  SetRequestHeader: 6,
  ForceDownload: 7,
  DisableTokenAuthentication: 8,
  EnableTokenAuthentication: 9,
  OverrideCacheTimePublic: 10,
  IgnoreCacheControl: 11,
  DisableCors: 12,
  EnableCors: 13,
  BypassPermaCache: 14,
  OverrideBrowserCacheTime: 15,
} as const;

// Bunny trigger Type enum. Same source.
const TRIGGER_TYPES = {
  Url: 0,
  RequestHeader: 1,
  ResponseHeader: 2,
  UrlExtension: 3,
  CountryCode: 4,
  RemoteIP: 5,
  StatusCode: 6,
} as const;

const MATCHING_TYPES = {
  Any: 0,
  All: 1,
  None: 2,
} as const;

const MARKER_PREFIX = 'managed-by-bunny-tools:';

export type SyncResult = {
  pullZoneId: number;
  added: number;
  updated: number;
  deleted: number;
};

export async function syncEdgeRulesForPullZone(
  pullZoneId: number,
  config: BunnyJson,
): Promise<SyncResult> {
  const desired = compileDesiredRules(config);
  const existing = await listEdgeRules(pullZoneId);
  const managed = existing.filter((r) => r.Description?.startsWith(MARKER_PREFIX));

  // Index both sides by description (which embeds a content hash, so any
  // spec change → different description → handled as add+delete pair).
  const desiredByDesc = new Map(desired.map((r) => [r.Description!, r]));
  const managedByDesc = new Map(managed.map((r) => [r.Description!, r]));

  let added = 0;
  // `updated` is never incremented — we trust the description hash for
  // identity. Kept in the result envelope for back-compat / future use
  // if we add a "force update" mode that re-applies same-hash rules.
  const updated = 0;
  let deleted = 0;

  // Add when description (= content hash) doesn't match any existing
  // managed rule. Same description → identical spec by construction (the
  // hash is computed from the same fields we'd compare). No need for a
  // shape diff: Bunny normalizes the response (adds Guid, reshapes
  // Triggers) so a deep-equal check would always claim "different" and
  // trigger spurious updates.
  //
  // Side effect: if a user manually edits a managed rule in the dashboard,
  // its description still matches our hash → we leave it alone. That's
  // intentional — manual edits via dashboard aren't our responsibility.
  // To force re-sync, the user changes the spec (which changes the hash).
  for (const [desc, rule] of desiredByDesc) {
    if (!managedByDesc.has(desc)) {
      await addEdgeRule(pullZoneId, rule);
      added++;
    }
  }

  // Delete: managed rules no longer in desired set.
  for (const [desc, rule] of managedByDesc) {
    if (!desiredByDesc.has(desc) && rule.Guid) {
      await deleteEdgeRule(pullZoneId, rule.Guid);
      deleted++;
    }
  }

  return { pullZoneId, added, updated, deleted };
}

// Compile both `headers` (high-level) and `edgeRules` (raw) into the same
// EdgeRule shape Bunny expects. Returns rules in stable order so two runs
// over the same config produce byte-equal output (lets us detect drift).
function compileDesiredRules(config: BunnyJson): EdgeRule[] {
  const out: EdgeRule[] = [];
  for (const h of config.deploy.headers) {
    out.push(...compileHeaderRule(h));
  }
  for (const e of config.deploy.edgeRules) {
    out.push(compileRawEdgeRule(e));
  }
  // Stable sort by description so add/update/delete diffing is deterministic.
  out.sort((a, b) => (a.Description ?? '').localeCompare(b.Description ?? ''));
  return out;
}

// Header → edge rule(s). Each (key, value) pair becomes one rule.
//
// Cache-Control is special-cased: when the value contains `max-age=N`, we
// emit two rules — OverrideCacheTime (edge cache) and OverrideBrowserCacheTime
// (Cache-Control header sent to client) — both with parameter1=N seconds.
// This matches Bunny's intended use of these action types and gives the
// behavior users expect from a Cloudflare Pages / Netlify-style declaration.
//
// All other header values fall through to SetResponseHeader, which sets
// the literal response header but does NOT alter the edge cache lifetime.
export function compileHeaderRule(rule: HeaderRuleSpec): EdgeRule[] {
  const rules: EdgeRule[] = [];
  for (const [key, value] of Object.entries(rule.headers)) {
    const maxAge = isCacheControlMaxAge(key, value);
    if (maxAge !== null) {
      rules.push(
        markRule(
          {
            ActionType: ACTION_TYPES.OverrideCacheTime,
            ActionParameter1: String(maxAge),
            Triggers: [urlTrigger(rule.pattern)],
            TriggerMatchingType: MATCHING_TYPES.Any,
            Enabled: true,
          },
          `header-cache-edge:${rule.pattern}:max-age=${maxAge}`,
        ),
      );
      rules.push(
        markRule(
          {
            ActionType: ACTION_TYPES.OverrideBrowserCacheTime,
            ActionParameter1: String(maxAge),
            Triggers: [urlTrigger(rule.pattern)],
            TriggerMatchingType: MATCHING_TYPES.Any,
            Enabled: true,
          },
          `header-cache-browser:${rule.pattern}:max-age=${maxAge}`,
        ),
      );
    } else {
      // Bunny's SetResponseHeader takes the header NAME in ActionParameter1
      // and the VALUE in ActionParameter2 — not a combined "Name: Value"
      // string (which Bunny rejects with "Please enter a valid header name.").
      rules.push(
        markRule(
          {
            ActionType: ACTION_TYPES.SetResponseHeader,
            ActionParameter1: key,
            ActionParameter2: value,
            Triggers: [urlTrigger(rule.pattern)],
            TriggerMatchingType: MATCHING_TYPES.Any,
            Enabled: true,
          },
          `header-set:${rule.pattern}:${key}`,
        ),
      );
    }
  }
  return rules;
}

export function compileRawEdgeRule(spec: EdgeRuleSpecInput): EdgeRule {
  const rule: EdgeRule = {
    ActionType: ACTION_TYPES[spec.actionType],
    ActionParameter1: spec.actionParameter1,
    ...(spec.actionParameter2 !== undefined ? { ActionParameter2: spec.actionParameter2 } : {}),
    Triggers: [
      {
        Type: TRIGGER_TYPES[spec.triggerType],
        PatternMatches: spec.triggerPatterns,
        PatternMatchingType: MATCHING_TYPES[spec.triggerMatchingType],
      },
    ],
    TriggerMatchingType: MATCHING_TYPES[spec.triggerMatchingType],
    Enabled: spec.enabled,
  };
  return markRule(rule, `raw:${spec.description}`);
}

// Parse `Cache-Control: max-age=N` (or `s-maxage=N`). Returns the seconds
// value, or null if the header isn't a max-age directive we should
// special-case to OverrideCacheTime.
function isCacheControlMaxAge(key: string, value: string): number | null {
  if (key.toLowerCase() !== 'cache-control') return null;
  const match = /(?:^|[\s,])(?:s-maxage|max-age)=(\d+)/i.exec(value);
  if (!match) return null;
  const n = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function urlTrigger(pattern: string): EdgeRuleTrigger {
  return {
    Type: TRIGGER_TYPES.Url,
    PatternMatches: [pattern],
    PatternMatchingType: MATCHING_TYPES.Any,
  };
}

// Embed a stable hash of the rule's specifying fields into Description, so
// any change in spec produces a different description → diff shows up as
// add+delete. Hash is short (8 hex chars) — collisions don't break sync,
// just look like duplicate rules to the user.
function markRule(rule: EdgeRule, kind: string): EdgeRule {
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        type: rule.ActionType,
        p1: rule.ActionParameter1,
        p2: rule.ActionParameter2,
        triggers: rule.Triggers,
        match: rule.TriggerMatchingType,
        enabled: rule.Enabled,
      }),
    )
    .digest('hex')
    .slice(0, 8);
  return { ...rule, Description: `${MARKER_PREFIX} ${kind} hash=${hash}` };
}

// Public helper — used by `runDeploy` to decide whether to skip sync entirely.
export function hasDeclaredRules(config: BunnyJson): boolean {
  return config.deploy.headers.length > 0 || config.deploy.edgeRules.length > 0;
}
