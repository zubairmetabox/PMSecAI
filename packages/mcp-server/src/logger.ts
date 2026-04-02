/**
 * All logging goes to stderr — stdout is reserved for the MCP JSON-RPC stream.
 * Also appends to ~/.pmsecai/server.log for debugging.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const logDir = path.join(os.homedir(), ".pmsecai");
const logFile = path.join(logDir, "server.log");

// Ensure the log directory exists
try {
  fs.mkdirSync(logDir, { recursive: true });
} catch {
  // ignore
}

export function log(message: string, level: "info" | "warn" | "error" = "info"): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  process.stderr.write(line + "\n");
  try {
    fs.appendFileSync(logFile, line + "\n");
  } catch {
    // ignore file write failures
  }
}

export function logDebug(payload: unknown): void {
  const debugFile = path.join(logDir, "hook-debug.log");
  try {
    fs.appendFileSync(
      debugFile,
      `[${new Date().toISOString()}] ${JSON.stringify(payload, null, 2)}\n\n`
    );
  } catch {
    // ignore
  }
}
