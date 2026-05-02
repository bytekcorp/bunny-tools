---
phase: 5
title: "Alpha 4 — Stream/Containers/Scripting"
status: completed
priority: P2
effort: "5-8d"
dependencies: [4]
completed: "2026-05-02"
release: "0.1.0-rc.2"
---

# Phase 5: Alpha 4 — Stream/Containers/Scripting

## UN-DEFERRAL NOTE

Originally deferred to v0.2 mid-session per slip-gate logic. **Un-deferred** the same day at user request — shipped in v0.1.0 alongside the rest of the surface.

**Scope as shipped (11 commands, matching the registry):**
- `stream:library:list`, `stream:library:create`
- `stream:video:list`, `stream:video:upload`, `stream:video:delete`
- `containers:app:list`, `containers:app:create`, `containers:app:delete`
- `scripting:list`, `scripting:deploy`, `scripting:delete`

**Out-of-scope (deferred to v0.2):** advanced sub-resources — `stream:collection:*`, `stream:caption:*`, `containers:endpoint:*`, `containers:volume:*`, `containers:autoscale:*`, `scripting:secret:*`, `scripting:variable:*`. The 11 shipped commands cover the core daily ops; finer-grained sub-resource CRUD lands in v0.2.

---

# Phase 5: Alpha 4 — Stream/Containers/Scripting (shipped 2026-05-02)

## Overview

Largest API surface, lowest daily-deploy value. Adds `stream:*` (video.bunnycdn.com base + per-library API key), `containers:*` (Magic Containers), `scripting:*` (Edge Scripting). Releasable as `0.1.0-alpha.4`. **May be demoted to v0.2 per phase-4 slip gate.**

## Context Links

- Researcher API §5 (Stream), §6 (Magic Containers), §7 (Edge Scripting)
- Design §6.2 (command tree)

## Requirements

**Functional — Stream**
- `stream:library:list`, `stream:library:create <name>`, `stream:library:get <id>`, `stream:library:delete <id> [--yes]`.
- `stream:video:list <library> [--collection]`, `stream:video:upload <library> <file> [--title] [--collection]`, `stream:video:get <library> <video>`, `stream:video:delete <library> <video> [--yes]`.
- `stream:collection:{list,create,delete} <library> ...`.
- Captions: `stream:caption:add <library> <video> <lang> <file>`, `stream:caption:delete <library> <video> <lang>`.

**Functional — Magic Containers**
- `containers:app:list`, `containers:app:create <name> [--image] [--region]`, `containers:app:get <name>`, `containers:app:update <name> [...]`, `containers:app:delete <name> [--yes]`.
- `containers:endpoint:{list,create,delete} <app> ...`.
- `containers:volume:{list,create,delete} <app> ...`.
- `containers:autoscale:{get,set} <app> ...`.

**Functional — Edge Scripting**
- `scripting:list`, `scripting:get <id>`, `scripting:create <name> --file=<src>`, `scripting:update <id> --file=<src>`, `scripting:delete <id>`.
- `scripting:secret:{list,set,delete} <scriptId> ...`.
- `scripting:variable:{list,set,delete} <scriptId> ...`.

**Non-functional**
- Stream library API key resolved via `stream:<libraryId>` scope.
- Container/scripting use Account API key.
- Video upload supports streaming from disk; handles progress for large files.

## Architecture

```
src/commands/stream/{library,video,collection,caption}/{list,create,get,update,delete,...}.ts
src/commands/containers/{app,endpoint,volume,autoscale}/...
src/commands/scripting/{list,get,create,update,delete}.ts
src/commands/scripting/{secret,variable}/{list,set,delete}.ts

src/api/stream.ts          → video.bunnycdn.com + per-library AccessKey
src/api/account.ts (extend) → /mc/* (containers) + /script/* (scripting)
```

## Related Code Files

**Create**
- `src/api/stream.ts`
- `src/commands/stream/**`
- `src/commands/containers/**`
- `src/commands/scripting/**`
- `test/commands/stream/**`, `test/commands/containers/**`, `test/commands/scripting/**`

**Modify**
- `src/api/account.ts` — `/mc/*` and `/script/*` endpoints.
- `src/cli.ts` — register full command tree.

## File Ownership

`src/api/stream.ts`, `src/commands/stream/**`, `src/commands/containers/**`, `src/commands/scripting/**`, `test/commands/stream/**`, `test/commands/containers/**`, `test/commands/scripting/**`. Extends `src/api/account.ts`, `src/cli.ts`.

## Implementation Steps

1. `src/api/stream.ts`: undici Pool to `https://video.bunnycdn.com`; AccessKey resolved per call from scope `stream:<lib>`. Endpoints: library CRUD, video CRUD, collection CRUD, caption upload, statistics, heatmap (read).
2. Extend `src/api/account.ts` with Magic Containers (`/mc/apps/...`) and Edge Scripting (`/script/...`) endpoints.
3. Stream commands following existing pattern; `stream:video:upload` streams the file (no full-buffer load) and shows progress for files > 10MB.
4. Containers commands; `containers:app:deploy` is sugar for "update + roll". Defer if API doesn't expose a roll trigger; document the limitation.
5. Scripting commands; `scripting:create/update --file=...` reads the source file; secrets/variables CRUD.
6. Tests: per resource — list, get, create (with valid+invalid input), delete. Stream upload tested with mock 10MB file (Buffer-backed Nock).

## Success Criteria

- [ ] Stream video upload of a 100MB file completes with progress, no memory blowup (`--max-old-space-size=128` test).
- [ ] All three product surfaces have happy-path coverage; one failure path each.
- [ ] No video/script content logged at any verbose level.
- [ ] Releases as `0.1.0-alpha.4` (or marked deferred to v0.2 per slip gate).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Stream API quirks (multipart vs single PUT) undocumented | Test with real fixture (in CI as Nock recording, no live key). Use `Content-Length` chunked upload if PUT fails for large videos; fall back to documented limitation. |
| MC API surface large; some endpoints unstable | Cover `apps`, `endpoints`, `volumes`, `autoscale` only. Document scope limit. |
| Per-library Stream key juggling | `bunny auth set --scope stream:<libId>` per library; `stream:*` commands require `--library` and resolve scope from it. |
| Phase trends past sprint length | If 2+ weeks elapsed at any sub-milestone, ship what's done as `0.1.0-alpha.4` and demote remainder to `v0.2`. |

## Code Review Checklist

- [ ] Stream uploads streamed (no `fs.readFileSync` for video).
- [ ] All Stream calls go through `src/api/stream.ts`; no account-API host mixed in.
- [ ] No secret values printed by `scripting:secret:list`; show keys + `***`.

## Docs Updates

- README: stream/containers/scripting examples.
- `docs/codebase-summary.md`: extended module list.
- `docs/project-roadmap.md`: mark scripting/containers as v0.1 if shipped here, v0.2 if demoted.

## Next Steps

→ Phase 6 (GitHub Action & Release): final 0.1.0 GA.
