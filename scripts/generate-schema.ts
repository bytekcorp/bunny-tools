// Generate JSON Schema for bunny.json from the zod schema in src/config/.
// Published with the npm package; users reference via `$schema` for editor autocomplete.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { BunnyJsonSchema } from '../src/config/bunny-json.js';

const out = resolve(process.cwd(), 'schema', 'bunny.schema.json');
await mkdir(dirname(out), { recursive: true });

const schema = zodToJsonSchema(BunnyJsonSchema, {
  name: 'BunnyJson',
  $refStrategy: 'root',
});

await writeFile(out, JSON.stringify(schema, null, 2) + '\n', 'utf8');
process.stdout.write(`generated ${out}\n`);
