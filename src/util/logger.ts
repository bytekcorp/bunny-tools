import pc from 'picocolors';

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const LEVELS: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

function envLevel(): LogLevel {
  const raw = (process.env.BUNNY_LOG_LEVEL ?? process.env.LOG_LEVEL ?? '').toLowerCase();
  return (raw in LEVELS ? raw : 'info') as LogLevel;
}

let current: LogLevel = envLevel();

export function setLogLevel(level: LogLevel): void {
  current = level;
}

export function getLogLevel(): LogLevel {
  return current;
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] <= LEVELS[current];
}

// All log output goes to stderr. stdout is reserved for command results
// (and for the MCP server, stdout is the JSON-RPC transport - never log there).
function emit(level: LogLevel, prefix: string, args: unknown[]): void {
  if (!shouldLog(level)) return;
  const parts = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a)));
  process.stderr.write(`${prefix} ${parts.join(' ')}\n`);
}

export const logger = {
  error: (...args: unknown[]) => emit('error', pc.red('[error]'), args),
  warn: (...args: unknown[]) => emit('warn', pc.yellow('[warn]'), args),
  info: (...args: unknown[]) => emit('info', pc.cyan('[info]'), args),
  debug: (...args: unknown[]) => emit('debug', pc.gray('[debug]'), args),
};
