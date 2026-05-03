import { describe, expect, it } from 'vitest';
import {
  compileHeaderRule,
  compileRawEdgeRule,
  hasDeclaredRules,
} from '../../src/core/edge-rules-sync.js';
import type { BunnyJson } from '../../src/config/bunny-json.js';

function emptyConfig(): BunnyJson {
  return {
    deploy: {
      publicDir: 'dist',
      ignore: [],
      mimeTypes: {},
      headers: [],
      edgeRules: [],
      storageZone: 'z',
      concurrency: 8,
      pullZones: [],
    },
  };
}

describe('compileHeaderRule', () => {
  it('compiles Cache-Control max-age into BOTH OverrideCacheTime + OverrideBrowserCacheTime', () => {
    const rules = compileHeaderRule({
      pattern: '/assets/*',
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
    expect(rules).toHaveLength(2);
    // OverrideCacheTime = 3, OverrideBrowserCacheTime = 15
    expect(rules.map((r) => r.ActionType).sort((a, b) => a - b)).toEqual([3, 15]);
    expect(rules.every((r) => r.ActionParameter1 === '31536000')).toBe(true);
    // Marker prefix on both.
    expect(rules.every((r) => r.Description?.startsWith('managed-by-bunny-tools:'))).toBe(true);
  });

  it('compiles non-Cache-Control headers to SetResponseHeader (ActionType 5)', () => {
    const rules = compileHeaderRule({
      pattern: '/*.html',
      headers: { 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff' },
    });
    expect(rules).toHaveLength(2);
    expect(rules.every((r) => r.ActionType === 5)).toBe(true);
    expect(rules.find((r) => r.ActionParameter1?.startsWith('X-Frame-Options:'))).toBeDefined();
    expect(rules.find((r) => r.ActionParameter1?.startsWith('X-Content-Type-Options:'))).toBeDefined();
  });

  it('falls back to SetResponseHeader for Cache-Control without max-age', () => {
    const rules = compileHeaderRule({
      pattern: '/api/*',
      headers: { 'Cache-Control': 'no-store' },
    });
    expect(rules).toHaveLength(1);
    expect(rules[0]!.ActionType).toBe(5); // SetResponseHeader
    expect(rules[0]!.ActionParameter1).toBe('Cache-Control: no-store');
  });

  it('extracts s-maxage as well as max-age', () => {
    const rules = compileHeaderRule({
      pattern: '/edge/*',
      headers: { 'Cache-Control': 's-maxage=3600' },
    });
    expect(rules).toHaveLength(2);
    expect(rules[0]!.ActionParameter1).toBe('3600');
  });

  it('attaches a Url trigger with the user pattern', () => {
    const rules = compileHeaderRule({
      pattern: '/static/*',
      headers: { 'X-Foo': 'bar' },
    });
    expect(rules[0]!.Triggers?.[0]?.Type).toBe(0); // Url
    expect(rules[0]!.Triggers?.[0]?.PatternMatches).toEqual(['/static/*']);
  });
});

describe('compileRawEdgeRule', () => {
  it('passes through user-supplied raw edge rules with marker', () => {
    const rule = compileRawEdgeRule({
      description: 'Block bad bots',
      actionType: 'BlockRequest',
      actionParameter1: '',
      triggerType: 'RequestHeader',
      triggerPatterns: ['BadBot'],
      triggerMatchingType: 'Any',
      enabled: true,
    });
    expect(rule.ActionType).toBe(4); // BlockRequest
    expect(rule.Triggers?.[0]?.Type).toBe(1); // RequestHeader
    expect(rule.Description).toMatch(/^managed-by-bunny-tools: raw:Block bad bots/);
    expect(rule.Enabled).toBe(true);
  });

  it('encodes triggerMatchingType correctly', () => {
    const rule = compileRawEdgeRule({
      description: 'CountryGate',
      actionType: 'Redirect',
      actionParameter1: 'https://example.com',
      triggerType: 'CountryCode',
      triggerPatterns: ['CN', 'RU'],
      triggerMatchingType: 'None',
      enabled: false,
    });
    expect(rule.TriggerMatchingType).toBe(2); // None
    expect(rule.Triggers?.[0]?.PatternMatchingType).toBe(2);
    expect(rule.Enabled).toBe(false);
  });
});

describe('hasDeclaredRules', () => {
  it('returns false when both arrays are empty', () => {
    expect(hasDeclaredRules(emptyConfig())).toBe(false);
  });

  it('returns true when headers has entries', () => {
    const c = emptyConfig();
    c.deploy.headers = [{ pattern: '/*', headers: { 'X-Foo': 'bar' } }];
    expect(hasDeclaredRules(c)).toBe(true);
  });

  it('returns true when edgeRules has entries', () => {
    const c = emptyConfig();
    c.deploy.edgeRules = [
      {
        description: 'r1',
        actionType: 'BlockRequest',
        actionParameter1: '',
        triggerType: 'Url',
        triggerPatterns: ['/admin/*'],
        triggerMatchingType: 'Any',
        enabled: true,
      },
    ];
    expect(hasDeclaredRules(c)).toBe(true);
  });
});
