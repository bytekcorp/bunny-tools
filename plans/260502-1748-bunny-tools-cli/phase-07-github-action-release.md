---
phase: 7
title: "GitHub Action & 0.1.0 Release"
status: pending
priority: P1
effort: "3-4d"
dependencies: [6]
---

# Phase 7: GitHub Action & 0.1.0 Release

## Overview

Ship the public GA: composite GitHub Action under `action/`, JSON Schema published to unpkg for `bunny.json` autocompletion, semver release pipeline (changesets), npm publish workflow, `v1` floating tag for the Action repo. Final tag `0.1.0`.

## Context Links

- Design §6.5 (composite Action), §11 (next steps)
- Researcher UX §5 (GH Actions patterns: composite vs JS), §8 (versioning)

## Requirements

**Functional**
- Composite GH Action `action/action.yml` accepting inputs: `version`, `only`, `working-directory`, `account-key`, `storage-password`, optional `stream-key`, `purge`. Wraps `npx --yes bunny-tools@<version> deploy ...`.
- Action README with copy-paste workflow snippet.
- npm publish workflow: on tag `v*`, run tests → build → publish to npm with provenance (npm-publish-provenance). Dist-tag = `alpha` for `-alpha.N`, `latest` for stable.
- JSON Schema generation: build step runs `zod-to-json-schema` over `bunny.json` schema; output `schema/bunny.schema.json`; published with the npm package, served from unpkg via `https://unpkg.com/bunny-tools@<v>/schema/bunny.schema.json`.
- changesets configured for changelog + version bumping.
- Action repo (`bytekcorp/bunny-tools-deploy-action`) maintains a `v1` floating tag pointing at latest 0.1.x release. Release workflow updates it.

**Non-functional**
- Action npx cold-install <10s on `ubuntu-latest` (caching guidance documented).
- Release workflow does not run on PR; only on tag push.
- npm package stripped of test/source: only `dist/`, `schema/`, `LICENSE`, `README.md`, `package.json` shipped.

## Architecture

```
action/
├── action.yml                       # composite, ~30 lines
└── README.md                         # usage + inputs/outputs

schema/
└── bunny.schema.json                 # generated from zod at build

.changeset/                            # changeset config + pending releases
.github/workflows/
├── ci.yml                            # phase 1 — extended here
├── release.yml                       # tag-triggered npm publish
└── action-tag.yml                    # updates v1 in Action repo on stable release
```

**Release flow**

1. PR merged with changeset.
2. Maintainer runs `npm run version` (changesets) → bumps + writes CHANGELOG.
3. Tag `v0.1.0-alpha.N` (or `v0.1.0`) pushed.
4. `release.yml` runs: typecheck, test, build, schema gen, `npm publish --tag=alpha|latest --provenance`.
5. On stable tag, `action-tag.yml` force-updates `v1` in `bunny-tools-deploy-action` repo.

## Related Code Files

**Create**
- `action/action.yml`, `action/README.md`
- `schema/bunny.schema.json` (generated; checked in for unpkg link stability)
- `scripts/generate-schema.mjs`
- `.changeset/config.json`, `.changeset/README.md`
- `.github/workflows/release.yml`
- `.github/workflows/action-tag.yml` (or PAT-driven script)
- `CHANGELOG.md` (changesets-managed)

**Modify**
- `package.json` — `files` array, `prepublishOnly`, `version` script via changesets.
- `.github/workflows/ci.yml` — add schema-up-to-date check.
- `README.md` — promote action snippet, install + quickstart.

## File Ownership

`action/**`, `schema/**`, `.changeset/**`, `.github/workflows/release.yml`, `.github/workflows/action-tag.yml`, `scripts/generate-schema.mjs`, `CHANGELOG.md`, `README.md` polish. Touches `package.json` and `.github/workflows/ci.yml`.

## Implementation Steps

1. Author `action/action.yml`:
   ```yaml
   name: Bunny Deploy
   description: Deploy to Bunny.net storage and purge CDN cache.
   branding: { icon: cloud-upload, color: orange }
   inputs:
     version:           { default: latest }
     only:              { required: false }
     working-directory: { default: . }
     account-key:       { required: false }
     storage-password:  { required: false }
     stream-key:        { required: false }
     purge:             { required: false }
   runs:
     using: composite
     steps:
       - shell: bash
         working-directory: ${{ inputs.working-directory }}
         env:
           BUNNY_ACCOUNT_KEY:      ${{ inputs.account-key }}
           BUNNY_STORAGE_PASSWORD: ${{ inputs.storage-password }}
           BUNNY_STREAM_KEY:       ${{ inputs.stream-key }}
         run: |
           ARGS=()
           [ -n "${{ inputs.only }}" ]  && ARGS+=("--only=${{ inputs.only }}")
           [ -n "${{ inputs.purge }}" ] && ARGS+=("--purge=${{ inputs.purge }}")
           npx --yes bunny-tools@${{ inputs.version }} deploy "${ARGS[@]}"
   ```
2. `action/README.md`: usage example, full input table, security note (recommend setup-node + cache).
3. `scripts/generate-schema.mjs`: run zod-to-json-schema; emit `schema/bunny.schema.json`; CI step verifies the generated file matches checked-in version.
4. Configure changesets: init, set base branch, define release matrix.
5. `.github/workflows/release.yml`: trigger on `tags: [v*]`. Steps: setup-node 20, `npm ci`, typecheck, test, `npm run build`, `node scripts/generate-schema.mjs`, `npm publish --provenance --tag=$( [[ "$TAG" == *-alpha.* ]] && echo alpha || echo latest )`. Use `NODE_AUTH_TOKEN` from npm OIDC trust policy where possible.
6. `.github/workflows/action-tag.yml`: on stable tag, mirror the action/ subdir into `bytekcorp/bunny-tools-deploy-action` and force-update `v1` tag. (PAT or GitHub App.)
7. README polish: badges, install snippet, quickstart, GH Action snippet, link to docs/.
8. Verify npm name `bunny-tools` ownership; if taken, update `package.json#name` to `@bytekcorp/bunny-tools` and update Action snippet (`npx --yes @bytekcorp/bunny-tools@...`).
9. Cut `0.1.0-alpha.5-rc.1` for release pipeline smoke test, then `0.1.0` GA.

## Success Criteria

- [ ] `npm view bunny-tools dist-tags.latest` returns `0.1.0` (or `@bytekcorp/bunny-tools` fallback).
- [ ] A test repo using `bytekcorp/bunny-tools-deploy-action@v1` deploys end-to-end on GitHub-hosted runner.
- [ ] `bunny.json` editor autocompletion works in VS Code via `$schema` reference to unpkg URL.
- [ ] Release workflow runs only on tag push (not on PR).
- [ ] CI rejects PR if `schema/bunny.schema.json` is out of sync with zod source.
- [ ] CHANGELOG.md present and accurate from alpha.1 forward.
- [ ] LICENSE = MIT, repo public on `bytekcorp/bunny-tools`.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| npm name `bunny-tools` taken | Pre-flight check at start of phase 6; switch to `@bytekcorp/bunny-tools` and update Action snippet + README before tagging. |
| OIDC publish trust not set up | Manual `NPM_TOKEN` secret as fallback; document setup. |
| Action repo cross-repo write fails | Use GitHub App with repo-write permission; document scope. |
| Composite action cold install too slow | Document `actions/setup-node@v4` with `cache: 'npm'` in README; revisit JS Action only if real complaint. |
| Provenance not available for scoped packages on free tier | Confirm npm provenance availability; degrade gracefully. |

## Code Review Checklist

- [ ] No secrets printed in workflow logs (mask via `::add-mask::` if needed).
- [ ] `npm publish` step uses `--provenance` where supported.
- [ ] Release workflow has manual approval gate for `latest` dist-tag.
- [ ] `schema/bunny.schema.json` committed and CI-verified.

## Docs Updates

- README: install, quickstart, GH Action snippet, command reference.
- `docs/deployment-guide.md`: how to publish a new version (changesets workflow).
- `docs/project-roadmap.md`: mark v0.1 GA; sketch v0.2 (headers/rewrites/redirects sugar, edge-rule sync, optional E2E harness).
- `docs/project-changelog.md`: ensure all alphas listed.

## Next Steps

→ v0.1 GA. Open v0.2 brainstorm: headers/rewrites/redirects sugar in `bunny.json` desugaring to edge-rule sync; optional live E2E.
