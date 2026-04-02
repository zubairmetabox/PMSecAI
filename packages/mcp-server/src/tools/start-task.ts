import { z } from "zod";
import { readRepoConfig } from "../config.js";
import { findTaskByName } from "../zoho/tasks.js";
import { startTask, state } from "../state.js";

export const startTaskSchema = z.object({
  task_name: z.string().min(1).describe("Name (or part of the name) of the task to start"),
});

export async function startTaskTool(
  input: z.infer<typeof startTaskSchema>
): Promise<string> {
  const config = readRepoConfig();
  if (!config) return "No project linked. Use `link_project` first.";

  if (state.activeTaskId) {
    return (
      `A task is already active: **${state.activeTaskName}**.\n` +
      `Complete it with \`complete_task\` before starting a new one, or it will be discarded.`
    );
  }

  const result = await findTaskByName(config.zohoProjectId, input.task_name);
  if (!result) {
    return `No task found matching "${input.task_name}". Use \`get_project_status\` to see available tasks.`;
  }

  startTask(result.task.id, result.task.name, result.task.id);

  return (
    `▶ Started task: **${result.task.name}**\n` +
    `Timer is running. Token tracking is active.\n` +
    `When done, say "complete task" or call \`complete_task\`.`
  );
}
