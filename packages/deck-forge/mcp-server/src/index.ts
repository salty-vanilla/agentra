import { fileURLToPath } from "node:url";

import { createMcpServer, startMcpServer } from "#src/server.js";
export type { McpServerOptions } from "#src/server.js";

export { createMcpServer, startMcpServer };

if (isMainModule()) {
  startMcpServer().catch((error) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  return fileURLToPath(import.meta.url) === entry;
}
