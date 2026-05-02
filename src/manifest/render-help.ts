import type { CommandSpec, Registry } from './types.js';

// Plain-text help for a single command. Commander has its own help text,
// but we render here too so `--help --json` and `bunny manifest` are
// derived from the same data.
export function renderCommandHelpText(cmd: CommandSpec, binary: string): string {
  const lines: string[] = [];
  lines.push(`${binary} ${cmd.name} — ${cmd.summary}`);
  if (cmd.description) lines.push('', cmd.description);
  if (cmd.args && cmd.args.length > 0) {
    lines.push('', 'Arguments:');
    for (const a of cmd.args) {
      const tag = a.required ? '<required>' : '[optional]';
      lines.push(`  ${a.name} ${tag}  ${a.description}`);
    }
  }
  if (cmd.flags && cmd.flags.length > 0) {
    lines.push('', 'Flags:');
    for (const f of cmd.flags) {
      const flag = `--${f.name}${f.hasValue ? ` <${f.valueHint ?? 'value'}>` : ''}`;
      const short = f.short ? `-${f.short}, ` : '    ';
      lines.push(`  ${short}${flag}  ${f.description}`);
    }
  }
  if (cmd.examples && cmd.examples.length > 0) {
    lines.push('', 'Examples:');
    for (const e of cmd.examples) {
      lines.push(`  $ ${e.command}`);
      lines.push(`      ${e.description}`);
    }
  }
  if (cmd.status === 'planned') {
    lines.push('', `Status: planned (lands in Phase ${cmd.phase}).`);
  }
  return lines.join('\n');
}

// Structured help — what `--help --json` returns.
export type CommandHelpJson = {
  name: string;
  summary: string;
  description: string | null;
  status: CommandSpec['status'];
  phase: number;
  args: Array<{
    name: string;
    description: string;
    required: boolean;
    variadic: boolean;
  }>;
  flags: Array<{
    name: string;
    short: string | null;
    description: string;
    hasValue: boolean;
    valueHint: string | null;
    defaultValue: unknown;
  }>;
  examples: Array<{ command: string; description: string }>;
  mcp: { tool: string; description: string | null } | null;
};

export function renderCommandHelpJson(cmd: CommandSpec): CommandHelpJson {
  return {
    name: cmd.name,
    summary: cmd.summary,
    description: cmd.description ?? null,
    status: cmd.status,
    phase: cmd.phase,
    args: (cmd.args ?? []).map((a) => ({
      name: a.name,
      description: a.description,
      required: a.required ?? false,
      variadic: a.variadic ?? false,
    })),
    flags: (cmd.flags ?? []).map((f) => ({
      name: f.name,
      short: f.short ?? null,
      description: f.description,
      hasValue: f.hasValue,
      valueHint: f.valueHint ?? null,
      defaultValue: f.defaultValue ?? null,
    })),
    examples: cmd.examples ?? [],
    mcp: cmd.mcp ? { tool: cmd.mcp.tool, description: cmd.mcp.description ?? null } : null,
  };
}

export function renderRegistryHelpJson(reg: Registry): {
  cliName: string;
  binary: string;
  version: string;
  description: string;
  commands: CommandHelpJson[];
} {
  return {
    cliName: reg.cliName,
    binary: reg.binary,
    version: reg.version,
    description: reg.description,
    commands: reg.commands.map(renderCommandHelpJson),
  };
}

export function summarizeRegistry(reg: Registry): {
  active: number;
  planned: number;
  deprecated: number;
  byPhase: Record<number, number>;
} {
  const result = { active: 0, planned: 0, deprecated: 0, byPhase: {} as Record<number, number> };
  for (const c of reg.commands) {
    result[c.status]++;
    result.byPhase[c.phase] = (result.byPhase[c.phase] ?? 0) + 1;
  }
  return result;
}
