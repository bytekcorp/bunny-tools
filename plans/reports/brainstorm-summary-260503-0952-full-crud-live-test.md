---
type: brainstorm-summary
date: 2026-05-03
slug: full-crud-live-test
status: approved
target_version: 0.1.0-rc.11
target_account: chien (***cc39)
---

# Full CRUD Live-Test — Design Summary

## Problem
After fixing rc.11 GA-blockers (storage subdir 404 + bare-list crash), only READ commands have live verification. ~25 mutations across 8 services remain untested live. Bug #1 escaped 117 mock tests because no live test ever exercised it — same risk lurks in every untested CRUD path. Phase 5 endpoint shapes (Containers, Scripting deploy/delete) are inferred guesses.

## Approved scope: full CRUD via throwaway resources

**Naming convention.** Every test resource prefixed `bt-test-260503-` (timestamp slug). Cleanup pass greps that prefix and deletes leftovers. Existing resources (5 storage zones, 4 pull zones, 4 DNS zones, `chien-api-chat` script) **never touched**.

**Test plan — 12 phases, ~25 mutations:**

| Phase | Service | Operations | Cleanup |
| --- | --- | --- | --- |
| 1 | Storage zones | `create bt-test-zone` → `get` → `update --body=<json>` → `delete` | id-based |
| 2 | Storage files | Use Phase 1 zone (recreate): `upload`, `list /` , `download`, `delete <file>`, `sync <tmpdir>` | sync cleanup |
| 3 | Pull zones | `create bt-test-pz origin=https://...` → `get` → `update` → `delete` | id-based |
| 4 | Edge rules | On Phase 3 pz: `add --body=<rule>` → `list` → `delete <rule-id>` | rule-id |
| 5 | DNS zones | `create bt-test-260503.invalid` → `get` → `delete` | id-based |
| 6 | DNS records | On Phase 5 zone: `add --type=A --name=www --value=1.2.3.4` → `update` → `delete` | record-id |
| 7 | Stream library | `create bt-test-lib` → `get` (skip — no get cmd) → `delete` | id-based |
| 8 | Stream video | On Phase 7 lib: `upload /Users/chien/Documents/test-video.mp4` → `list` → `delete <video-id>` | video-id |
| 9 | Magic Containers | `create bt-test-app` → `delete` | id-based |
| 10 | Edge Scripting | `deploy bt-test-script --code=<tmp.js>` → `list` → `delete` | id-based |
| 11 | Deploy E2E | New zone + tmpdir with 3 files → `bunny deploy` → verify via `storage list / --recursive` → cleanup zone | full |
| 12 | Final sweep | `bunny manifest --names` × all services → grep `bt-test-` → assert zero leftovers | n/a |

## What gets verified per phase

- Endpoint URL shape (paths, trailing slashes)
- Auth scope plumbing (storage password, library API key per scope)
- Request body marshaling (zod parse on inputs)
- Response shape unmarshaling
- Error envelope on bad input (test 1 negative path per service)
- CLI table render
- `--json` flag passthrough where applicable

## Failure protocol

- **Stop on first failure.** Surface the bug, propose fix, ask before continuing.
- **Cleanup runs even on failure.** Trap-style: each phase records created resource IDs; final pass tears them down even if mid-phase failed.
- **Rate limit handling.** Already in `src/api/http.ts` (429 backoff). If we still hit it, pause 60s and continue.

## Out of scope

- `bunny init` — interactive walkthrough; tested implicitly by the `init --non-interactive` flow if needed
- `bunny configure` (interactive) — same reason
- `bunny configure list/switch/remove` — already tested in Phase A read-only
- `bunny use` — already tested no-arg path; alias add path requires `.bunnyrc` setup
- `bunny purge` — covered as part of Phase 11 deploy E2E (`bunny deploy` purges as part of pipeline)
- `bunny mcp` — separate concern; smoke-tested by Claude Code MCP integration manually
- `bunny --help-json` on commands with required args — Bug #3, deferred

## Risks

| Risk | Mitigation |
| --- | --- |
| Containers app may consume credits | Create + immediate delete; tier likely free for create/delete cycle |
| DNS zone for invalid domain still occupies slot | `delete` immediately; Bunny accepts non-routable .invalid TLD without DNS hosting |
| Stream video upload bandwidth (5.6 MB) | Acceptable; one upload only |
| Cleanup failure leaves orphans | Final sweep + manual `grep bt-test-` checklist |
| `update --body=<json>` for zones might require specific fields | Use minimal body; tolerate 4xx and report as known-shape issue rather than blocker |
| pullzone create requires `--origin` flag (registry-defined) | Provide a stable origin (e.g., https://bunny.net) |

## Success criteria

1. All 12 phases complete OR fail with diagnosed root cause
2. Zero `bt-test-*` resources remain after final sweep
3. Bug list (if any) ranked by GA severity
4. Live-test report saved to `plans/reports/live-test-260503-0952-rc11-full-crud.md`
5. Decision point: tag 0.1.0 GA OR proceed to rc.12 with new fixes

## Implementation notes (for the executor — me, next turn)

- Use bash heredoc to drive the test script — single sequential bash session keeps env vars hot
- Capture all created IDs into `/tmp/bt-test-ids.txt` so cleanup is recoverable
- `BUNNY_ACCOUNT_KEY` already in env from prior session
- `BUNNY_STORAGE_PASSWORD` re-derived per zone via `storagezone get <id>`
- For library API key: `stream library create` returns it in response; capture via `--json` if exists, else parse from default render
- Each phase = its own bash invocation to avoid timeout; ~2 min budget each

## Unresolved questions

- Stream library API key: does `stream library create` print the API key in current render, or only id+name? May need source check before Phase 8.
- Containers app create body shape: registry expects `--body=<json>` — minimal valid body unknown without docs check.
- Edge scripting `deploy` dual-mode (create-or-update): we'll exercise the create path; update path tested by re-running deploy on same name.
