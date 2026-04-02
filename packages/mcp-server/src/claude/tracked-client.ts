/**
 * Wraps @anthropic-ai/sdk for internal PMSecAI operations.
 *
 * Every call made by the MCP server itself (e.g. plan parsing, fuzzy matching)
 * is logged as `source: pmsecai_system` — visible in the /pmsecai-usage dashboard.
 * These are separate from developer coding sessions.
 */

import Anthropic from "@anthropic-ai/sdk";
import { calculateCost } from "./pricing.js";
import { addSystemTokens } from "../state.js";
import { syncToCloud } from "../sync/cloud-sync.js";
import { getDeveloperIdentity } from "../config.js";
import { log } from "../logger.js";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface TrackedMessageParams {
  operation: string; // e.g. "parse_plan", "fuzzy_match"
  model?: string;
  system?: string;
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
}

export interface TrackedResponse {
  content: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  model: string;
}

export async function trackedMessage(params: TrackedMessageParams): Promise<TrackedResponse> {
  const dev = getDeveloperIdentity();
  const model = params.model ?? dev.model;

  const response = await client.messages.create({
    model,
    max_tokens: params.maxTokens ?? 4096,
    system: params.system,
    messages: params.messages,
  });

  const content = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  const tokensIn = response.usage.input_tokens;
  const tokensOut = response.usage.output_tokens;
  const costUsd = calculateCost(model, tokensIn, tokensOut);

  // Update in-memory system token accumulator
  addSystemTokens(tokensIn, tokensOut);

  // Fire-and-forget sync to cloud
  syncToCloud("system_usage", {
    clerkUserId: dev.email, // resolved to clerk_user_id on the server by vs_code_identity lookup
    vsCodeIdentity: dev.vsCodeIdentity,
    operation: params.operation,
    tokensIn,
    tokensOut,
    costUsd: costUsd.toFixed(8),
    model,
  }).catch((err) => log(`system_usage sync failed: ${err}`, "warn"));

  log(`[${params.operation}] ${tokensIn}in / ${tokensOut}out — $${costUsd.toFixed(6)}`);

  return { content, tokensIn, tokensOut, costUsd, model };
}
