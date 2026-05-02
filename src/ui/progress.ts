// TTY-aware progress reporter. Logs to stderr only — stdout is reserved for
// command output / MCP transport.

import pc from 'picocolors';

export type ProgressReporter = {
  start: (label: string) => void;
  update: (msg: string) => void;
  succeed: (msg?: string) => void;
  fail: (msg?: string) => void;
  warn: (msg: string) => void;
  info: (msg: string) => void;
};

export function createProgress(opts: { tty?: boolean } = {}): ProgressReporter {
  const isTty = opts.tty ?? Boolean(process.stderr.isTTY);
  let current = '';
  return {
    start(label) {
      current = label;
      process.stderr.write(`${isTty ? pc.cyan('▸') : '>'} ${label}\n`);
    },
    update(msg) {
      if (isTty) {
        process.stderr.write(`  ${pc.dim(msg)}\n`);
      } else {
        process.stderr.write(`  ${msg}\n`);
      }
    },
    succeed(msg) {
      process.stderr.write(`${isTty ? pc.green('✓') : '+'} ${msg ?? current}\n`);
      current = '';
    },
    fail(msg) {
      process.stderr.write(`${isTty ? pc.red('✗') : '!'} ${msg ?? current}\n`);
      current = '';
    },
    warn(msg) {
      process.stderr.write(`${isTty ? pc.yellow('!') : '!'} ${msg}\n`);
    },
    info(msg) {
      process.stderr.write(`${isTty ? pc.blue('i') : 'i'} ${msg}\n`);
    },
  };
}
