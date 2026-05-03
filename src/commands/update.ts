// `bunny update` — self-update via npm. Detects the install method
// (`npm install -g`, `npx -y`, or unknown) and either runs the upgrade or
// tells the user what's actually happening so they don't get confused.
// Permission errors get a concrete retry command, not a generic stack
// trace.

import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ParsedInvocation } from '../manifest/types.js';
import { registry } from '../manifest/registry.js';
import { createProgress } from '../ui/progress.js';

type Mode = 'npx' | 'npm-global' | 'unknown';

export async function run(_inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const mode = detectInstallMode();

  if (mode === 'npx') {
    progress.info(
      "You're running bunny-tools via `npx`. There's nothing to update — `npx -y bunny-tools <cmd>` always pulls the latest published version.",
    );
    return 0;
  }

  process.stderr.write(`Current version: ${registry.version}\n`);

  // npm-global is the documented happy path; for "unknown" install methods
  // we still attempt npm install -g (most users will be in this bucket) but
  // pre-warn about pnpm/yarn/brew so the failure mode is informative.
  if (mode === 'unknown') {
    process.stderr.write(
      'Install path could not be classified — attempting `npm install -g bunny-tools@latest` anyway.\n' +
        'If you installed via pnpm/yarn/brew, run the equivalent for your package manager instead.\n\n',
    );
  }

  const code = await spawnNpmUpgrade();
  if (code === 0) {
    progress.succeed('Update complete. Run `bunny --version` to confirm.');
    return 0;
  }

  // EACCES / permission errors are common on Linux/macOS when npm prefix is
  // a system path. Surface a concrete retry command rather than the npm
  // stack trace.
  process.stderr.write(
    [
      '',
      'If the failure was a permission error (EACCES), retry with one of:',
      '  sudo npm install -g bunny-tools@latest',
      '  npm install -g --prefix=$HOME/.local bunny-tools@latest',
      '  npm config set prefix ~/.local && npm install -g bunny-tools@latest',
      '',
    ].join('\n'),
  );
  return code;
}

function detectInstallMode(): Mode {
  // process.argv[1] is the bin entry. realpathSync resolves the symlink hop
  // for `npm install -g` (matches the rc.15 main-detection fix). When the
  // user runs via `npx -y bunny-tools`, the resolved path lives under
  // ~/.npm/_npx/<hash>/.../bunny-tools/dist/cli.js — that's the npx cache.
  const argv1 = process.argv[1];
  if (typeof argv1 !== 'string' || argv1.length === 0) return 'unknown';
  let real: string;
  try {
    real = realpathSync(argv1);
  } catch {
    return 'unknown';
  }
  // Compare the resolved binary path to known shapes.
  if (real.includes(`${nodeSep()}_npx${nodeSep()}`)) return 'npx';
  // Also handle the `bunny` symlink case where argv1 is the symlink and
  // import.meta.url is the resolved cli.js — npx vs global differ in the
  // _npx segment.
  if (fileURLToPath(import.meta.url).includes(`${nodeSep()}_npx${nodeSep()}`)) {
    return 'npx';
  }
  if (real.includes(`${nodeSep()}node_modules${nodeSep()}bunny-tools${nodeSep()}`)) {
    return 'npm-global';
  }
  return 'unknown';
}

function nodeSep(): string {
  // Path separator used in the comparisons above. node_modules/_npx pieces
  // are always slash-separated on the platforms we publish to (macOS/Linux);
  // Windows would use backslashes, but bunny-tools' npm binary is invoked
  // through node which normalizes via fileURLToPath.
  return '/';
}

function spawnNpmUpgrade(): Promise<number> {
  return new Promise<number>((resolveP) => {
    const child = spawn('npm', ['install', '-g', 'bunny-tools@latest'], { stdio: 'inherit' });
    child.on('error', () => resolveP(1));
    child.on('close', (code) => resolveP(code ?? 1));
  });
}
