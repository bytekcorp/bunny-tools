// Single source of truth types. Every public-facing surface (CLI help,
// `bunny manifest` JSON, AGENTS.md, JSON Schema, MCP tool defs) is derived
// from a Registry built out of these types.

export type ArgSpec = {
  name: string;
  description: string;
  required?: boolean;
  variadic?: boolean;
};

export type FlagSpec = {
  name: string;
  short?: string;
  description: string;
  hasValue: boolean;
  defaultValue?: unknown;
  // String shape for help rendering, e.g. "json|text".
  valueHint?: string;
};

export type ExampleSpec = {
  command: string;
  description: string;
};

export type McpToolSpec = {
  tool: string;
  description?: string;
};

export type CommandStatus = 'active' | 'planned' | 'deprecated';

export type CommandSpec = {
  name: string;
  summary: string;
  description?: string;
  args?: ArgSpec[];
  flags?: FlagSpec[];
  examples?: ExampleSpec[];
  mcp?: McpToolSpec;
  status: CommandStatus;
  // Phase number this command lands in (for AGENTS.md grouping).
  phase: number;
  // Lazy import. Only `active` commands have a loader. Returning a module
  // with a `run({args, flags, raw})` async function keeps cold-start fast.
  load?: () => Promise<{
    run: (invocation: ParsedInvocation) => Promise<number>;
  }>;
};

export type ParsedInvocation = {
  args: Record<string, unknown>;
  flags: Record<string, unknown>;
  raw: string[];
};

export type Registry = {
  cliName: string;
  binary: string;
  version: string;
  description: string;
  commands: CommandSpec[];
};
