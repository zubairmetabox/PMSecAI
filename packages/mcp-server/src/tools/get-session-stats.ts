import { getDeveloperIdentity } from "../config.js";
import { calculateCost } from "../claude/pricing.js";
import { state, getElapsedSeconds } from "../state.js";

export async function getSessionStats(): Promise<string> {
  const dev = getDeveloperIdentity();
  const model = state.lastModel ?? dev.model;
  const costUsd = calculateCost(model, state.accumulatedTokensIn, state.accumulatedTokensOut);
  const elapsed = getElapsedSeconds();

  const lines: string[] = ["## Current Session Stats\n"];

  if (state.activeTaskName) {
    lines.push(`**Active task:** ${state.activeTaskName}`);
    if (elapsed !== null) {
      const hours = Math.floor(elapsed / 3600);
      const minutes = Math.floor((elapsed % 3600) / 60);
      const seconds = elapsed % 60;
      lines.push(
        `**Elapsed:** ${hours > 0 ? `${hours}h ` : ""}${minutes}m ${seconds}s`
      );
    }
  } else {
    lines.push("**Active task:** _(none — use `start_task` to begin tracking)_");
  }

  lines.push(`\n**Developer tokens:**`);
  lines.push(`  In:  ${state.accumulatedTokensIn.toLocaleString()}`);
  lines.push(`  Out: ${state.accumulatedTokensOut.toLocaleString()}`);
  lines.push(`  Estimated cost: $${costUsd.toFixed(6)}`);
  lines.push(`  Model: ${model}`);

  if (state.systemTokensIn > 0 || state.systemTokensOut > 0) {
    const systemCost = calculateCost(model, state.systemTokensIn, state.systemTokensOut);
    lines.push(`\n**PMSecAI system tokens (this session):**`);
    lines.push(`  In:  ${state.systemTokensIn.toLocaleString()}`);
    lines.push(`  Out: ${state.systemTokensOut.toLocaleString()}`);
    lines.push(`  Cost: $${systemCost.toFixed(6)}`);
  }

  return lines.join("\n");
}
