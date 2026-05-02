// Generate AGENTS.md from the registry. AI agents read this to learn the CLI
// without parsing prose. Hand-curated sections (between the markers below)
// are preserved on regeneration; automated sections are overwritten.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { registry } from '../src/manifest/registry.js';
import { summarizeRegistry } from '../src/manifest/render-help.js';

const OUT = resolve(process.cwd(), 'AGENTS.md');
const HC_START = '<!-- HANDCURATED:START -->';
const HC_END = '<!-- HANDCURATED:END -->';

async function existingHandcurated(): Promise<string> {
  try {
    const raw = await readFile(OUT, 'utf8');
    const start = raw.indexOf(HC_START);
    const end = raw.indexOf(HC_END);
    if (start === -1 || end === -1 || end < start) return defaultHandcurated();
    return raw.slice(start + HC_START.length, end).trim();
  } catch {
    return defaultHandcurated();
  }
}

function defaultHandcurated(): string {
  return [
    '## Quickstart for AI agents',
    '',
    'When asked to deploy a project to Bunny.net using bunny-tools:',
    '',
    '1. Check that `bunny.json` exists in the project root. If not, run `bunny init`.',
    '2. Check global creds with `bunny auth list`. If empty, `bunny init` will prompt for them (interactive) or run `bunny init --non-interactive --features=storage --account-key=... --storage-zone=... --storage-password=...` (CI).',
    '3. Run `bunny deploy --dry-run` first to verify the plan.',
    '4. Run `bunny deploy` to sync storage and purge CDN cache.',
    '',
    '## Common workflows',
    '',
    '- **Deploy a static site**: `bunny deploy`',
    '- **Purge CDN cache only**: `bunny purge tag:<name>` or `bunny purge pull-zone:<id>`',
    '- **List storage zones**: `bunny storage-zone:list --json`',
    '- **Manage DNS records**: `bunny dns:record:list <zone>` then `bunny dns:record:add ...`',
    '',
    '## Gotchas',
    '',
    '- Bunny has 4 distinct credential types (account, storage zone, stream library, database). All use the `AccessKey` HTTP header but with different scopes.',
    '- Storage uses 8 regional endpoints; bunny-tools resolves the region per zone automatically.',
    '- Pagination: bunny-tools always uses `page=1, perPage=1000` to avoid Bunny’s `page=0` array footgun.',
    '- Per-folder storage cap: keep <10000 files per directory.',
    '- Tag-based purge requires the origin to set a `Cache-Tag` response header. Without it, fall back to `purge: "all"`.',
    '',
    '## MCP usage',
    '',
    '`bunny mcp` boots an MCP stdio server (Phase 6). Install for Claude Code with:',
    '',
    '```bash',
    'claude mcp add bunny-tools npx -y bunny-tools mcp',
    '```',
  ].join('\n');
}

function autoCommandTree(): string {
  const lines: string[] = ['## Command tree (auto-generated)', ''];
  const groups: Record<number, typeof registry.commands> = {};
  for (const c of registry.commands) {
    (groups[c.phase] ??= []).push(c);
  }
  for (const phaseStr of Object.keys(groups).sort((a, b) => Number(a) - Number(b))) {
    const phase = Number(phaseStr);
    const cmds = groups[phase]!;
    lines.push(`### Phase ${phase}`, '');
    for (const c of cmds) {
      const status = c.status === 'active' ? '[active]' : c.status === 'deprecated' ? '[deprecated]' : '[planned]';
      const mcp = c.mcp ? ` _mcp: \`${c.mcp.tool}\`_` : '';
      lines.push(`- \`${registry.binary} ${c.name}\` ${status} — ${c.summary}${mcp}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

const stats = summarizeRegistry(registry);
const handcurated = await existingHandcurated();
const out = [
  `# AGENTS.md — bunny-tools`,
  '',
  `${registry.description}`,
  '',
  `**Binary:** \`${registry.binary}\`  |  **Version:** ${registry.version}  |  **Active commands:** ${stats.active}/${registry.commands.length}`,
  '',
  HC_START,
  '',
  handcurated,
  '',
  HC_END,
  '',
  autoCommandTree(),
  '',
  '---',
  '',
  '_Generated from `src/manifest/registry.ts` by `npm run gen:agents`. Do not edit auto sections by hand._',
  '',
].join('\n');

await writeFile(OUT, out, 'utf8');
process.stdout.write(`generated ${OUT}\n`);
