import { z } from "zod";
import { getDeveloperIdentity } from "../config.js";
import { calculateCost } from "../claude/pricing.js";
import { state, resetTask, getElapsedSeconds } from "../state.js";
import { syncToCloud } from "../sync/cloud-sync.js";
import { log } from "../logger.js";

export const logNonZohoWorkSchema = z.object({
  description: z
    .string()
    .min(1)
    .describe("Description of the work done (not tied to any Zoho project)"),
});

export async function logNonZohoWork(
  input: z.infer<typeof logNonZohoWorkSchema>
): Promise<string> {
  const dev = getDeveloperIdentity();
  const durationSeconds = getElapsedSeconds() ?? 0;
  const tokensIn = state.accumulatedTokensIn;
  const tokensOut = state.accumulatedTokensOut;
  const model = state.lastModel ?? dev.model;
  const totalTokens = tokensIn + tokensOut;
  const costUsd = calculateCost(model, tokensIn, tokensOut);

  log(`Logging non-Zoho work: "${input.description}" | ${totalTokens} tokens | $${costUsd.toFixed(6)}`);

  const startedAt = state.taskStartedAt ?? new Date().toISOString();

  await syncToCloud("non_zoho_work", {
    vsCodeIdentity: dev.vsCodeIdentity,
    description: input.description,
    startedAt,
    endedAt: new Date().toISOString(),
    totalTokens,
    costUsd: costUsd.toFixed(8),
    model,
    durationSeconds,
  }).catch((err) => log(`Non-Zoho work sync failed: ${err}`, "warn"));

  resetTask();

  const totalMinutes = Math.floor(durationSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const durationStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  return (
    `✓ Work logged: **${input.description}**\n\n` +
    `⏱  Duration: ${durationStr}\n` +
    `🤖 Tokens used: ${totalTokens.toLocaleString()}\n` +
    `💰 AI Cost: $${costUsd.toFixed(6)}\n\n` +
    `Saved to PMSecAI dashboard under Work Log.`
  );
}
