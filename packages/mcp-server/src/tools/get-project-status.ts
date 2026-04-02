import { readRepoConfig } from "../config.js";
import { getTasklists, getTasksInTasklist } from "../zoho/tasks.js";
import { log } from "../logger.js";

export async function getProjectStatus(): Promise<string> {
  const config = readRepoConfig();
  if (!config) {
    return "No project linked. Use `link_project` to associate this repo with a Zoho project.";
  }

  log(`Fetching project status for: ${config.zohoProjectName}`);
  const tasklists = await getTasklists(config.zohoProjectId);

  if (tasklists.length === 0) {
    return `Project **${config.zohoProjectName}** has no phases/tasks yet.`;
  }

  const lines: string[] = [`# ${config.zohoProjectName}\n`];

  for (const tl of tasklists) {
    lines.push(`## Phase: ${tl.name}`);
    const tasks = await getTasksInTasklist(config.zohoProjectId, tl.id);

    if (tasks.length === 0) {
      lines.push("  _(no tasks)_");
    } else {
      for (const task of tasks) {
        const done = task.status.name.toLowerCase() === "closed";
        const checkbox = done ? "[x]" : "[ ]";
        lines.push(`  ${checkbox} ${task.name} _(${task.status.name})_`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
