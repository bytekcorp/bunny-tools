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

// Root help is sectioned wrangler/gh/aws-style: GETTING STARTED for the daily
// workflow commands, SERVICES collapsing each top-level group to a single
// `bunny <group> <subcmd>` pointer (count appended), UTILITIES for the
// discovery + maintenance commands. Sub-groups (e.g. `pullzone hostname`)
// are folded INTO their parent service's count, not split into their own
// pointer rows — that pattern was fragmenting root help in rc.20–37.
//
// Sub-group help (e.g. `bunny pullzone --help`) still expands every leaf
// — see renderGroupChildren.
const SECTIONS: Array<{ label: string; prefixes: string[] }> = [
  {
    label: 'GETTING STARTED',
    prefixes: ['init', 'deploy', 'configure'],
  },
  {
    label: 'SERVICES',
    prefixes: ['pullzone', 'domain', 'dns', 'stream', 'storage', 'storagezone', 'containers', 'scripting'],
  },
  {
    label: 'UTILITIES',
    prefixes: ['purge', 'use', 'whoami', 'docs', 'manifest', 'mcp', 'install', 'update'],
  },
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

  // COMMANDS block. Root renders sectioned (GETTING STARTED / SERVICES /
  // UTILITIES) with each top-level group collapsed to a single
  // `bunny <group> <subcmd>` pointer + command count. Sub-group help still
  // expands every leaf so users can see all runnable commands one drill-down
  // from the root.
  if (isRoot) {
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

// Sectioned root help: GETTING STARTED / SERVICES / UTILITIES. Each top-level
// group (pullzone, dns, stream, etc.) collapses to ONE pointer row at root
// — `bunny <group> <subcmd>     <description> (N cmds)`. Sub-groups
// (pullzone hostname, dns record, etc.) fold INTO the parent count rather
// than getting their own pointer line.
//
// Section labels are emitted at column 0 (no indent); command rows are
// indented 2 spaces to keep the section header visually distinct.
function renderRootCommands(): string[] {
  const active = registry.commands.filter((c) => c.status === 'active');
  const groupMeta = new Map((registry.groups ?? []).map((g) => [g.name, g]));
  const out: string[] = [];

  for (let i = 0; i < SECTIONS.length; i++) {
    const section = SECTIONS[i]!;
    if (i > 0) out.push('');

    // Bucket active commands by their top-level word so we can decide
    // per-prefix whether to collapse or render bare.
    const byTop = new Map<string, CommandSpec[]>();
    for (const cmd of active) {
      if (!belongsToGroup(cmd.name, section.prefixes)) continue;
      const top = cmd.name.split(/\s+/)[0]!;
      if (!byTop.has(top)) byTop.set(top, []);
      byTop.get(top)!.push(cmd);
    }
    if (byTop.size === 0) continue;

    out.push(section.label);
    for (const top of section.prefixes) {
      const cmds = byTop.get(top);
      if (!cmds || cmds.length === 0) continue;
      const bareCmd = cmds.find((c) => c.name === top);
      if (cmds.length === 1 && bareCmd) {
        // Single bare command (e.g. `bunny init`) — render the row as-is.
        out.push('  ' + formatCommandRow(bareCmd));
        continue;
      }
      // Group with subcommands. Render one collapsed pointer row.
      const meta = groupMeta.get(top);
      const desc = meta?.description ?? bareCmd?.summary ?? `${top} commands`;
      const tag = ` (${cmds.length} ${cmds.length === 1 ? 'cmd' : 'cmds'})`;
      out.push(
        '  ' + formatRow(`${registry.binary} ${top} <subcmd>`, desc + tag),
      );
    }
  }
  return out;
}

function belongsToGroup(commandName: string, prefixes: string[]): boolean {
  return prefixes.some((p) => commandName === p || commandName.startsWith(p + ' '));
}

// Group help (e.g. `bunny stream --help`, `bunny pullzone --help`): list
// ALL leaf descendants of this group regardless of depth. Earlier behaviour
// stopped at immediate leaves + sub-group pointers, but that left groups
// like `stream` (no direct leaves, only `library` / `video` subgroups)
// showing nothing actionable — users had to drill twice to find a runnable
// command. Showing every descendant collapses that into one help page.
//
// Long arg signatures (e.g. `bunny pullzone edgerule delete <pullZoneId>
// <ruleGuid>`) may overflow the alignment column at this level; that's
// acceptable here — root help is where alignment matters most, and root
// already collapses 3+ segment commands to subgroup pointers.
function renderGroupChildren(groupPath: string): string[] {
  const active = registry.commands.filter((c) => c.status === 'active');
  const matches = active.filter((c) => c.name.startsWith(groupPath + ' '));
  return matches.map((c) => '  ' + formatCommandRow(c));
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
