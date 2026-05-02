// Reads src/manifest/registry.ts and writes manifest.json at repo root.
// Run via `npm run gen:manifest`. CI verifies the checked-in file matches.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { registry } from '../src/manifest/registry.js';
import { renderRegistryHelpJson } from '../src/manifest/render-help.js';

const out = resolve(process.cwd(), 'manifest.json');
await mkdir(dirname(out), { recursive: true });
const data = renderRegistryHelpJson(registry);
await writeFile(out, JSON.stringify(data, null, 2) + '\n', 'utf8');
process.stdout.write(`generated ${out} (${data.commands.length} commands)\n`);
