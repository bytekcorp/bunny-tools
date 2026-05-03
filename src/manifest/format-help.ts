// Wrangler-style help renderer. Replaces Commander's default help layout:
//
//   Default: USAGE → DESCRIPTION → OPTIONS → COMMANDS
//   Custom:  TITLE — DESCRIPTION → USAGE → COMMANDS (grouped) → GLOBAL FLAGS
//
// Commander invokes `formatHelp(cmd, helper)` for every help invocation —
// root, group, and leaf. We dispatch on the command's structure: commands
// with subcommands render the COMMANDS block; leaves render USAGE + FLAGS.
//
// No emoji. Wrangler uses them; bunny-tools is text-only for accessibility
// and grep-friendliness.
//
// The help block emitted here always lands on stdout when called via
// `program.outputHelp()` and respects `NO_COLOR` (Commander's default).

import type { Command, Help } from 'commander';
import { registry } from './registry.js';
import type { CommandSpec } from './types.js';

// Domain ordering for the COMMANDS section. Each entry is a list of
// command-name prefixes that belong together (rendered as a single group
// with a blank line above the next group). Sub-resource commands appear
// AFTER their parent group's leaf commands.
const COMMAND_GROUPS: Array<{ label: string; prefixes: string[] }> = [
  { label: 'Setup', prefixes: ['init', 'configure', 'use', 'whoami', 'docs'] },
  { label: 'Deploy & purge', prefixes: ['deploy', 'purge'] },
  { label: 'Storage (file ops)', prefixes: ['storage upload', 'storage download', 'storage list', 'storage delete', 'storage sync'] },
  { label: 'Storage zones', prefixes: ['storagezone'] },
  { label: 'Pull zones (CDN)', prefixes: ['pullzone'] },
  { label: 'DNS', prefixes: ['dns'] },
  { label: 'Stream', prefixes: ['stream'] },
  { label: 'Magic Containers', prefixes: ['containers'] },
  { label: 'Edge Scripting', prefixes: ['scripting'] },
  { label: 'Discovery & AI', prefixes: ['manifest', 'mcp', 'install', 'update'] },
];

// Total minimum width for the "command" column before description starts.
// Tuned by inspection: storage download <remote> <local> is the longest
// at ~37 chars + a 2-char gap.
const NAME_COL_MIN = 40;

export function formatHelp(cmd: Command, _helper: Help): string {
  const isRoot = cmd.parent === null;
  const isGroup = cmd.commands.length > 0;
  if (isRoot || isGroup) return formatGroupOrRoot(cmd, isRoot);
  return formatLeaf(cmd);
}

function formatGroupOrRoot(cmd: Command, isRoot: boolean): string {
  const lines: string[] = [];
  // Title line. Root: just `bunny — <description>`. Group: `bunny storage — <description>`.
  const fullName = isRoot ? registry.binary : commandFullName(cmd);
  const desc = (cmd.description() || '').trim();
  lines.push(desc ? `${fullName} — ${desc}` : fullName);
  lines.push('');

  // USAGE block. Root says `<command> [args] [flags]`. Group says `<subcommand> [args] [flags]`.
  lines.push('USAGE');
  if (isRoot) {
    lines.push(`  ${registry.binary} <command> [args] [flags]`);
  } else {
    lines.push(`  ${fullName} <subcommand> [args] [flags]`);
  }
  lines.push('');

  // COMMANDS block. Root pulls from the full registry and groups by domain.
  // Sub-group help just lists immediate subcommands without domain grouping.
  if (isRoot) {
    lines.push('COMMANDS');
    const rendered = renderRootCommands();
    lines.push(...rendered);
  } else {
    lines.push('COMMANDS');
    const groupPath = commandGroupPath(cmd);
    const rendered = renderGroupChildren(groupPath);
    lines.push(...rendered);
  }
  lines.push('');

  // GLOBAL FLAGS — same block on every help invocation; pulled from root.
  lines.push('GLOBAL FLAGS');
  lines.push(...renderGlobalFlags());
  lines.push('');

  if (isRoot) {
    lines.push(`Run \`${registry.binary} <command> --help\` for more details on a command.`);
  } else {
    lines.push(`Run \`${fullName} <subcommand> --help\` for more details.`);
  }
  return lines.join('\n') + '\n';
}

function formatLeaf(cmd: Command): string {
  const lines: string[] = [];
  const fullName = commandFullName(cmd);
  const desc = (cmd.description() || '').trim();
  lines.push(desc ? `${fullName} — ${desc}` : fullName);
  lines.push('');

  // USAGE — show declared positional args inline.
  const argSig = cmd
    .registeredArguments
    .map((a) => (a.required ? `<${a.name()}>` : `[${a.name()}]`))
    .join(' ');
  lines.push('USAGE');
  lines.push(`  ${fullName}${argSig ? ' ' + argSig : ''} [flags]`);
  lines.push('');

  // FLAGS — command-local options (not the inherited globals).
  const local = cmd.options.filter((o) => !o.hidden);
  if (local.length > 0) {
    lines.push('FLAGS');
    for (const opt of local) {
      const left = opt.flags;
      const right = opt.description || '';
      lines.push('  ' + formatRow(left, right));
    }
    lines.push('');
  }

  // GLOBAL FLAGS — same as on root help.
  lines.push('GLOBAL FLAGS');
  lines.push(...renderGlobalFlags());
  lines.push('');
  return lines.join('\n') + '\n';
}

// Walk up the parent chain to assemble the canonical full name (e.g.
// `bunny pullzone edgerule add`). Used in the title + USAGE lines.
function commandFullName(cmd: Command): string {
  const parts: string[] = [];
  let c: Command | null = cmd;
  while (c) {
    parts.unshift(c.name());
    c = c.parent;
  }
  return parts.join(' ');
}

// Same as commandFullName but without the binary prefix — for matching against
// registry command names.
function commandGroupPath(cmd: Command): string {
  const parts: string[] = [];
  let c: Command | null = cmd;
  while (c && c.parent) {
    parts.unshift(c.name());
    c = c.parent;
  }
  return parts.join(' ');
}

// Render every active root-level command in the COMMAND_GROUPS order. Skips
// `planned`/`deferred` commands so the help output reflects what users can
// actually run today.
function renderRootCommands(): string[] {
  const active = registry.commands.filter((c) => c.status === 'active');
  const out: string[] = [];

  for (let i = 0; i < COMMAND_GROUPS.length; i++) {
    const group = COMMAND_GROUPS[i]!;
    const matches = active.filter((c) => belongsToGroup(c.name, group.prefixes));
    if (matches.length === 0) continue;
    if (out.length > 0) out.push(''); // blank line between groups
    for (const cmd of matches) {
      out.push(formatCommandRow(cmd));
    }
  }
  return out.map((l) => (l === '' ? '' : '  ' + l));
}

function belongsToGroup(commandName: string, prefixes: string[]): boolean {
  return prefixes.some((p) => commandName === p || commandName.startsWith(p + ' '));
}

// Group help (e.g. `bunny storage --help`, `bunny pullzone --help`):
// list immediate leaf descendants AND any sub-group pointers so the reader
// knows further nesting exists (e.g. `pullzone edgerule`).
function renderGroupChildren(groupPath: string): string[] {
  const active = registry.commands.filter((c) => c.status === 'active');
  const out: string[] = [];

  // 1. Immediate leaves (exactly one segment past the group path).
  for (const c of active) {
    if (!c.name.startsWith(groupPath + ' ')) continue;
    const tail = c.name.slice(groupPath.length + 1);
    if (tail.length === 0 || tail.includes(' ')) continue;
    out.push('  ' + formatCommandRow(c));
  }

  // 2. Sub-group pointers — collect unique 2nd-segment names that have
  // descendants but aren't themselves leaves. Render each with its registry
  // description so users see what's deeper without listing every leaf.
  const subgroups = new Set<string>();
  for (const c of active) {
    if (!c.name.startsWith(groupPath + ' ')) continue;
    const tail = c.name.slice(groupPath.length + 1);
    if (!tail.includes(' ')) continue;
    const head = tail.split(' ')[0];
    if (head) subgroups.add(head);
  }
  const groupMeta = new Map((registry.groups ?? []).map((g) => [g.name, g]));
  for (const sg of subgroups) {
    const subPath = `${groupPath} ${sg}`;
    const meta = groupMeta.get(subPath);
    const summary = meta?.description ?? `${sg} commands`;
    const left = `${registry.binary} ${subPath} ...`;
    out.push('  ' + formatRow(left, summary));
  }
  return out;
}

// Format a single command row with a left "name + args" column and a right
// "description" column, padded for column alignment.
function formatCommandRow(spec: CommandSpec): string {
  const argSig = (spec.args ?? [])
    .map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`))
    .join(' ');
  const left = `${registry.binary} ${spec.name}${argSig ? ' ' + argSig : ''}`;
  return formatRow(left, spec.summary);
}

function formatRow(left: string, right: string): string {
  if (right.length === 0) return left;
  const pad = Math.max(NAME_COL_MIN - left.length, 1);
  return `${left}${' '.repeat(pad)}${right}`;
}

// Global flags are declared once on the root program; we mirror them here so
// every help invocation shows the same block. Source order matches the cli.ts
// definitions to keep the help and the actual flag wiring in sync.
function renderGlobalFlags(): string[] {
  const flags: Array<[string, string]> = [
    ['-c, --config <path>', 'Path to a bunny.json config (overrides walk-up search).'],
    ['    --cwd <dir>', 'Run as if launched from this directory.'],
    ['-e, --env <alias>', 'One-shot .bunnyrc alias (no need for `bunny use` first).'],
    ['-p, --profile <name>', 'One-shot credential profile (overrides active).'],
    ['-h, --help', 'Show help for command.'],
    ['-v, --version', 'Show CLI version.'],
  ];
  return flags.map(([left, right]) => '  ' + formatRow(left, right));
}
