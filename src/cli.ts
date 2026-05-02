#!/usr/bin/env node
// Registry-driven CLI entry. Builds the Commander tree from src/manifest/registry.ts;
// no command is hand-wired here. Lazy-loads command implementations only when invoked.

import { Command } from 'commander';
import { registry } from './manifest/registry.js';
import { renderCommandHelpJson, renderRegistryHelpJson } from './manifest/render-help.js';
import type { CommandSpec, ParsedInvocation } from './manifest/types.js';
import { logger } from './util/logger.js';

function buildProgram(): Command {
  const program = new Command(registry.binary);
  program
    .description(registry.description)
    .version(registry.version, '-v, --version', 'Show CLI version.')
    .helpOption('-h, --help', 'Show help for command.')
    .showHelpAfterError(true)
    // Wrangler-style global flags. Applied via env vars + chdir in preAction hook.
    .option('-c, --config <path>', 'Path to a bunny.json config (overrides walk-up search).')
    .option('--cwd <dir>', 'Run as if launched from this directory.')
    .option('-e, --env <alias>', 'One-shot .bunnyrc alias (no need for `bunny use` first).')
    .option('-p, --profile <name>', 'One-shot credential profile (overrides active). See `bunny configure list`.');

  // Apply global flags BEFORE any leaf action runs. chdir first so subsequent
  // config search uses the new cwd. Other flags become env vars consumed by
  // the loaders downstream.
  program.hook('preAction', (thisCmd) => {
    const opts = thisCmd.optsWithGlobals();
    if (typeof opts['cwd'] === 'string' && opts['cwd'].length > 0) {
      process.chdir(opts['cwd']);
    }
    if (typeof opts['config'] === 'string' && opts['config'].length > 0) {
      process.env['BUNNY_CONFIG_PATH'] = opts['config'];
    }
    if (typeof opts['env'] === 'string' && opts['env'].length > 0) {
      process.env['BUNNY_ALIAS'] = opts['env'];
    }
    if (typeof opts['profile'] === 'string' && opts['profile'].length > 0) {
      process.env['BUNNY_PROFILE'] = opts['profile'];
    }
  });

  for (const cmd of registry.commands) {
    registerCommand(program, cmd);
  }

  return program;
}

// Walk the space-delimited name and create intermediate group commands as needed.
// Example: "pullzone edgerule add" → pullzone (group) → edgerule (group) → add (leaf).
function registerCommand(root: Command, spec: CommandSpec): void {
  const parts = spec.name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return;

  let parent: Command = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const groupName = parts[i]!;
    let group = parent.commands.find((c) => c.name() === groupName);
    if (!group) {
      group = parent
        .command(groupName)
        .description(`${groupName} commands`)
        .helpOption('-h, --help', 'Show help for command.');
    }
    parent = group;
  }

  const leaf = parts[parts.length - 1]!;
  const cmd = parent.command(leaf).description(spec.summary);

  for (const arg of spec.args ?? []) {
    const decoration = arg.variadic ? '...' : '';
    cmd.argument(arg.required ? `<${arg.name}${decoration}>` : `[${arg.name}${decoration}]`, arg.description);
  }

  for (const flag of spec.flags ?? []) {
    const long = flag.short ? `-${flag.short}, --${flag.name}` : `--${flag.name}`;
    const decl = flag.hasValue ? `${long} <${flag.valueHint ?? 'value'}>` : long;
    if (flag.defaultValue !== undefined) {
      // Commander accepts string | boolean | string[] for option defaults; cast through unknown
      // rather than `never` so future non-boolean defaults don't get silently coerced.
      cmd.option(decl, flag.description, flag.defaultValue as string | boolean | string[]);
    } else {
      cmd.option(decl, flag.description);
    }
  }

  // Reserved flag for AI agents and scripts: emits JSON-shaped help instead of text.
  // Distinct from Commander's `--help`; future per-command `--json` output flags can coexist.
  cmd.option('--help-json', 'Emit help as JSON (for AI agents and scripting).');

  cmd.action(async (...rawArgs) => {
    const cmdInstance = rawArgs[rawArgs.length - 1] as Command;
    const opts = cmdInstance.opts();
    const positional = rawArgs.slice(0, -1).filter((v) => v !== undefined);

    if (opts['helpJson'] === true) {
      process.stdout.write(JSON.stringify(renderCommandHelpJson(spec), null, 2) + '\n');
      return;
    }

    if (spec.status !== 'active' || !spec.load) {
      process.stderr.write(
        `\`${registry.binary} ${spec.name}\` is planned for Phase ${spec.phase}. Not yet implemented.\n`,
      );
      process.exit(2);
    }

    try {
      const mod = await spec.load();
      const invocation: ParsedInvocation = {
        args: zipArgs(spec, positional),
        flags: opts,
        raw: process.argv.slice(2),
      };
      const code = await mod.run(invocation);
      if (typeof code === 'number' && code !== 0) process.exit(code);
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });
}

function zipArgs(spec: CommandSpec, positional: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const args = spec.args ?? [];
  for (let i = 0; i < args.length; i++) {
    const def = args[i];
    if (!def) continue;
    out[def.name] = def.variadic ? positional.slice(i) : positional[i];
  }
  return out;
}

// Expose a helper for tests / introspection that doesn't trigger argv parsing.
export function getRegistryHelpJson() {
  return renderRegistryHelpJson(registry);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const program = buildProgram();
  program.parseAsync(process.argv).catch((err) => {
    logger.error((err as Error).message);
    process.exit(1);
  });
}

export { buildProgram };
