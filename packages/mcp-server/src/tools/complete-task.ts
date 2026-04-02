import { z } from "zod";
import { readRepoConfig, getDeveloperIdentity } from "../config.js";
import { findTaskByName, completeTask, logTime } from "../zoho/tasks.js";
import { writeTokenDataToZoho } from "../zoho/token-data.js";
import { calculateCost } from "../claude/pricing.js";
import { state, resetTask, getElapsedSeconds } from "../state.js";
import { syncToCloud } from "../sync/cloud-sync.js";
import { log } from "../logger.js";

export const completeTaskSchema = z.object({
  task_name: z
    .string()
    .optional()
    .describe("Name of the task to complete. If omitted, completes the currently active task."),
});

export async function completeTaskTool(
  input: z.infer<typeof completeTaskSchema>
): Promise<string> {
  const config = readRepoConfig();
  if (!config) return "No project linked. Use `link_project` first.";

  const dev = getDeveloperIdentity();

  // Resolve the task to complete
  let zohoTaskId: string;
  let taskName: string;

  if (input.task_name) {
    const result = await findTaskByName(config.zohoProjectId, input.task_name);
    if (!result) {
      return `No task found matching "${input.task_name}".`;
    }
    zohoTaskId = result.task.id;
    taskName = result.task.name;
  } else if (state.activeZohoTaskId && state.activeTaskName) {
    zohoTaskId = state.activeZohoTaskId;
    taskName = state.activeTaskName;
  } else {
    return "No active task and no task name provided. Use `start_task` first or provide a task name.";
  }

  const durationSeconds = getElapsedSeconds() ?? 0;
  const tokensIn = state.accumulatedTokensIn;
  const tokensOut = state.accumulatedTokensOut;
  const model = state.lastModel ?? dev.model;
  const costUsd = calculateCost(model, tokensIn, tokensOut);

  log(`Completing task: ${taskName} | ${durationSeconds}s | ${tokensIn}in / ${tokensOut}out | $${costUsd.toFixed(6)}`);

  // 1. Mark complete on Zoho
  await completeTask(config.zohoProjectId, zohoTaskId);

  // 2. Log time to Zoho
  const totalMinutes = Math.floor(durationSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const logDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  await logTime(config.zohoProjectId, zohoTaskId, hours, minutes, logDate);

  // 3. Post token data as comment on Zoho task
  await writeTokenDataToZoho(config.zohoProjectId, zohoTaskId, {
    tokensIn,
    tokensOut,
    costUsd,
    model,
    durationSeconds,
  });

  // 4. Sync work session to cloud DB
  const startedAt = state.taskStartedAt ?? new Date().toISOString();
  await syncToCloud("session", {
    vsCodeIdentity: dev.vsCodeIdentity,
    zohoTaskId,
    source: "developer",
    startedAt,
    endedAt: new Date().toISOString(),
    totalTokensIn: tokensIn,
    totalTokensOut: tokensOut,
    costUsd: costUsd.toFixed(8),
    model,
    durationSeconds,
  }).catch((err) => log(`Session sync failed: ${err}`, "warn"));

  // 5. Update task status in cloud DB
  await syncToCloud("task_status", {
    zohoTaskId,
    status: "completed",
    completedAt: new Date().toISOString(),
  }).catch((err) => log(`Task status sync failed: ${err}`, "warn"));

  // 6. Reset state
  resetTask();

  const durationStr =
    hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  return (
    `✓ Task completed: **${taskName}**\n\n` +
    `⏱  Time logged: ${durationStr}\n` +
    `🤖 Tokens: ${tokensIn.toLocaleString()} in / ${tokensOut.toLocaleString()} out\n` +
    `💰 AI Cost: $${costUsd.toFixed(6)}\n` +
    `🔧 Model: ${model}\n\n` +
    `Data logged to Zoho (comment) and synced to PMSecAI dashboard.`
  );
}
