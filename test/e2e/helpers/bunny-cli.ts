// Spawn wrapper around `npx tsx src/cli.ts <args>`. True black-box e2e —
// the test never imports src/* so it exercises Commander parsing, flag
// wiring, and exit codes the same way a real user would.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(__filename), '../../..');
const CLI_ENTRY = resolve(PROJECT_ROOT, 'src/cli.ts');

export type CliResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export async function bunnyCli(
  args: string[],
  opts: { env?: Record<string, string>; cwd?: string; timeoutMs?: number } = {},
): Promise<CliResult> {
  const env = { ...process.env, ...opts.env };
  // 45s default keeps us under vitest's 60s testTimeout/hookTimeout so a hung
  // spawn surfaces as a `bunnyCli timeout` (with captured output) rather than
  // a generic vitest timeout.
  const timeoutMs = opts.timeoutMs ?? 45000;
  return await new Promise<CliResult>((resolveP, rejectP) => {
    const child = spawn('npx', ['tsx', CLI_ENTRY, ...args], {
      env,
      cwd: opts.cwd ?? PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
    const killTimer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectP(
        new Error(
          `bunnyCli timeout after ${timeoutMs}ms: ${args.join(' ')}\n` +
            `stdout (last 500B): ${stdout.slice(-500)}\n` +
            `stderr (last 500B): ${stderr.slice(-500)}`,
        ),
      );
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(killTimer);
      rejectP(err);
    });
    child.on('close', (code) => {
      clearTimeout(killTimer);
      resolveP({ stdout, stderr, exitCode: code ?? -1 });
    });
  });
}

// Convenience: assert exit 0, return full result. Throws on non-zero with
// merged stdout+stderr in the message so failures show what went wrong.
// Returning the full result (not just stdout) matters because the CLI's
// `progress.succeed/info` lines go to stderr — that's where IDs from
// create commands live — while JSON/table output lands on stdout.
export async function bunnyCliOk(
  args: string[],
  opts?: { env?: Record<string, string>; cwd?: string; timeoutMs?: number },
): Promise<CliResult> {
  const r = await bunnyCli(args, opts);
  if (r.exitCode !== 0) {
    throw new Error(
      `bunny ${args.join(' ')} → exit ${r.exitCode}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
  }
  return r;
}
