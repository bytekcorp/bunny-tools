// `bunny mcp` — stdio MCP server. Tools call into src/core/*; resources expose
// canonical manifest, AGENTS.md, and a masked view of current credentials.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { TOOLS, readConfigResource } from './tools.js';
import { renderRegistryHelpJson } from '../manifest/render-help.js';
import { registry } from '../manifest/registry.js';

const RESOURCES = [
  {
    uri: 'bunny://manifest',
    name: 'bunny-tools manifest',
    description: 'Canonical command registry as JSON. Use this to discover commands.',
    mimeType: 'application/json',
  },
  {
    uri: 'bunny://agents',
    name: 'AGENTS.md',
    description: 'Hand-curated + auto-generated guidance for AI agents using bunny-tools.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'bunny://config/current',
    name: 'Current credential scopes (masked)',
    description: 'Lists currently-stored credential scopes. Values are masked.',
    mimeType: 'application/json',
  },
];

export async function startMcpServer(): Promise<void> {
  const server = new Server(
    { name: 'bunny-tools', version: registry.version },
    { capabilities: { tools: {}, resources: {} } },
  );

  // Tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema, { target: 'jsonSchema7' }) as Record<string, unknown>,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = TOOLS.find((t) => t.name === req.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
      };
    }
    try {
      const result = await tool.run(req.params.arguments ?? {});
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: (err as Error).message }],
      };
    }
  });

  // Resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const uri = req.params.uri;
    if (uri === 'bunny://manifest') {
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(renderRegistryHelpJson(registry), null, 2),
          },
        ],
      };
    }
    if (uri === 'bunny://agents') {
      const path = await locateAgentsMd();
      const text = path ? await readFile(path, 'utf8') : '(AGENTS.md not found)';
      return { contents: [{ uri, mimeType: 'text/markdown', text }] };
    }
    if (uri === 'bunny://config/current') {
      const data = await readConfigResource();
      return {
        contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }],
      };
    }
    throw new Error(`Unknown resource: ${uri}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// AGENTS.md ships with the npm package at the project root. Locate it via the
// current source URL so `bunny mcp` works whether installed globally or run
// via tsx in dev.
async function locateAgentsMd(): Promise<string | null> {
  // Try CWD first (running in a checkout / dev), then package root (post-install).
  const candidates = [
    resolve(process.cwd(), 'AGENTS.md'),
    resolve(fileURLToPath(import.meta.url), '..', '..', '..', 'AGENTS.md'),
  ];
  for (const c of candidates) {
    try {
      await readFile(c);
      return c;
    } catch {
      // try next
    }
  }
  return null;
}
