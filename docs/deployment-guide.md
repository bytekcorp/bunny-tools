# Deployment Guide

## Release Workflow

bunny-tools uses **GitHub Actions with OIDC trusted publishing** for releases. Local `npm publish` is no longer supported.

### Prerequisites

- Bump `version` in `package.json` AND `version` in `src/manifest/registry.ts` (both must match)
- Generated artifacts (`manifest.json`, `AGENTS.md`, `schema/bunny.schema.json`) must be up to date

### Release Steps

1. **Bump version in two places:**
   ```bash
   # Edit package.json: "version": "0.1.0-rc.X"
   # Edit src/manifest/registry.ts: version: "0.1.0-rc.X"
   ```

2. **Regenerate artifacts:**
   ```bash
   npm run gen:all && npm run build
   ```
   This regenerates:
   - `manifest.json` - registry as JSON (used by CLI, MCP, AI agents)
   - `AGENTS.md` - AI-agent guidance (shipped in npm tarball)
   - `schema/bunny.schema.json` - JSON Schema for bunny.json
   - `dist/` - compiled CLI binary

3. **Update documentation:**
   - Add entry to `docs/project-changelog.md` with RC number, date, and summary
   - Update `docs/project-roadmap.md` if phase/status changes

4. **Commit the bump:**
   ```bash
   git add .
   git commit -m "feat/fix/chore: 0.1.0-rc.X - <title>"
   ```
   Use conventional commit prefix matching the change type:
   - `feat:` - new features
   - `fix:` - bug fixes
   - `chore:` - version bumps, build config, dependencies
   - `docs:` - documentation only

5. **Push to main:**
   ```bash
   git push origin main
   ```

6. **Tag the release:**
   ```bash
   git tag v0.1.0-rc.X
   git push origin v0.1.0-rc.X
   ```

### CI/CD Automation

On tag push matching `v*`, GitHub Actions (`.github/workflows/release.yml`) automatically:

1. **Run CI gates** (must all pass):
   - TypeScript typecheck
   - ESLint (via `npm run lint`)
   - Unit + e2e tests (`npm test`)
   - Build (`npm run build`)
   - **Drift check:** Verify generated artifacts are up to date (re-runs `npm run gen:all` and diffs)

2. **Publish to npm:**
   - Uses **OIDC trusted publishing** (no npm token, no OTP)
   - Generates cryptographic provenance signature
   - Publishes to `latest` dist-tag (pre-1.0 convention)
   - Tags every RC as `latest` until GA ships; then prereleases switch to `next`

### Why OIDC?

- **No local tokens:** Eliminates npm 2FA OTP burden on developer
- **No token leaks:** Short-lived identity, ephemeral credentials
- **Cryptographic proof:** Every published RC is signed with GitHub's identity (npm provenance)
- **Audit trail:** Release tied to commit SHA + tag

### Installation After Release

Users install the latest RC via:
```bash
npm install -g bunny-tools       # Always installs from `latest` dist-tag
```

No `@alpha` tag is used pre-1.0; every RC is treated as the current stable.

### Dist-tags (Pre-1.0)

| Tag | Meaning |
|---|---|
| `latest` | Newest RC (e.g., rc.39) |
| (none) | No special tags pre-1.0 |

When GA ships (1.0.0), strategy changes:
- `latest` → points to 1.0.0 stable
- `next` → points to latest prerelease (rc/beta versions)

---

## Local Development

### Build & Test Locally

```bash
npm ci                           # Install dependencies
npm run build                    # TypeScript → dist/cli.js
npm run gen:all                  # Regenerate manifest.json, AGENTS.md, schema
npm test                         # Unit tests
npm run test:e2e                 # E2E tests (requires BUNNY_E2E=1)
npm run dev -- --help            # Test binary locally
```

### Before Pushing

```bash
npm run lint                     # Check for style issues
npm run typecheck                # TS strict mode
npm test                         # All tests must pass
npm run gen:all && git diff      # Verify no drift
```

---

## Troubleshooting

### "Generated artifacts are out of date"

If the drift check fails during CI, run locally:
```bash
npm run gen:all
git diff manifest.json AGENTS.md schema/bunny.schema.json
git add manifest.json AGENTS.md schema/bunny.schema.json
git commit -m "chore: regenerate artifacts"
git push origin main
```

Then re-tag the release.

### "npm publish failed: 401"

This should not happen with OIDC in CI. If you see it:
- Verify GitHub Actions permissions include `id-token: write`
- Check `.github/workflows/release.yml` has the correct OIDC config
- Verify npm registry is set to `https://registry.npmjs.org`

### "Test failures in CI"

Tag was pushed but CI gates failed. Options:
1. **Fix the code locally**, re-push to main, and re-tag with same version (force):
   ```bash
   # Fix the issue
   git add .
   git commit -m "fix: resolve test failure"
   git push origin main
   git tag -f v0.1.0-rc.X
   git push origin -f v0.1.0-rc.X
   ```
2. **Or** bump to next RC version and start fresh.

---

## Version Numbering

- Pre-1.0: `0.1.0-rc.X` (release candidate)
- GA: `0.1.0` (stable)
- Future majors: `1.0.0`, `2.0.0`, etc.

Versioning follows [Semantic Versioning](https://semver.org/). BREAKING changes are noted in commit messages and changelog.

---

## Resources

- **Workflow:** `.github/workflows/release.yml`
- **Registry:** `src/manifest/registry.ts` (version source)
- **Changelog:** `docs/project-changelog.md`
- **npm package:** [bunny-tools on npm](https://www.npmjs.com/package/bunny-tools)
