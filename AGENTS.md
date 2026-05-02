# AGENTS.md — bunny-tools

Bunny.net CLI — storage deploy, CDN purge, full resource management.

**Binary:** `bunny`  |  **Version:** 0.1.0-rc.3  |  **Active commands:** 46/46

<!-- HANDCURATED:START -->

## Quickstart for AI agents

When asked to deploy a project to Bunny.net using bunny-tools:

1. Check that `bunny.json` exists in the project root. If not, run `bunny init`.
2. Check global creds with `bunny auth list`. If empty, run `bunny configure --non-interactive --account-key=... --storage-zone=... --storage-password=...`.
3. Run `bunny deploy --dry-run` first to verify the plan.
4. Run `bunny deploy` to sync storage and purge CDN cache.

## Common workflows

- **Deploy a static site**: `bunny deploy`
- **Purge CDN cache only**: `bunny purge tag:<name>` or `bunny purge pull-zone:<id>`
- **List storage zones**: `bunny storage-zone:list --json`
- **Manage DNS records**: `bunny dns:record:list <zone>` then `bunny dns:record:add ...`

## Gotchas

- Bunny has 4 distinct credential types (account, storage zone, stream library, database). All use the `AccessKey` HTTP header but with different scopes.
- Storage uses 8 regional endpoints; bunny-tools resolves the region per zone automatically.
- Pagination: bunny-tools always uses `page=1, perPage=1000` to avoid Bunny’s `page=0` array footgun.
- Per-folder storage cap: keep <10000 files per directory.
- Tag-based purge requires the origin to set a `Cache-Tag` response header. Without it, fall back to `purge: "all"`.

## MCP usage

`bunny mcp` boots an MCP stdio server (Phase 6). Install for Claude Code with:

```bash
claude mcp add bunny-tools npx -y bunny-tools mcp
```

<!-- HANDCURATED:END -->

## Command tree (auto-generated)

### Phase 1

- `bunny manifest` [active] — Print the bunny-tools command registry as JSON. _mcp: `bunny.manifest`_

### Phase 2

- `bunny init` [active] — Initialize a bunny.json + creds in one shot. Auth → feature multi-select → per-feature config. _mcp: `bunny.init`_
- `bunny auth:set` [active] — Store an API key for a scope (account, storage:<zone>, stream:<lib>).
- `bunny auth:list` [active] — List stored credential scopes (masked).
- `bunny auth:clear` [active] — Remove a stored credential.
- `bunny use` [active] — Switch active alias from .bunnyrc; with no arg, list aliases.
- `bunny deploy` [active] — Sync public dir to storage zone and purge CDN cache. _mcp: `bunny.deploy`_
- `bunny purge` [active] — Purge CDN cache by URL or pull-zone:<id>. _mcp: `bunny.purge`_

### Phase 3

- `bunny storage:upload` [active] — Upload a file to a storage zone.
- `bunny storage:download` [active] — Download a file from a storage zone.
- `bunny storage:list` [active] — List a storage-zone path. _mcp: `bunny.storage_list`_
- `bunny storage:delete` [active] — Delete a file or path from a storage zone.
- `bunny storage:sync` [active] — Sync a local directory to a storage zone (upload-only, no purge).
- `bunny storage-zone:list` [active] — List storage zones. _mcp: `bunny.zones_list`_
- `bunny storage-zone:get` [active] — Get a storage zone by id or name. _mcp: `bunny.zone_get`_
- `bunny storage-zone:create` [active] — Create a storage zone. _mcp: `bunny.zone_create`_
- `bunny storage-zone:update` [active] — Update a storage zone (raw JSON body).
- `bunny storage-zone:delete` [active] — Delete a storage zone. _mcp: `bunny.zone_delete`_
- `bunny pull-zone:list` [active] — List pull zones.
- `bunny pull-zone:get` [active] — Get a pull zone.
- `bunny pull-zone:create` [active] — Create a pull zone.
- `bunny pull-zone:update` [active] — Update a pull zone (raw JSON body).
- `bunny pull-zone:delete` [active] — Delete a pull zone.
- `bunny pull-zone:edge-rule:list` [active] — List edge rules on a pull zone.
- `bunny pull-zone:edge-rule:add` [active] — Add an edge rule to a pull zone (raw JSON rule).
- `bunny pull-zone:edge-rule:delete` [active] — Delete an edge rule by Guid.

### Phase 4

- `bunny dns:list` [active] — List DNS zones.
- `bunny dns:get` [active] — Get a DNS zone (with records) by id.
- `bunny dns:create` [active] — Create a DNS zone for a domain.
- `bunny dns:delete` [active] — Delete a DNS zone.
- `bunny dns:record:list` [active] — List DNS records for a zone. _mcp: `bunny.dns_records`_
- `bunny dns:record:add` [active] — Add a DNS record (A, AAAA, CNAME, TXT, MX, SRV, CAA, NS). _mcp: `bunny.dns_record_set`_
- `bunny dns:record:update` [active] — Update a DNS record (raw JSON body).
- `bunny dns:record:delete` [active] — Delete a DNS record. _mcp: `bunny.dns_record_delete`_

### Phase 5

- `bunny stream:library:list` [active] — List Stream video libraries.
- `bunny stream:library:create` [active] — Create a Stream video library.
- `bunny stream:video:list` [active] — List videos in a library.
- `bunny stream:video:upload` [active] — Upload a video to a library.
- `bunny stream:video:delete` [active] — Delete a video.
- `bunny containers:app:list` [active] — List Magic Containers apps.
- `bunny containers:app:create` [active] — Create a Magic Containers app.
- `bunny containers:app:delete` [active] — Delete a Magic Containers app.
- `bunny scripting:list` [active] — List edge scripts.
- `bunny scripting:deploy` [active] — Deploy an edge script from a source file (creates new, or updates by id).
- `bunny scripting:delete` [active] — Delete an edge script.

### Phase 6

- `bunny mcp` [active] — Boot the bunny-tools MCP stdio server (for AI agents).

---

_Generated from `src/manifest/registry.ts` by `npm run gen:agents`. Do not edit auto sections by hand._
