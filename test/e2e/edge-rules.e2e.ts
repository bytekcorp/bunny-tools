import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bunnyCliOk } from './helpers/bunny-cli.js';
import { register, cleanupAll } from './helpers/cleanup-registry.js';
import { extractIdNumeric, extractGuid } from './helpers/parse-output.js';
import { uniqueId } from './helpers/prefix.js';
import { E2E_ENABLED } from './helpers/env-guard.js';

const RULE_BODY = JSON.stringify({
  ActionType: 3,
  ActionParameter1: '3600',
  Triggers: [{ Type: 3, PatternMatches: ['css'], PatternMatchingType: 0 }],
  Description: 'bt-e2e-cache-css',
  Enabled: true,
});

describe.skipIf(!E2E_ENABLED)('e2e: pull-zone edge rules (Bug #5 regression)', () => {
  let pzId = 0;

  beforeAll(async () => {
    const name = uniqueId('pz-er');
    const created = await bunnyCliOk(['pullzone', 'create', name, '--origin=https://bunny.net']);
    pzId = extractIdNumeric(created);
    register('pullzone', pzId, name);
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('add via --rule then list confirms persistence (NOT silently dropped)', async () => {
    // Bug #5 regression: addEdgeRule used to call POST /pullzone/{id} with
    // {EdgeRules: [...]} which Bunny silently dropped. Real fix uses
    // /pullzone/{id}/edgerules/addOrUpdate. This test passes only when
    // the rule is actually persisted.
    await bunnyCliOk(['pullzone', 'edgerule', 'add', String(pzId), `--rule=${RULE_BODY}`]);

    const list = await bunnyCliOk(['pullzone', 'edgerule', 'list', String(pzId)]);
    expect(list.stdout).toMatch(/bt-e2e-cache-css/);

    // Cross-check via pullzone get — both code paths must show the rule.
    const detail = await bunnyCliOk(['pullzone', 'get', String(pzId)]);
    expect(detail.stdout).toMatch(/bt-e2e-cache-css/);
  });

  it('delete by GUID + list confirms removal', async () => {
    // pullzone get returns Hostname GUIDs first and EdgeRule GUIDs second —
    // grab the GUID specifically from the edgerule list table to avoid
    // accidentally trying to delete a hostname id as if it were a rule.
    const list = await bunnyCliOk(['pullzone', 'edgerule', 'list', String(pzId)]);
    const guid = extractGuid(list.stdout);

    await bunnyCliOk(['pullzone', 'edgerule', 'delete', String(pzId), guid]);

    const after = await bunnyCliOk(['pullzone', 'edgerule', 'list', String(pzId)]);
    expect(after.stdout).not.toMatch(/bt-e2e-cache-css/);
  });
});
