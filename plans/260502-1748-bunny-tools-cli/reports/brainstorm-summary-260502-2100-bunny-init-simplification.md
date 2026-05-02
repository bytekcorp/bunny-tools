# bunny init Simplification — Brainstorm Summary

**Date:** 2026-05-02 21:00
**Trigger:** User feedback that current `bunny configure` + `bunny init` split is over-engineered.
**Status:** Design approved; ready for `/ck:plan` and implementation in `0.1.0-rc.3`.

---

## 1. Problem

Today bunny-tools ships two interactive commands with overlapping prompts:
- `bunny configure` — global creds (account key + storage password + optional pull-zone/stream).
- `bunny init` — per-project (publicDir + storage zone + region + pull-zone + purge strategy).

User complaint: too complicated. Two commands to remember; both ask about storage zone; auth split feels like AWS configure but Bunny has no OAuth so the split's only justification is architectural cleanliness, not UX.

## 2. Comparable CLIs

| CLI | Auth | Project setup | Why it works (or doesn't) |
|---|---|---|---|
| **wrangler** | `wrangler login` (browser OAuth) or `CLOUDFLARE_API_TOKEN` env | `wrangler init` | OAuth makes login truly one-step. Two commands feel light. |
| **firebase-tools** | `firebase login` (OAuth) | `firebase init` — feature picker (Hosting? Functions? Firestore?) → fills firebase.json | OAuth + feature multi-select. The pattern bunny-tools should steal. |
| **netlify-cli** | `netlify login` (OAuth) | `netlify init` (link site) | Same pattern. |
| **aws-cli** | `aws configure` — paste keys, no project init concept | (n/a) | Creds-only because aws has no project-level config. |
| **bunny-tools today** | `bunny configure` paste-key | `bunny init` per-project | **Mistake.** Without OAuth, `configure` is just paste-key friction; `init` re-asks the same questions. |

**Insight:** the two-command pattern needs OAuth to feel light. Without OAuth, collapsing into one command is the right call.

## 3. Approaches Evaluated

### A. Collapse into single `bunny init` with feature picker (CHOSEN)

Firebase-init pattern. One command:
1. **Auth step** — skipped if env/keychain already has account key. Else prompt + validate by listing zones.
2. **Feature multi-select** — `[x] Storage+CDN  [ ] DNS  [ ] Stream  [ ] Containers  [ ] Scripting`.
3. **Per-feature config** — only the features the user selected.
4. **Write** — `bunny.json`, `.bunnyrc`, `.gitignore` patch, quickstart hint.

Pros: one entry point, no overlapping prompts, scales to all 5 product surfaces. Matches the dominant industry pattern.
Cons: `bunny init` becomes a meatier command (more code paths). Breaking change for the (zero) users currently scripted around `configure`.

### B. Keep `configure` as alias for `init --reconfigure-auth`

Same UX collapse, but `configure` keeps working as shorthand for "re-run only the auth step" (e.g. rotating keys).
Rejected: extra surface, no real benefit. Power users can re-run the whole init or use `bunny auth set --scope account --value=...`.

### C. Keep two commands but slim them

`configure` only stores account key; `init` doesn't ask for it. Less aggressive.
Rejected: still two commands. Doesn't address the cognitive load complaint.

## 4. Final Design

### 4.1 Command surface (after change)

```
bunny init                        # the only entry point — auth + project + feature config
bunny init --non-interactive ...  # CI-friendly variant; same flags as today's `configure --non-interactive`
bunny auth set/list/clear         # low-level escape hatch (multi-account, key rotation)
```

`bunny configure` is **removed**. Calling it prints `unknown command, did you mean \`bunny init\`?` (Commander default).

### 4.2 Interactive flow

```
$ bunny init
✓ Detected project root: /path/to/repo
✓ Detected publicDir: dist

Step 1 — Auth
  No credentials found. Set up now? [Y/n] Y
  ? Bunny account API key: ********
  Validating... ✓ 3 storage zones, 5 pull zones found.

Step 2 — What features will this project use?
  [x] Storage + CDN deploy   (recommended)
  [ ] DNS records management
  [ ] Stream (video library)
  [ ] Magic Containers
  [ ] Edge Scripting
  (use space to toggle, enter to confirm)

Step 3 — Storage + CDN
  ? Public directory: dist
  ? Storage zone: my-app  (3 zones found)
  ? Storage zone password: ********
  ? Pull zone: production-cdn (id=12345)  (5 pull zones found)
  ? Purge strategy after deploy:
    > all      — full pull-zone purge
      tag:app  — Cache-Tag based (origin must set Cache-Tag header)
      none     — skip purge

Step 4 — DNS  (skipped: not selected)
Step 5 — Stream  (skipped: not selected)
...

Step 6 — Write
  ✓ bunny.json
  ✓ .bunnyrc (alias=default)
  ✓ Added .bunny-state.json to .gitignore

Done. Try:
  bunny deploy --dry-run    # preview
  bunny deploy              # ship it
```

### 4.3 Non-interactive flow (CI)

```bash
bunny init --non-interactive \
  --features=storage,dns \
  --account-key=$BUNNY_ACCOUNT_KEY \
  --storage-zone=my-app \
  --storage-password=$BUNNY_STORAGE_PASSWORD \
  --pull-zone=12345 \
  --purge=all \
  --public-dir=dist
```

Same code path as interactive, just supplies all values via flags. Skips prompts.

### 4.4 Smart auth detection

Auth step is **skipped** when `resolveCredential({kind: 'account'})` succeeds (env, keychain, or file already has the key). Lets devs run `bunny init` in a second project on the same machine without re-entering creds.

### 4.5 MCP integration

Adds `bunny.init({...})` MCP tool — non-interactive only. AI agents bootstrap projects without shelling out:

```ts
{
  name: 'bunny.init',
  description: 'Initialize a bunny.json (and creds if not set). Non-interactive. Returns the written config.',
  inputSchema: z.object({
    features: z.array(z.enum(['storage', 'dns', 'stream', 'containers', 'scripting'])).min(1),
    accountKey: z.string().optional(),     // only needed if not already in env/keychain
    publicDir: z.string().default('dist'),
    storageZone: z.string().optional(),
    storagePassword: z.string().optional(),
    pullZoneId: z.number().int().optional(),
    purge: z.string().default('all'),
  }),
}
```

Brings MCP tool count from 14 → 15. Still well under the 16-cap.

## 5. Architectural Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Single `bunny init` command; remove `configure` | Without OAuth, two-command split is friction. Firebase-init is the right model. |
| D2 | Multi-select feature picker after auth | User skips uninteresting features in one keystroke vs. a yes/no chain. |
| D3 | Auth step is conditional (skip if creds exist) | Second-project setup feels instant for devs with one Bunny account. |
| D4 | `bunny auth set/list/clear` retained | Power-user escape hatch (rotate keys, multi-account). No UX cost — hidden from `bunny --help` casual readers behind the auth namespace. |
| D5 | Breaking change in `0.1.0-rc.3` | rc.2 has no production users. Clean removal cheaper than alias debt. |
| D6 | New `bunny.init` MCP tool | AI agents can bootstrap projects. Adds 1 tool; cap is 16. |
| D7 | `core/init.ts` and `core/configure.ts` merged | Single business-logic module. `core/configure.ts` deleted. |
| D8 | Existing `runConfigure(input, callbacks, opts)` shape kept inside merged module | The interactive abstraction (ask/pick/confirm callbacks) was correct — keep it; just collapse the entry points. |

## 6. Implementation Considerations

**Files affected:**
- Delete: `src/commands/configure.ts`, `src/core/configure.ts`, `test/core/configure.test.ts`.
- Rewrite: `src/commands/init.ts`, `src/core/init.ts`, `test/core/init.test.ts` (new).
- Modify: `src/manifest/registry.ts` (remove `configure` entry, expand `init` flags).
- Modify: `src/mcp/tools.ts` (add `bunny.init` tool).
- Modify: `README.md`, `AGENTS.md` (regenerated), `docs/codebase-summary.md`.

**Effort:** ~3–4 hours. Mostly mechanical: merge two interactive flows into one, add feature multi-select via `prompts.multiselect`, write tests for each feature branch.

**Test plan:**
- Non-interactive: each feature combo (`storage` only, `storage+dns`, `all`) writes correct bunny.json.
- Interactive: prompts UI mocked; verify prompt order matches feature selection.
- Auth-skip: pre-set `BUNNY_ACCOUNT_KEY` env; verify auth step doesn't prompt.
- Validation failure: bad account key → first API call rejects → user re-prompted (interactive) or fails fast (non-interactive).
- MCP: `bunny.init({features: ['storage'], ...})` writes file and returns config; rejects bad input.

**Drift check:** `manifest.json` and `AGENTS.md` will both change (commands list shrinks by 1, init's flags grow). CI drift check catches this naturally.

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Users who installed rc.2 and scripted `bunny configure` break on upgrade | rc.2 is alpha-tagged; users opted into pre-release. Document in CHANGELOG. Fallback: detect `configure` invocation, print one-line redirect message to `bunny init`. |
| Feature picker confuses users who only want Storage+CDN | Pre-check the `Storage + CDN deploy` box; user can hit Enter immediately to accept defaults. |
| Interactive prompts fail in non-TTY without `--non-interactive` flag | Existing `isInteractive()` guard already throws actionable error. Same behavior. |
| MCP `bunny.init` confuses AI agents who don't know which features to pick | Tool description states `features: array of enum`. AI passes `["storage"]` for the common case. |

## 8. Success Metrics

- ≤ 5 prompts on the typical "Storage+CDN only" flow (currently ≥ 8 across the two commands).
- One command path for both interactive and non-interactive — no behavior drift.
- All existing tests pass (104) plus ~5 new init tests for feature combinations.
- npm publish `0.1.0-rc.3` ships clean.
- AGENTS.md `## Quickstart` section updated to mention only `bunny init`.

## 9. Validation

- Manual: fresh checkout → `bunny init` end-to-end → `bunny deploy --dry-run` succeeds.
- CI: drift check passes; matrix tests stay green.
- Smoke: a second `bunny init` in another repo on same machine skips the auth step (no prompt for account key).

## 10. Next Steps

1. `/ck:plan` against this design (small plan — single phase, no sub-phases needed).
2. Implement on a feature branch.
3. Re-run code-reviewer, tests, drift check.
4. Bump to `0.1.0-rc.3`, npm publish (manual, with OTP), git tag.
5. Update README/AGENTS.md with new flow.

## 11. Resolved (this round)

- Collapse strategy: single `bunny init` with feature picker.
- Picker: multi-select up front (firebase-style).
- Compat: remove `configure` cleanly in `0.1.0-rc.3`.
- MCP: add `bunny.init` tool.

## 12. Open Items (post-plan)

- Should `bunny init` re-run on an already-initialized project (existing `bunny.json`) prompt to merge or refuse? (Lean: refuse with hint to delete or use `--force`.)
- Should `--features=all` be a shortcut for selecting every feature? (Likely yes; cheap.)
- Pre-checked feature default: just `storage` or also `dns`? (Keep just `storage`; DNS is rarer.)
