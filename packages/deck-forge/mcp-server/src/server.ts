import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { type ToolRuntimePolicy, registerTools } from "#src/register-tools.js";

export type McpServerOptions = {
  policy?: ToolRuntimePolicy;
};

export function createMcpServer(options?: McpServerOptions): McpServer {
  const server = new McpServer({
    name: "deck-forge-mcp-server",
    version: "0.1.0",
  });

  registerTools(server, options?.policy);
  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createMcpServer({
    policy: {
      workspaceRoot: process.env.DECK_FORGE_WORKSPACE_ROOT,
      allowOutsideWorkspace: toBoolean(process.env.DECK_FORGE_ALLOW_OUTSIDE_WORKSPACE),
    },
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function toBoolean(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }
  return value === "1" || value.toLowerCase() === "true";
}
