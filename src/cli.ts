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

// Group metadata (description + optional aliases) keyed by space-delimited path.
const groupMetaByPath = new Map<string, { description: string; aliases: string[] }>();
for (const g of registry.groups ?? []) {
  groupMetaByPath.set(g.name, { description: g.description, aliases: g.aliases ?? [] });
}

// Walk the space-delimited name and create intermediate group commands as needed.
// Example: "pullzone edgerule add" → pullzone (group) → edgerule (group) → add (leaf).
function registerCommand(root: Command, spec: CommandSpec): void {
  const parts = spec.name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return;

  let parent: Command = root;
  let groupPath = '';
  for (let i = 0; i < parts.length - 1; i++) {
    const groupName = parts[i]!;
    groupPath = groupPath ? `${groupPath} ${groupName}` : groupName;
    let group = parent.commands.find((c) => c.name() === groupName);
    if (!group) {
      const meta = groupMetaByPath.get(groupPath);
      const description = meta?.description ?? `${groupName} commands`;
      group = parent
        .command(groupName)
        .description(description)
        .helpOption('-h, --help', 'Show help for command.');
      // Group-level aliases. Each alias is a single segment (the alternative name
      // for THIS group level). E.g. `pullzone` group → alias `pull-zone`.
      // Compatibility paths like `bunny pull-zone edge-rule list` work because
      // each group level has its own alias; Commander walks each segment.
      if (meta?.aliases) {
        const seen = new Set<string>([groupName]);
        for (const alias of meta.aliases) {
          if (alias.length === 0 || seen.has(alias)) continue;
          group.alias(alias);
          seen.add(alias);
        }
      }
    }
    parent = group;
  }

  const leaf = parts[parts.length - 1]!;
  const cmd = parent.command(leaf).description(spec.summary);

  // Register Commander aliases. These don't appear in `--help`; both forms route to the same action.
  if (spec.aliases && spec.aliases.length > 0) {
    for (const alias of spec.aliases) {
      cmd.alias(alias);
    }
  }

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
      logger.error(formatError(err));
      process.exit(1);
    }
  });
}

// rc.10 (M4): when Bunny returns a typed error envelope, surface errorKey + field
// in the CLI message so users can grep docs / logs for the key.
function formatError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { name?: string; message?: string; errorKey?: string; field?: string; status?: number };
    if (e.errorKey || e.field) {
      const parts: string[] = [];
      if (e.errorKey) parts.push(`[${e.errorKey}]`);
      parts.push(e.message ?? 'unknown error');
      if (e.field) parts.push(`(field: ${e.field})`);
      if (e.status) parts.push(`(HTTP ${e.status})`);
      return parts.join(' ');
    }
    if (e.message) return e.message;
  }
  return String(err);
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
