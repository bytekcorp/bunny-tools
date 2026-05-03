# Brainstorm: rc.33 — MIME complete + DX polish bundle

**Date:** 2026-05-03
**Trigger:** User dump of 17 items from production usage. After triage, 6 items already resolved (rc.27/30/31), leaving 11 active. User chose to bundle MIME fix + 7 DX polish items into one rc.33; 3 items follow as rc.34/35/36.

---

## Schedule

| RC | Scope |
|---|---|
| **rc.33** | MIME complete + 7 DX polish + auto-migrate ignores |
| rc.34 | `bunny domain connect <pzId> <fqdn>` atomic command |
| rc.35 | `bunny init --ci` GH Actions workflow generator |
| rc.36 | `bunny.json deploy.headers` + `deploy.edgeRules` declarative (edge-rule sync) |

## Items shipped in rc.33

### 1. MIME complete (#1, #14)
- Drop manual `~30-entry` table in `src/util/content-type.ts`.
- `npm i mime-types`. Use `mime.lookup(path)` for ~1000 extensions (covers `.webmanifest`, `.wasm`, `.opus`, `.heic`, etc.).
- Auto-append `; charset=utf-8` for `text/*` types (preserves current behavior).
- Default fallback `application/octet-stream` (unchanged).
- New `bunny.json deploy.mimeTypes: { ".ext": "type" }` overrides — dot-prefix shape.
- New `--verbose` flag on `bunny deploy`: prints `<path> [<mime>] (<size>)` per upload.

### 2. MCP `dns_record_set` PULLZONE convenience (#5)
- Schema gains optional `pullZoneId: number`.
- When `type=PULLZONE` + `pullZoneId` set → fetch PZ via `getPullZone(id)`, derive Value (PZ.Name) + LinkName (PZ.Id).
- When `type=PULLZONE` + `pullZoneId` not set → require value+linkName as today (back-compat).
- Mirrors CLI's `--pull-zone` ergonomics through MCP.

### 3. Default ignores extended (#9, with auto-migrate)
- New defaults: `bunny.json`, `.bunnyrc`, `.bunny-state.json`, `**/.*`, `**/node_modules/**`, `docs/**`, `plans/**`, `scripts/**`, `tests/**`, `README.md`, `LICENSE*`, `CONTRIBUTING.md`, `CLAUDE.md`, `AGENTS.md`, `*.md`.
- **Auto-migrate**: on `bunny deploy`, if `deploy.ignore` is byte-equal to the LEGACY default array (5 entries), rewrite bunny.json with the new default array (15 entries). Log: `i Upgraded bunny.json default ignores to rc.33+ baseline.`
- Idempotent: after migration, the array no longer matches legacy → no-op on subsequent deploys.
- Safety: ANY customization (added an entry, removed one, reordered) → no rewrite.

### 4. Account-key transparency (#10)
- When `bunny init` (or any auth-skipping path) finds key already configured, print: `i Account key already configured (***xxxx from env|keychain). Skipping auth step.`
- Reuses existing `maskCredential` helper.

### 5. Dry-run orphan list (#11)
- In `core/deploy.ts` dry-run code path: when orphans > 0, print first 10 paths + count.
- Format: `i would delete: a.css, b.js, c.html, ... (47 more)`
- `--verbose` shows all.

### 6. Large file warning (#12)
- Per-file pre-upload check at hardcoded 5 MB threshold.
- Format: `! large file: path/big.bin (12.3 MB)` to stderr.
- Non-blocking; informational only. Bundlers usually catch this; the warning is a second line of defense.

### 7. MCP `bunny.deploy` description sharpened (#13)
- New: "**Recommended for CI/CD.** End-to-end deploy: walks publicDir, diffs vs storage zone, uploads changed files with proper MIME types in parallel, optionally purges CDN. Replaces custom upload scripts."

### 8. Auto-spawned PZ detection (#15)
- After `dns record add` POST returns, inspect response for `AcceleratedPullZoneId !== 0`.
- If non-zero, emit: `i Bunny auto-created pull zone <id> to handle this record.`
- Catches REDIRECT (Type 5) side effects without needing a follow-up API call.

## Tests

- **MIME unit tests:** verify `contentTypeFor` returns mime-types result for known extensions (`.webmanifest`, `.wasm`, `.mp3`); falls back to `octet-stream` for unknown; respects `bunny.json deploy.mimeTypes` overrides.
- **Migration unit tests:** byte-equal legacy → rewrite; one-entry diff → no-op; reordered → no-op.
- **MCP `dns_record_set` PULLZONE convenience:** test that pullZoneId-only invocation derives Value+LinkName.
- **Auto-spawned PZ detection:** mock REDIRECT response with AcceleratedPullZoneId=999 → assert info message logged.
- **Default ignores in bunny init:** new bunny.json contains all 15 entries.

Existing tests should continue to pass; if `contentTypeFor` signature changes (now takes overrides), update callers and 1-2 tests.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Auto-migration writes bunny.json on a CI run with read-only FS | Wrap in try/catch; log failure but proceed with deploy. Migration is opportunistic, not required. |
| User had legacy default by manual coincidence and gets surprise rewrite | Vanishingly unlikely. Log line clearly states migration happened so user can revert if intentional. |
| `mime-types` package adds ~80KB to install size | Acceptable for a CLI; replaces manual maintenance burden. Alternative was adding ~30 more entries by hand and missing the next gap. |
| Default ignores too aggressive for docs-site users | They override via `deploy.ignore` in bunny.json. README example for "deploy a docs site" shows the override. |
| Charset on text/* might break binary text files (e.g., user-served `.dat` typed as text) | mime-types library is conservative — only `text/html`, `text/css`, etc. get the charset. `.dat` falls through to octet-stream. |

## Out of scope (future RCs)

- **rc.34**: `bunny domain connect <pzId> <fqdn>` atomic Connect Domain (#7)
- **rc.35**: `bunny init --ci` workflow generator (#8)
- **rc.36**: `bunny.json deploy.headers` + `deploy.edgeRules` declarative edge-rule sync (originally v0.2)

## Effort estimate

- mime-types swap + override + verbose: 30 min
- MCP PULLZONE convenience: 15 min
- Default ignores + auto-migrate: 25 min
- Account-key transparency: 10 min
- Dry-run orphan list: 10 min
- Large file warning: 10 min
- MCP description polish: 5 min
- Auto-spawned PZ detection: 15 min
- Tests across all: 30 min
- Docs (README + changelog + roadmap): 15 min

**Total: ~165 min single sitting.** Larger than rc.30/31/32 but bundled for one ship.

## Open questions

None — all 4 ambiguities resolved (default-ignore scope, mimeTypes shape, MCP PZ shape, large-file threshold) plus migration semantics (auto-rewrite when legacy match).
