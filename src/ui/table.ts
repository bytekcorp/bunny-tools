// Tiny aligned-columns formatter for human-readable list outputs.
// Use --json on commands when machine-readable shape is needed.

export function renderTable(rows: Array<Record<string, string | number>>, headers?: string[]): string {
  if (rows.length === 0) return '(no rows)';
  const cols = headers ?? Object.keys(rows[0] ?? {});
  const widths = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)),
  );
  const fmt = (vals: Array<string | number>) =>
    vals.map((v, i) => String(v).padEnd(widths[i] ?? 0)).join('  ');
  const lines = [fmt(cols), fmt(widths.map((w) => '-'.repeat(w)))];
  for (const r of rows) lines.push(fmt(cols.map((c) => r[c] ?? '')));
  return lines.join('\n');
}
