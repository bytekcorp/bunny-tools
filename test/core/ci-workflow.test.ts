import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateGitHubActionsWorkflow } from '../../src/core/ci-workflow.js';
import type { BunnyJson } from '../../src/config/bunny-json.js';

function config(overrides: Partial<BunnyJson['deploy']> = {}): BunnyJson {
  return {
    deploy: {
      publicDir: 'dist',
      ignore: [],
      mimeTypes: {},
      headers: [],
      edgeRules: [],
      storageZone: 'my-app',
      concurrency: 8,
      pullZones: [],
      ...overrides,
    },
  };
}

describe('generateGitHubActionsWorkflow', () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'ci-workflow-'));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('writes .github/workflows/bunny-deploy.yml with the storage-zone secret name', async () => {
    const result = await generateGitHubActionsWorkflow(scratch, config({ storageZone: 'my-app' }));
    expect(result.wrote).toBe(true);
    if (!result.wrote) return; // type narrowing
    const yaml = await readFile(result.path, 'utf8');
    expect(yaml).toContain('BUNNY_ACCOUNT_KEY');
    expect(yaml).toContain('BUNNY_STORAGE_PASSWORD_MY_APP');
    expect(yaml).toContain('npm install -g bunny-tools');
    expect(yaml).toContain('bunny deploy --delete');
    expect(yaml).toContain("paths-ignore:");
    expect(yaml).toContain('docs/**');
  });

  it('returns secretsToAdd for both account-key and per-zone password', async () => {
    const result = await generateGitHubActionsWorkflow(scratch, config({ storageZone: 'site-prod' }));
    expect(result.secretsToAdd).toEqual(['BUNNY_ACCOUNT_KEY', 'BUNNY_STORAGE_PASSWORD_SITE_PROD']);
  });

  it('skips writing when workflow file already exists', async () => {
    await mkdir(join(scratch, '.github', 'workflows'), { recursive: true });
    await writeFile(join(scratch, '.github', 'workflows', 'bunny-deploy.yml'), '# user-edited\n');

    const result = await generateGitHubActionsWorkflow(scratch, config());
    expect(result.wrote).toBe(false);
    if (result.wrote) return;
    expect(result.reason).toBe('exists');
    // Untouched.
    const yaml = await readFile(result.path, 'utf8');
    expect(yaml).toBe('# user-edited\n');
  });

  it('uppercases hyphenated zone names for the secret env var', async () => {
    const result = await generateGitHubActionsWorkflow(scratch, config({ storageZone: 'bytek-site' }));
    expect(result.secretsToAdd).toContain('BUNNY_STORAGE_PASSWORD_BYTEK_SITE');
    if (!result.wrote) return;
    const yaml = await readFile(result.path, 'utf8');
    expect(yaml).toContain('BUNNY_STORAGE_PASSWORD_BYTEK_SITE');
  });
});
