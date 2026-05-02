// After tsc emits dist/, mark dist/cli.js executable so `npm link` and
// installed binaries work without an extra step. Also fix the ESM extension
// problem: TypeScript emits `import './x.js'` but tsc doesn't enforce that
// on imports without extensions — we already wrote them with `.js` so this
// just chmods.

import { chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const cliPath = resolve(process.cwd(), 'dist', 'cli.js');
if (existsSync(cliPath)) {
  await chmod(cliPath, 0o755);
  process.stdout.write(`post-build: chmod +x ${cliPath}\n`);
} else {
  process.stderr.write(`post-build: ${cliPath} not found\n`);
  process.exit(1);
}
