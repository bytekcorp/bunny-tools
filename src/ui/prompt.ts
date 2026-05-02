// Wraps the `prompts` library. Refuses interactive prompts in non-TTY contexts
// so CI fails fast with an actionable error instead of hanging.

import prompts from 'prompts';

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY) && process.env['BUNNY_NONINTERACTIVE'] !== '1';
}

export type AskOptions = {
  name: string;
  message: string;
  mode: 'plain' | 'mask';
};

export async function ask(opts: AskOptions): Promise<string> {
  if (!isInteractive()) {
    throw new Error(
      `Cannot prompt for "${opts.name}" in a non-interactive shell. Pass it via flag/env or run interactively.`,
    );
  }
  const res = await prompts({
    type: opts.mode === 'mask' ? 'password' : 'text',
    name: 'value',
    message: opts.message,
  });
  if (typeof res['value'] !== 'string') throw new Error('Prompt cancelled.');
  return res['value'];
}

export async function pick(opts: {
  name: string;
  message: string;
  choices: Array<{ value: string; label: string }>;
}): Promise<string> {
  if (!isInteractive()) {
    throw new Error(`Cannot prompt for "${opts.name}" in a non-interactive shell.`);
  }
  const res = await prompts({
    type: 'select',
    name: 'value',
    message: opts.message,
    choices: opts.choices.map((c) => ({ title: c.label, value: c.value })),
  });
  if (typeof res['value'] !== 'string') throw new Error('Prompt cancelled.');
  return res['value'];
}

export async function confirm(opts: { message: string; default: boolean }): Promise<boolean> {
  if (!isInteractive()) return opts.default;
  const res = await prompts({
    type: 'confirm',
    name: 'value',
    message: opts.message,
    initial: opts.default,
  });
  return Boolean(res['value']);
}

export async function multiselect<T extends string>(opts: {
  name: string;
  message: string;
  choices: Array<{ value: T; label: string; selected?: boolean }>;
  min?: number;
}): Promise<T[]> {
  if (!isInteractive()) {
    throw new Error(`Cannot prompt for "${opts.name}" in a non-interactive shell.`);
  }
  const res = await prompts({
    type: 'multiselect',
    name: 'value',
    message: opts.message,
    instructions: false,
    min: opts.min ?? 0,
    choices: opts.choices.map((c) => ({
      title: c.label,
      value: c.value,
      selected: c.selected ?? false,
    })),
  });
  const v = res['value'];
  if (!Array.isArray(v)) throw new Error('Prompt cancelled.');
  return v as T[];
}
