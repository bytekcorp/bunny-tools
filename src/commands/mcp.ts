// `bunny mcp` - boots the stdio MCP server. Stays alive until stdin closes.

import type { ParsedInvocation } from '../manifest/types.js';
import { startMcpServer } from '../mcp/server.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const flags = inv.flags as { http?: boolean };
  if (flags.http) {
    process.stderr.write('HTTP/SSE transport is deferred to v0.2. Use stdio.\n');
    return 1;
  }
  // Important: never log to stdout. Stdout is the JSON-RPC transport.
  process.stderr.write('bunny mcp: stdio server up\n');
  await startMcpServer();
  return 0;
}
