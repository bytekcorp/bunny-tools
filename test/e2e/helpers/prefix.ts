// Per-suite resource prefix. Format: bt-e2e-<pid>-<unixts>-<n>.
// PID disambiguates concurrent local runs; unix-ts lets the stale-sweep
// detect orphans by parsing the prefix.

let cached: string | undefined;
let counter = 0;

export function suitePrefix(): string {
  if (cached) return cached;
  // BT_E2E_PREFIX honored when set so child spawns inside the same run share
  // the same prefix root — not strictly needed today (singleFork suite), but
  // costs nothing and unlocks future parallelism.
  const fromEnv = process.env['BT_E2E_PREFIX'];
  if (fromEnv && fromEnv.length > 0) {
    cached = fromEnv;
    return cached;
  }
  const ts = Math.floor(Date.now() / 1000);
  cached = `bt-e2e-${process.pid}-${ts}`;
  process.env['BT_E2E_PREFIX'] = cached;
  return cached;
}

// Append a unique suffix to the suite prefix. Counter scoped to the file
// invoking it — different test files get independent counters but share
// the suite root, so cleanup-by-prefix still finds everything.
export function uniqueId(label: string): string {
  counter += 1;
  return `${suitePrefix()}-${label}-${counter}`;
}

// Parse the unix-ts out of a known-shape resource name. Returns null if
// the name doesn't match the prefix shape.
export function parseStaleAge(name: string, nowSec = Math.floor(Date.now() / 1000)): number | null {
  const match = name.match(/^bt-e2e-\d+-(\d+)-/);
  if (!match) return null;
  const ts = Number.parseInt(match[1] ?? '', 10);
  if (Number.isNaN(ts)) return null;
  return nowSec - ts;
}
