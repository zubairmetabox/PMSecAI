/**
 * Express server on port 37849 (localhost only).
 * Receives Claude Code Stop hook POST with token usage data.
 *
 * Configure in ~/.claude/settings.json:
 *   "hooks": {
 *     "Stop": [{ "matcher": "", "hooks": [{ "type": "command", "command": "bash ~/.claude/pmsecai-hook.sh" }] }]
 *   }
 *
 * And create ~/.claude/pmsecai-hook.sh:
 *   #!/bin/bash
 *   PAYLOAD=$(cat)
 *   INPUT=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('usage',{}).get('input_tokens',0))" 2>/dev/null || echo "0")
 *   OUTPUT=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('usage',{}).get('output_tokens',0))" 2>/dev/null || echo "0")
 *   MODEL=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('model',''))" 2>/dev/null || echo "")
 *   curl -s -X POST http://127.0.0.1:37849/hook/token-usage \
 *     -H "Content-Type: application/json" \
 *     -d "{\"input_tokens\":$INPUT,\"output_tokens\":$OUTPUT,\"model\":\"$MODEL\"}" >/dev/null 2>&1
 *   # Also dump raw payload for debugging (first 5 runs)
 *   echo "$PAYLOAD" >> ~/.pmsecai/hook-debug.log
 */

import express from "express";
import { addDeveloperTokens } from "../state.js";
import { log, logDebug } from "../logger.js";

const TOKEN_RECEIVER_PORT = 37849;

export function startTokenReceiver(): void {
  const app = express();
  app.use(express.json());

  app.post("/hook/token-usage", (req, res) => {
    const { input_tokens, output_tokens, model } = req.body as {
      input_tokens?: number;
      output_tokens?: number;
      model?: string;
    };

    // Log raw payload for debugging during initial setup
    logDebug({ event: "stop-hook", body: req.body });

    const tokensIn = Number(input_tokens ?? 0);
    const tokensOut = Number(output_tokens ?? 0);
    addDeveloperTokens(tokensIn, tokensOut, model);

    res.json({ ok: true, tokensIn, tokensOut });
  });

  // Health check
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.listen(TOKEN_RECEIVER_PORT, "127.0.0.1", () => {
    log(`Token receiver listening on http://127.0.0.1:${TOKEN_RECEIVER_PORT}`);
  });
}
