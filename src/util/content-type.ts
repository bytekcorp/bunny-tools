// Content-Type resolution at upload time. Backed by `mime-types` (which uses
// mime-db's ~1000-entry table) so we never re-discover gaps like .webmanifest
// or .wasm. Auto-appends `; charset=utf-8` for `text/*` types since Bunny
// stores Content-Type verbatim and the edge serves it as-is.

import mime from 'mime-types';

const DEFAULT = 'application/octet-stream';

// `bunny.json deploy.mimeTypes` overrides keyed by extension WITH dot prefix
// (".mjs": "application/javascript"). The dot is part of the user's mental
// model and matches how extensions are written in code/docs.
export type MimeOverrides = Record<string, string>;

export function contentTypeFor(path: string, overrides?: MimeOverrides): string {
  const i = path.lastIndexOf('.');
  if (i < 0) return DEFAULT;
  const ext = path.slice(i).toLowerCase(); // includes the dot

  // 1. User overrides win.
  if (overrides && overrides[ext]) return withCharset(overrides[ext]);

  // 2. mime-types lookup (extension WITHOUT dot — the package's API).
  const looked = mime.lookup(ext.slice(1));
  if (looked) return withCharset(looked);

  return DEFAULT;
}

// Append `; charset=utf-8` to text-y types so Bunny serves them with the
// charset hint. mime-types' charset() helper is conservative and only flags
// types that are actually text — match its behavior so binary types don't
// get a misleading charset.
function withCharset(type: string): string {
  if (type.includes('charset=')) return type;
  if (mime.charset(type) === 'UTF-8') return `${type}; charset=utf-8`;
  return type;
}
