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
    { name: 'init', summary: 'Initialize a bunny.json in the current project.', status: 'planned', phase: 2 },
    {
      name: 'configure',
      summary: 'Interactive global setup of credentials (like aws configure).',
      flags: [
        { name: 'non-interactive', description: 'Skip prompts and accept all values via flags.', hasValue: false },
        { name: 'account-key', description: 'Account API key.', hasValue: true },
        { name: 'storage-zone', description: 'Default storage zone name.', hasValue: true },
        { name: 'storage-password', description: 'Storage zone password.', hasValue: true },
      ],
      status: 'planned',
      phase: 2,
    },
    { name: 'auth:set', summary: 'Store an API key for a scope (account, storage:<zone>, stream:<lib>).', status: 'planned', phase: 2 },
    { name: 'auth:list', summary: 'List stored credential scopes (masked).', status: 'planned', phase: 2 },
    { name: 'auth:clear', summary: 'Remove a stored credential.', status: 'planned', phase: 2 },
    { name: 'use', summary: 'Switch active alias from .bunnyrc.', status: 'planned', phase: 2 },
    {
      name: 'deploy',
      summary: 'Sync public dir to storage zone and purge CDN cache.',
      mcp: { tool: 'bunny.deploy' },
      status: 'planned',
      phase: 2,
    },
    {
      name: 'purge',
      summary: 'Purge CDN cache by URL, tag:<name>, pull-zone:<id>, or all.',
      mcp: { tool: 'bunny.purge' },
      status: 'planned',
      phase: 2,
    },

    // Phase 3 — storage + zones
    { name: 'storage:upload', summary: 'Upload a file to a storage zone.', status: 'planned', phase: 3 },
    { name: 'storage:download', summary: 'Download a file from a storage zone.', status: 'planned', phase: 3 },
    {
      name: 'storage:list',
      summary: 'List a storage-zone path.',
      mcp: { tool: 'bunny.storage_list' },
      status: 'planned',
      phase: 3,
    },
    { name: 'storage:delete', summary: 'Delete a file or path from a storage zone.', status: 'planned', phase: 3 },
    { name: 'storage:sync', summary: 'Sync a local directory to a storage zone.', status: 'planned', phase: 3 },
    {
      name: 'storage-zone:list',
      summary: 'List storage zones.',
      mcp: { tool: 'bunny.zones_list' },
      status: 'planned',
      phase: 3,
    },
    {
      name: 'storage-zone:get',
      summary: 'Get a storage zone by id or name.',
      mcp: { tool: 'bunny.zone_get' },
      status: 'planned',
      phase: 3,
    },
    {
      name: 'storage-zone:create',
      summary: 'Create a storage zone.',
      mcp: { tool: 'bunny.zone_create' },
      status: 'planned',
      phase: 3,
    },
    { name: 'storage-zone:update', summary: 'Update a storage zone.', status: 'planned', phase: 3 },
    {
      name: 'storage-zone:delete',
      summary: 'Delete a storage zone.',
      mcp: { tool: 'bunny.zone_delete' },
      status: 'planned',
      phase: 3,
    },
    { name: 'pull-zone:list', summary: 'List pull zones.', status: 'planned', phase: 3 },
    { name: 'pull-zone:get', summary: 'Get a pull zone.', status: 'planned', phase: 3 },
    { name: 'pull-zone:create', summary: 'Create a pull zone.', status: 'planned', phase: 3 },
    { name: 'pull-zone:update', summary: 'Update a pull zone.', status: 'planned', phase: 3 },
    { name: 'pull-zone:delete', summary: 'Delete a pull zone.', status: 'planned', phase: 3 },
    { name: 'pull-zone:edge-rule:list', summary: 'List edge rules on a pull zone.', status: 'planned', phase: 3 },
    { name: 'pull-zone:edge-rule:add', summary: 'Add an edge rule to a pull zone.', status: 'planned', phase: 3 },
    { name: 'pull-zone:edge-rule:delete', summary: 'Delete an edge rule.', status: 'planned', phase: 3 },

    // Phase 4 — DNS
    { name: 'dns:list', summary: 'List DNS zones.', status: 'planned', phase: 4 },
    { name: 'dns:get', summary: 'Get a DNS zone by id or domain.', status: 'planned', phase: 4 },
    { name: 'dns:create', summary: 'Create a DNS zone for a domain.', status: 'planned', phase: 4 },
    { name: 'dns:delete', summary: 'Delete a DNS zone.', status: 'planned', phase: 4 },
    {
      name: 'dns:record:list',
      summary: 'List DNS records for a zone.',
      mcp: { tool: 'bunny.dns_records' },
      status: 'planned',
      phase: 4,
    },
    {
      name: 'dns:record:add',
      summary: 'Add a DNS record (A, AAAA, CNAME, TXT, MX, SRV, CAA, NS).',
      mcp: { tool: 'bunny.dns_record_set' },
      status: 'planned',
      phase: 4,
    },
    { name: 'dns:record:update', summary: 'Update a DNS record.', status: 'planned', phase: 4 },
    {
      name: 'dns:record:delete',
      summary: 'Delete a DNS record.',
      mcp: { tool: 'bunny.dns_record_delete' },
      status: 'planned',
      phase: 4,
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
      status: 'planned',
      phase: 6,
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
