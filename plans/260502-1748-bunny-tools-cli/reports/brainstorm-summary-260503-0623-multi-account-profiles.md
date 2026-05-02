# Multi-account credential profiles — Brainstorm Summary

**Date:** 2026-05-03 06:23
**Trigger:** User asked how to manage global API keys + multi-account.
**Status:** Design approved; ready for implementation in `0.1.0-rc.9`.

---

## 1. Problem

bunny-tools rc.8 supports a single account via `auth set/list/clear`. Bunny has no OAuth, so each account = pasted API key. Real-world users (agencies, freelancers, personal+work) need multiple accounts. UX of `auth set/list/clear` is described as "not good".

## 2. Final design (locked)

### 2.1 Surface — replace `auth:*` with `configure:*`

| Command | Purpose |
|---|---|
| `bunny configure` | Interactive walkthrough for the **active** profile. Account key → optional storage zone + password → optional pull zone → optional stream library + key. Idempotent (re-running shows masked current values + change/keep/clear). |
| `bunny configure --profile=work` | Same walkthrough but targets/creates the `work` profile. Doesn't change which profile is active. |
| `bunny configure --non-interactive --account-key=... [--profile=...] ...` | CI form. Same flag set as today's `init --non-interactive`. |
| `bunny configure list [--json]` | Show all profiles + their scopes (values masked). Marks the active one. |
| `bunny configure switch <profile>` | Set active profile (writes `active` field in credentials.json). |
| `bunny configure remove [--profile=<name>] [--scope=<scope>]` | Remove either the entire profile or a specific scope within a profile. Confirms destructively unless `--yes`. |

**Removed in rc.9 (breaking):** `bunny auth set`, `bunny auth list`, `bunny auth clear`.

### 2.2 Global flag

- **`-p, --profile <name>`** — one-shot profile select for any command. Mirrors AWS's `--profile`.
- **`BUNNY_PROFILE` env var** — same effect; useful for `direnv` per-project setups.

### 2.3 `bunny init` behavior

- **No project-level binding.** `bunny.json` stays profile-agnostic; no `profile` field.
- `bunny init` (no flag) → uses the active profile (whichever is set in `credentials.json#active`).
- `bunny init --profile=work` → uses `work` profile. If `work` doesn't exist, `configure` walkthrough kicks in inline.
- `bunny -p work deploy` → uses `work` profile for that one invocation.

This means: project binds to a storage zone and pull zone in `bunny.json`. Which Bunny **account** owns those zones is decided per-shell or per-invocation. Same project can be deployed via different accounts as long as zone names match (rare, but possible).

### 2.4 Storage layout

**`~/.config/bunny-tools/credentials.json`** (mode 0600):

```json
{
  "active": "default",
  "profiles": {
    "default": {
      "account": "abc123...",
      "storage:my-app": "pw-xyz...",
      "stream:42": "lib-key..."
    },
    "work": {
      "account": "def456...",
      "storage:work-zone": "..."
    }
  }
}
```

**Keychain (keytar, service=`bunny-tools`)**: account name format becomes `<profile>:<scope>` (e.g. `default:account`, `work:storage:my-app`).

### 2.5 Resolver chain (rc.9)

For each call needing a credential at scope `S`, resolve in order:

1. **Explicit `--<flag>`** (e.g. `--account-key`, `--storage-password`).
2. **Scoped env per active profile**, e.g.:
   - `BUNNY_ACCOUNT_KEY_<PROFILE>` (e.g. `BUNNY_ACCOUNT_KEY_WORK`)
   - `BUNNY_STORAGE_PASSWORD_<PROFILE>_<ZONE>` (e.g. `BUNNY_STORAGE_PASSWORD_WORK_MY_APP`)
3. **Generic env** (rc.8 names retained, treated as if for active profile):
   - `BUNNY_ACCOUNT_KEY`, `BUNNY_STORAGE_PASSWORD`, etc.
4. **Keychain** at `<active_profile>:<scope>`.
5. **File store** at `profiles[active_profile][scope]`.
6. **Interactive prompt** (TTY only).

`-p/--profile` overrides the active-profile lookup at every step.

### 2.6 Migration from rc.8 (auto, transparent)

On first read of `credentials.json`:
- Old flat shape (`{ "account": "abc", "storage:my-app": "pw" }`) → wrapped into `default` profile.
- Existing keychain entries with bare scope (no `<profile>:` prefix) → treated as `default` profile, no rewrite needed.
- New writes always use the new shape.

Net effect: rc.8 users upgrading to rc.9 see no behavior change unless they `bunny configure --profile=<new>` to add another account.

## 3. Approaches evaluated

### A. Single `bunny configure` namespace (CHOSEN)

Pros:
- One verb for credential management. Matches `aws configure`, `gcloud auth`.
- Subcommands are clear: list / switch / remove.
- Walkthrough naturally extends to profile-aware via `--profile`.

Cons:
- "Configure" is a slightly long word to type.
- We previously removed `configure` (rc.3). Bringing it back is a churn signal — but it's a different command this time (auth/profile, not project init), so the role is distinct.

### B. Split `configure` (walkthrough) + `profile` namespace

Rejected: more surface, no real win. `configure list` is fine.

### C. Flat verbs (`bunny login`, `bunny profiles ...`)

Rejected: `login` misleads without OAuth (we've debated 3x). Honesty wins.

## 4. Honest assessment

- This is the FOURTH design pivot for auth (auth split → auth merged → space-restructure → multi-account). Each pivot has cost. **Rc.9 should be the last pivot before GA.** No more auth changes after this.
- Removing `auth:set/list/clear` is breaking. rc.8 has near-zero users (you, me). Cost is small but document in CHANGELOG.
- Multi-account is a real win for agency/freelance/personal+work — niche today, valuable when it surfaces.
- The migration from flat → nested file shape is forgiving: zero user action needed.

## 5. Implementation notes

### 5.1 Files affected

| Layer | Change |
|---|---|
| `src/config/credential-resolver.ts` | Add profile awareness. Read both shapes (auto-migrate). New helper `getActiveProfile()`. |
| `src/cli.ts` | Add `-p, --profile <name>` global flag; set `BUNNY_PROFILE` env in preAction. |
| `src/manifest/registry.ts` | Remove `auth set/list/clear` entries. Add `configure`, `configure list`, `configure switch`, `configure remove`. |
| `src/commands/auth/*` | Delete (3 files). |
| `src/commands/configure.ts` | New top-level + subcommands (could be one file or split). |
| `src/core/configure.ts` | Restored, profile-aware. Replaces old `core/configure.ts` we deleted in rc.3. |
| `src/core/auth.ts` | Drop `parseScopeFlag`-only paths; replace with profile-aware setKey/clearKey. |
| `src/core/init.ts` | Read `process.env.BUNNY_PROFILE` to select profile for `runInit`. |
| `src/commands/whoami.ts` | Show active profile + listing of all profiles (compact). |
| Tests | Refactor `auth.test.ts` → `configure.test.ts` (profile-aware). Update `credential-resolver.test.ts`. Update `init.test.ts` to verify profile awareness. |
| Docs | README, AGENTS.md, project-overview-pdr update. |

### 5.2 Test plan additions

- Resolver test: with two profiles set, switching active picks the correct credential.
- Migration test: flat-shape file auto-migrates to `default` profile, no data loss.
- `configure --profile=work` creates the profile, doesn't change `active`.
- `configure switch work` changes `active` only.
- `configure remove --profile=work` deletes the profile, but leaves others.
- `bunny -p work deploy` uses work profile for that invocation only.
- Keychain compat: bare-scope entries read as `default` profile.

### 5.3 Effort

~3-4 hours. Ships as `0.1.0-rc.9`. Auto-publishes via OIDC.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Migration corrupts existing credentials.json | Read with fallback to old shape; never write old shape; atomic write. Test with a synthetic rc.8 file. |
| User confusion: which profile is active right now? | `bunny whoami` shows active profile prominently. `bunny configure list` marks active with `*`. |
| Project deployed to wrong account by accident | `bunny deploy --dry-run` already exists; profile name appears in deploy banner ("Deploying as [profile=work]"). |
| Same scope name across profiles silently shadows | Resolver always scopes by `<profile>:<scope>`; no cross-profile leakage. Test asserts. |
| Keychain orphans on profile rename | `configure remove --profile=X` clears all `X:*` keychain entries. No rename op (use remove + new configure). |

## 7. Success criteria

- `bunny configure` (no flag) walks through the active profile end-to-end.
- `bunny configure --profile=work` creates a new profile without disturbing active.
- `bunny configure list` shows: profile names, active marker (`*`), masked scopes per profile.
- `bunny configure switch work` rotates the active profile; subsequent `deploy` uses work.
- `bunny -p personal deploy` uses personal profile for one invocation; active stays where it was.
- rc.8 → rc.9: existing credentials still resolve without user action.
- All 112 tests pass plus ~10 new tests for profile features.
- `bunny --help` no longer mentions `auth set/list/clear`.

## 8. Open items (post-implementation)

- Should `bunny init` print "using profile <X>" early so user sees it before answering questions? (Recommendation: yes, single line.)
- Should `bunny configure list` also show env-var overrides currently in effect? (Recommendation: yes, in `--json` output as a `notes` field.)
- Should `BUNNY_PROFILE=missing-name` fall back silently to active or fail loudly? (Recommendation: fail loudly with "profile not found, run `bunny configure --profile=missing-name`".)
