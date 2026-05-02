// Canonical command registry. ADD commands here; do NOT scatter command
// definitions across files. Generators and the CLI both read this list.
//
// Phase 1 only `manifest` is `active`. Later phases promote `planned` → `active`.

import type { CommandSpec, Registry } from './types.js';

export const registry: Registry = {
  cliName: 'bunny-tools',
  binary: 'bunny',
  version: '0.1.0-alpha.0',
  description: 'Bunny.net CLI — storage deploy, CDN purge, full resource management.',
  commands: [
    // Phase 1
    {
      name: 'manifest',
      summary: 'Print the bunny-tools command registry as JSON.',
      description:
        'Outputs the canonical command registry. AI agents and tooling read this to discover commands without parsing prose. Use --pretty for indented output.',
      flags: [
        {
          name: 'pretty',
          description: 'Indent the JSON output for readability.',
          hasValue: false,
          defaultValue: false,
        },
      ],
      examples: [
        { command: 'bunny manifest', description: 'Compact JSON to stdout.' },
        { command: 'bunny manifest --pretty', description: 'Pretty-printed JSON.' },
      ],
      mcp: { tool: 'bunny.manifest', description: 'Returns the full bunny-tools registry as JSON.' },
      status: 'active',
      phase: 1,
      load: () => import('../commands/manifest.js'),
    },

    // Phase 2 — daily-use deploy loop
    {
      name: 'init',
      summary: 'Initialize a bunny.json in the current project.',
      examples: [{ command: 'bunny init', description: 'Interactive wizard.' }],
      status: 'active',
      phase: 2,
      load: () => import('../commands/init.js'),
    },
    {
      name: 'configure',
      summary: 'Interactive global setup of credentials (like aws configure).',
      flags: [
        { name: 'non-interactive', description: 'Skip prompts and accept all values via flags.', hasValue: false },
        { name: 'account-key', description: 'Account API key.', hasValue: true },
        { name: 'storage-zone', description: 'Default storage zone name.', hasValue: true },
        { name: 'storage-password', description: 'Storage zone password.', hasValue: true },
      ],
      examples: [
        { command: 'bunny configure', description: 'Interactive walkthrough.' },
        {
          command: 'bunny configure --non-interactive --account-key=$KEY --storage-zone=my-app --storage-password=$PW',
          description: 'CI-friendly form.',
        },
      ],
      status: 'active',
      phase: 2,
      load: () => import('../commands/configure.js'),
    },
    {
      name: 'auth:set',
      summary: 'Store an API key for a scope (account, storage:<zone>, stream:<lib>).',
      flags: [
        { name: 'scope', description: 'account | storage:<zone> | stream:<lib> | database:<name>.', hasValue: true },
        { name: 'value', description: 'Key value (else read from stdin if interactive).', hasValue: true },
      ],
      status: 'active',
      phase: 2,
      load: () => import('../commands/auth/set.js'),
    },
    {
      name: 'auth:list',
      summary: 'List stored credential scopes (masked).',
      flags: [{ name: 'json', description: 'Emit JSON instead of a table.', hasValue: false }],
      status: 'active',
      phase: 2,
      load: () => import('../commands/auth/list.js'),
    },
    {
      name: 'auth:clear',
      summary: 'Remove a stored credential.',
      flags: [
        { name: 'scope', description: 'account | storage:<zone> | stream:<lib> | database:<name>.', hasValue: true },
        { name: 'yes', description: 'Skip confirmation prompt.', hasValue: false },
      ],
      status: 'active',
      phase: 2,
      load: () => import('../commands/auth/clear.js'),
    },
    {
      name: 'use',
      summary: 'Switch active alias from .bunnyrc; with no arg, list aliases.',
      args: [{ name: 'alias', description: 'Alias name (omit to list).', required: false }],
      flags: [
        { name: 'list', description: 'List aliases (default when no arg given).', hasValue: false },
        { name: 'json', description: 'Emit JSON instead of a table.', hasValue: false },
      ],
      status: 'active',
      phase: 2,
      load: () => import('../commands/use.js'),
    },
    {
      name: 'deploy',
      summary: 'Sync public dir to storage zone and purge CDN cache.',
      flags: [
        { name: 'dry-run', description: 'Plan and report without mutating remote.', hasValue: false },
        { name: 'delete', description: 'Delete orphan files on the remote.', hasValue: false },
        { name: 'concurrency', description: 'Parallel upload pool size.', hasValue: true, defaultValue: '8' },
        { name: 'purge', description: 'Override per-pull-zone purge: all|none|tag:<name>|paths.', hasValue: true },
        { name: 'only', description: 'Limit to a target (alias-scoped).', hasValue: true },
        { name: 'json', description: 'Emit JSON summary instead of a table.', hasValue: false },
      ],
      examples: [
        { command: 'bunny deploy', description: 'Sync + purge per bunny.json.' },
        { command: 'bunny deploy --dry-run', description: 'Preview only.' },
        { command: 'bunny deploy --delete --concurrency=16', description: 'Aggressive sync.' },
      ],
      mcp: { tool: 'bunny.deploy' },
      status: 'active',
      phase: 2,
      load: () => import('../commands/deploy.js'),
    },
    {
      name: 'purge',
      summary: 'Purge CDN cache by URL or pull-zone:<id>.',
      args: [{ name: 'target', description: '<url> | pull-zone:<id>', required: true }],
      examples: [
        { command: 'bunny purge https://cdn.example.com/asset.js', description: 'Purge a specific URL.' },
        { command: 'bunny purge pull-zone:12345', description: 'Full pull-zone purge.' },
      ],
      mcp: { tool: 'bunny.purge' },
      status: 'active',
      phase: 2,
      load: () => import('../commands/purge.js'),
    },

    // Phase 3 — storage + zones
    {
      name: 'storage:upload',
      summary: 'Upload a file to a storage zone.',
      args: [
        { name: 'local', description: 'Local file path.', required: true },
        { name: 'remote', description: 'Remote path within the zone.', required: true },
      ],
      flags: [
        { name: 'zone', description: 'Storage zone name.', hasValue: true },
        { name: 'region', description: 'Override region (e.g. ny, la).', hasValue: true },
      ],
      status: 'active',
      phase: 3,
      load: () => import('../commands/storage/upload.js'),
    },
    {
      name: 'storage:download',
      summary: 'Download a file from a storage zone.',
      args: [
        { name: 'remote', description: 'Remote path within the zone.', required: true },
        { name: 'local', description: 'Local destination path.', required: true },
      ],
      flags: [
        { name: 'zone', description: 'Storage zone name.', hasValue: true },
        { name: 'region', description: 'Override region.', hasValue: true },
      ],
      status: 'active',
      phase: 3,
      load: () => import('../commands/storage/download.js'),
    },
    {
      name: 'storage:list',
      summary: 'List a storage-zone path.',
      args: [{ name: 'path', description: 'Path within the zone (default /).', required: false }],
      flags: [
        { name: 'zone', description: 'Storage zone name.', hasValue: true },
        { name: 'recursive', description: 'List recursively.', hasValue: false },
        { name: 'json', description: 'Emit JSON.', hasValue: false },
        { name: 'region', description: 'Override region.', hasValue: true },
      ],
      mcp: { tool: 'bunny.storage_list' },
      status: 'active',
      phase: 3,
      load: () => import('../commands/storage/list.js'),
    },
    {
      name: 'storage:delete',
      summary: 'Delete a file or path from a storage zone.',
      args: [{ name: 'path', description: 'Remote path.', required: true }],
      flags: [
        { name: 'zone', description: 'Storage zone name.', hasValue: true },
        { name: 'recursive', description: 'Delete recursively.', hasValue: false },
        { name: 'yes', description: 'Skip confirmation.', hasValue: false },
        { name: 'region', description: 'Override region.', hasValue: true },
      ],
      status: 'active',
      phase: 3,
      load: () => import('../commands/storage/delete.js'),
    },
    {
      name: 'storage:sync',
      summary: 'Sync a local directory to a storage zone (upload-only, no purge).',
      args: [
        { name: 'local', description: 'Local directory.', required: true },
        { name: 'remote', description: 'Remote root path (default /).', required: false },
      ],
      flags: [
        { name: 'zone', description: 'Storage zone name.', hasValue: true },
        { name: 'concurrency', description: 'Parallel pool size.', hasValue: true, defaultValue: '8' },
        { name: 'region', description: 'Override region.', hasValue: true },
      ],
      status: 'active',
      phase: 3,
      load: () => import('../commands/storage/sync.js'),
    },
    {
      name: 'storage-zone:list',
      summary: 'List storage zones.',
      flags: [{ name: 'json', description: 'Emit JSON.', hasValue: false }],
      mcp: { tool: 'bunny.zones_list' },
      status: 'active',
      phase: 3,
      load: () => import('../commands/storage-zone/list.js'),
    },
    {
      name: 'storage-zone:get',
      summary: 'Get a storage zone by id or name.',
      args: [{ name: 'idOrName', description: 'Numeric id or zone name.', required: true }],
      mcp: { tool: 'bunny.zone_get' },
      status: 'active',
      phase: 3,
      load: () => import('../commands/storage-zone/get.js'),
    },
    {
      name: 'storage-zone:create',
      summary: 'Create a storage zone.',
      args: [{ name: 'name', description: 'Zone name.', required: true }],
      flags: [
        { name: 'region', description: 'Primary region (e.g. ny, la, sg).', hasValue: true },
        { name: 'replicate', description: 'Comma-separated replication regions.', hasValue: true },
        { name: 'tier', description: 'Standard | Edge.', hasValue: true },
      ],
      mcp: { tool: 'bunny.zone_create' },
      status: 'active',
      phase: 3,
      load: () => import('../commands/storage-zone/create.js'),
    },
    {
      name: 'storage-zone:update',
      summary: 'Update a storage zone (raw JSON body).',
      args: [{ name: 'id', description: 'Storage zone id.', required: true }],
      flags: [{ name: 'body', description: 'JSON body to POST.', hasValue: true }],
      status: 'active',
      phase: 3,
      load: () => import('../commands/storage-zone/update.js'),
    },
    {
      name: 'storage-zone:delete',
      summary: 'Delete a storage zone.',
      args: [{ name: 'id', description: 'Storage zone id.', required: true }],
      flags: [{ name: 'yes', description: 'Skip confirmation.', hasValue: false }],
      mcp: { tool: 'bunny.zone_delete' },
      status: 'active',
      phase: 3,
      load: () => import('../commands/storage-zone/delete.js'),
    },
    {
      name: 'pull-zone:list',
      summary: 'List pull zones.',
      flags: [{ name: 'json', description: 'Emit JSON.', hasValue: false }],
      status: 'active',
      phase: 3,
      load: () => import('../commands/pull-zone/list.js'),
    },
    {
      name: 'pull-zone:get',
      summary: 'Get a pull zone.',
      args: [{ name: 'id', description: 'Pull zone id.', required: true }],
      status: 'active',
      phase: 3,
      load: () => import('../commands/pull-zone/get.js'),
    },
    {
      name: 'pull-zone:create',
      summary: 'Create a pull zone.',
      args: [{ name: 'name', description: 'Pull zone name.', required: true }],
      flags: [{ name: 'origin', description: 'Origin URL.', hasValue: true }],
      status: 'active',
      phase: 3,
      load: () => import('../commands/pull-zone/create.js'),
    },
    {
      name: 'pull-zone:update',
      summary: 'Update a pull zone (raw JSON body).',
      args: [{ name: 'id', description: 'Pull zone id.', required: true }],
      flags: [{ name: 'body', description: 'JSON body to POST.', hasValue: true }],
      status: 'active',
      phase: 3,
      load: () => import('../commands/pull-zone/update.js'),
    },
    {
      name: 'pull-zone:delete',
      summary: 'Delete a pull zone.',
      args: [{ name: 'id', description: 'Pull zone id.', required: true }],
      flags: [{ name: 'yes', description: 'Skip confirmation.', hasValue: false }],
      status: 'active',
      phase: 3,
      load: () => import('../commands/pull-zone/delete.js'),
    },
    {
      name: 'pull-zone:edge-rule:list',
      summary: 'List edge rules on a pull zone.',
      args: [{ name: 'pullZoneId', description: 'Pull zone id.', required: true }],
      flags: [{ name: 'json', description: 'Emit JSON.', hasValue: false }],
      status: 'active',
      phase: 3,
      load: () => import('../commands/pull-zone/edge-rule/list.js'),
    },
    {
      name: 'pull-zone:edge-rule:add',
      summary: 'Add an edge rule to a pull zone (raw JSON rule).',
      args: [{ name: 'pullZoneId', description: 'Pull zone id.', required: true }],
      flags: [{ name: 'rule', description: 'JSON rule body.', hasValue: true }],
      status: 'active',
      phase: 3,
      load: () => import('../commands/pull-zone/edge-rule/add.js'),
    },
    {
      name: 'pull-zone:edge-rule:delete',
      summary: 'Delete an edge rule by Guid.',
      args: [
        { name: 'pullZoneId', description: 'Pull zone id.', required: true },
        { name: 'ruleGuid', description: 'Edge rule Guid.', required: true },
      ],
      status: 'active',
      phase: 3,
      load: () => import('../commands/pull-zone/edge-rule/delete.js'),
    },

    // Phase 4 — DNS
    {
      name: 'dns:list',
      summary: 'List DNS zones.',
      flags: [{ name: 'json', description: 'Emit JSON.', hasValue: false }],
      status: 'active',
      phase: 4,
      load: () => import('../commands/dns/list.js'),
    },
    {
      name: 'dns:get',
      summary: 'Get a DNS zone (with records) by id.',
      args: [{ name: 'id', description: 'DNS zone id.', required: true }],
      status: 'active',
      phase: 4,
      load: () => import('../commands/dns/get.js'),
    },
    {
      name: 'dns:create',
      summary: 'Create a DNS zone for a domain.',
      args: [{ name: 'domain', description: 'Domain name.', required: true }],
      status: 'active',
      phase: 4,
      load: () => import('../commands/dns/create.js'),
    },
    {
      name: 'dns:delete',
      summary: 'Delete a DNS zone.',
      args: [{ name: 'id', description: 'DNS zone id.', required: true }],
      flags: [{ name: 'yes', description: 'Skip confirmation.', hasValue: false }],
      status: 'active',
      phase: 4,
      load: () => import('../commands/dns/delete.js'),
    },
    {
      name: 'dns:record:list',
      summary: 'List DNS records for a zone.',
      args: [{ name: 'zoneId', description: 'DNS zone id.', required: true }],
      flags: [
        { name: 'type', description: 'Filter by record type.', hasValue: true },
        { name: 'json', description: 'Emit JSON.', hasValue: false },
      ],
      mcp: { tool: 'bunny.dns_records' },
      status: 'active',
      phase: 4,
      load: () => import('../commands/dns/record/list.js'),
    },
    {
      name: 'dns:record:add',
      summary: 'Add a DNS record (A, AAAA, CNAME, TXT, MX, SRV, CAA, NS).',
      args: [
        { name: 'zoneId', description: 'DNS zone id.', required: true },
        { name: 'type', description: 'Record type.', required: true },
        { name: 'name', description: 'Record name.', required: true },
        { name: 'value', description: 'Record value.', required: true },
      ],
      flags: [
        { name: 'ttl', description: 'TTL in seconds.', hasValue: true },
        { name: 'priority', description: 'Priority (MX/SRV).', hasValue: true },
        { name: 'weight', description: 'Weight (SRV).', hasValue: true },
        { name: 'port', description: 'Port (SRV).', hasValue: true },
        { name: 'flags', description: 'Flags (CAA).', hasValue: true },
        { name: 'tag', description: 'Tag (CAA).', hasValue: true },
      ],
      mcp: { tool: 'bunny.dns_record_set' },
      status: 'active',
      phase: 4,
      load: () => import('../commands/dns/record/add.js'),
    },
    {
      name: 'dns:record:update',
      summary: 'Update a DNS record (raw JSON body).',
      args: [
        { name: 'zoneId', description: 'DNS zone id.', required: true },
        { name: 'recordId', description: 'Record id.', required: true },
      ],
      flags: [{ name: 'body', description: 'JSON body.', hasValue: true }],
      status: 'active',
      phase: 4,
      load: () => import('../commands/dns/record/update.js'),
    },
    {
      name: 'dns:record:delete',
      summary: 'Delete a DNS record.',
      args: [
        { name: 'zoneId', description: 'DNS zone id.', required: true },
        { name: 'recordId', description: 'Record id.', required: true },
      ],
      flags: [{ name: 'yes', description: 'Skip confirmation.', hasValue: false }],
      mcp: { tool: 'bunny.dns_record_delete' },
      status: 'active',
      phase: 4,
      load: () => import('../commands/dns/record/delete.js'),
    },

    // Phase 5 — Stream / Magic Containers / Edge Scripting
    { name: 'stream:library:list', summary: 'List Stream video libraries.', status: 'planned', phase: 5 },
    { name: 'stream:library:create', summary: 'Create a Stream video library.', status: 'planned', phase: 5 },
    { name: 'stream:video:list', summary: 'List videos in a library.', status: 'planned', phase: 5 },
    { name: 'stream:video:upload', summary: 'Upload a video to a library.', status: 'planned', phase: 5 },
    { name: 'stream:video:delete', summary: 'Delete a video.', status: 'planned', phase: 5 },
    { name: 'containers:app:list', summary: 'List Magic Containers apps.', status: 'planned', phase: 5 },
    { name: 'containers:app:create', summary: 'Create a Magic Containers app.', status: 'planned', phase: 5 },
    { name: 'containers:app:delete', summary: 'Delete a Magic Containers app.', status: 'planned', phase: 5 },
    { name: 'scripting:list', summary: 'List edge scripts.', status: 'planned', phase: 5 },
    { name: 'scripting:deploy', summary: 'Deploy an edge script from a source file.', status: 'planned', phase: 5 },
    { name: 'scripting:delete', summary: 'Delete an edge script.', status: 'planned', phase: 5 },

    // Phase 6 — MCP server
    {
      name: 'mcp',
      summary: 'Boot the bunny-tools MCP stdio server (for AI agents).',
      flags: [
        { name: 'http', description: 'Enable HTTP/SSE transport (deferred to v0.2).', hasValue: false },
      ],
      examples: [
        {
          command: 'claude mcp add bunny-tools npx -y bunny-tools mcp',
          description: 'Install for Claude Code.',
        },
      ],
      status: 'active',
      phase: 6,
      load: () => import('../commands/mcp.js'),
    },
  ],
};

export function listMcpTools(): { name: string; tool: string; description?: string }[] {
  return registry.commands
    .filter((c) => c.mcp !== undefined)
    .map((c) => ({ name: c.name, tool: c.mcp!.tool, description: c.mcp!.description ?? c.summary }));
}

export function findCommand(name: string): CommandSpec | undefined {
  return registry.commands.find((c) => c.name === name);
}
