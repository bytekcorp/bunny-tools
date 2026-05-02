import { homedir } from 'node:os';
import { join } from 'node:path';

// XDG-aware config dir, falling back to ~/.config/bunny-tools.
export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), '.config');
  return join(base, 'bunny-tools');
}

export function credentialsFile(): string {
  return join(configDir(), 'credentials.json');
}

// Per-project state cache (gitignored).
export const STATE_FILENAME = '.bunny-state.json';
