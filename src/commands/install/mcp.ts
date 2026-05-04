// `bunny install mcp` - bootstrap Claude Code's MCP config so users don't
// have to memorize the long `claude mcp add` command. v1 supports Claude
// only; Cursor/Windsurf get a clear "manual config" message pointing at
// docs/install-mcp.md (future) - those tools have their own config files
// and the cross-tool surface is too varied to wrap in v0.1.

import { spawn } from 'node:child_process';
import type { ParsedInvocation } from '../../manifest/types.js';
import { createProgress } from '../../ui/progress.js';

type Flags = {
  scope?: string;
  yes?: boolean;
};

export async function run(inv: ParsedInvocation): Promise<number> {
  const flags = inv.flags as Flags;
  const progress = createProgress();

  const claudeOnPath = await isCommandAvailable('claude');
  if (!claudeOnPath) {
    process.stderr.write(
      [
        'Could not find the `claude` CLI on PATH.',
        '',
        'For Claude Code:',
        '  Install Claude Code from https://claude.ai/code, then re-run',
        '  `bunny install mcp`.',
        '',
        'For other AI tools (Cursor, Windsurf, Continue, ...):',
        '  Add an MCP server entry to your tool\'s config pointing at:',
        '    command: npx',
        '    args:    -y bunny-tools mcp',
        '  Cursor: ~/.cursor/mcp.json',
        '  Windsurf: ~/.codeium/windsurf/mcp_config.json',
        '',
      ].join('\n'),
    );
    return 1;
  }

  // `claude mcp add` requires `--` to separate its own options from the
  // subprocess command - without it, `-y` is parsed as a (nonexistent)
  // claude option and the command fails. Per `claude mcp add --help`:
  //   claude mcp add my-server -- my-command --some-flag arg1
  const args = ['mcp', 'add'];
  if (flags.scope) {
    args.push('--scope', flags.scope);
  }
  args.push('bunny-tools', '--', 'npx', '-y', 'bunny-tools', 'mcp');

  progress.info(`Running: claude ${args.join(' ')}`);
  const code = await spawnAndPassthrough('claude', args);
  if (code === 0) {
    progress.succeed('Registered bunny-tools as an MCP server in Claude Code.');
    progress.info('Verify: `claude mcp list | grep bunny-tools`');
    return 0;
  }
  // claude already prints its own error; just propagate the code.
  return code;
}

async function isCommandAvailable(cmd: string): Promise<boolean> {
  return new Promise<boolean>((resolveP) => {
    const probe = spawn('which', [cmd], { stdio: 'ignore' });
    probe.on('error', () => resolveP(false));
    probe.on('close', (code) => resolveP(code === 0));
  });
}

function spawnAndPassthrough(cmd: string, args: string[]): Promise<number> {
  return new Promise<number>((resolveP) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', () => resolveP(1));
    child.on('close', (code) => resolveP(code ?? 1));
  });
}
