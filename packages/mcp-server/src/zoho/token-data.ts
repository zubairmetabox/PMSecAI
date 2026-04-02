/**
 * Logs token/cost/model data to a Zoho task.
 *
 * Zoho Premium plan does not support custom fields on tasks,
 * so we post a structured comment instead.
 * Neon DB remains the authoritative store regardless.
 */

import { addComment } from "./tasks.js";
import { log } from "../logger.js";

export interface TokenData {
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  model: string;
  durationSeconds?: number;
}

export async function writeTokenDataToZoho(
  projectId: string,
  taskId: string,
  data: TokenData
): Promise<void> {
  const hours = data.durationSeconds ? Math.floor(data.durationSeconds / 3600) : 0;
  const minutes = data.durationSeconds ? Math.floor((data.durationSeconds % 3600) / 60) : 0;

  const comment = [
    `[PMSecAI] AI Usage Summary`,
    `Tokens In: ${data.tokensIn.toLocaleString()}`,
    `Tokens Out: ${data.tokensOut.toLocaleString()}`,
    `Total Cost: $${data.costUsd.toFixed(6)}`,
    `Model: ${data.model}`,
    data.durationSeconds !== undefined
      ? `Duration: ${hours}h ${minutes}m`
      : null,
  ]
    .filter(Boolean)
    .join(" | ");

  try {
    await addComment(projectId, taskId, comment);
    log(`Token data comment posted to Zoho task ${taskId}`);
  } catch (err) {
    log(`Failed to post token comment to Zoho: ${err}`, "warn");
    // Non-fatal — Neon DB has the authoritative record
  }
}
