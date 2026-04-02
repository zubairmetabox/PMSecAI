#!/usr/bin/env node
/**
 * PMSecAI MCP Server
 *
 * Runs as a local process on each developer's machine.
 * Claude Code communicates via stdin/stdout (StdioServerTransport).
 *
 * ⚠️  NEVER write to process.stdout directly — it will corrupt the MCP JSON-RPC stream.
 *     All logging goes to process.stderr or the log file.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as dotenv from "dotenv";
import { runAuthFlow } from "./zoho/auth.js";
import { registerTools } from "./tools/index.js";
import { startTokenReceiver } from "./hooks/token-receiver.js";
import { log } from "./logger.js";

dotenv.config();

const isAuthMode = process.argv.includes("--auth");

async function main() {
  if (isAuthMode) {
    log("Starting Zoho OAuth flow...");
    await runAuthFlow();
    log("Authentication complete. You can now start the MCP server normally.");
    process.exit(0);
  }

  log("PMSecAI MCP Server starting...");

  // Start the Express token receiver on port 37849 (for Claude Code Stop hooks)
  startTokenReceiver();

  const server = new Server(
    { name: "pmsecai", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  log("PMSecAI MCP Server connected and ready.");
}

main().catch((err) => {
  log(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
