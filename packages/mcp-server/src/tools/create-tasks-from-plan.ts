import { z } from "zod";
import { readRepoConfig } from "../config.js";
import { createTasklist, createTask, createSubtask } from "../zoho/tasks.js";
import { trackedMessage } from "../claude/tracked-client.js";
import { syncToCloud } from "../sync/cloud-sync.js";
import { log } from "../logger.js";

export const createTasksSchema = z.object({
  plan_text: z
    .string()
    .min(10)
    .describe("The project plan text to parse and create as Zoho tasks"),
});

interface ParsedPlan {
  phases: Array<{
    name: string;
    tasks: Array<{
      name: string;
      subtasks: string[];
    }>;
  }>;
}

const PARSE_SYSTEM = `You are a project management assistant. Parse the given project plan into a structured JSON format.

Return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
  "phases": [
    {
      "name": "Phase name",
      "tasks": [
        {
          "name": "Task name",
          "subtasks": ["Subtask 1", "Subtask 2"]
        }
      ]
    }
  ]
}

Rules:
- Create 2-6 phases based on logical groupings (e.g. Setup, Backend, Frontend, Testing, Deployment)
- Each phase should have 2-8 tasks
- Subtasks are optional — only add them if the plan mentions specific sub-steps
- Keep names concise (under 80 characters)
- If the plan is simple, fewer phases is better`;

export async function createTasksFromPlan(
  input: z.infer<typeof createTasksSchema>
): Promise<string> {
  const config = readRepoConfig();
  if (!config) {
    return "No project linked. Use `link_project` first.";
  }

  log("Parsing plan with Claude...");
  const { content } = await trackedMessage({
    operation: "parse_plan",
    messages: [{ role: "user", content: input.plan_text }],
    system: PARSE_SYSTEM,
    maxTokens: 2048,
  });

  let parsed: ParsedPlan;
  try {
    parsed = JSON.parse(content) as ParsedPlan;
  } catch {
    log(`Failed to parse Claude response as JSON: ${content}`, "error");
    return `Failed to parse the plan into structured tasks. Please ensure the plan has clear phases and tasks, then try again.`;
  }

  if (!parsed.phases?.length) {
    return "No phases could be extracted from the plan. Please provide a more detailed plan.";
  }

  const results: string[] = [`Creating tasks for **${config.zohoProjectName}**...\n`];
  let totalTasks = 0;
  let totalSubtasks = 0;

  for (const phase of parsed.phases) {
    log(`Creating tasklist: ${phase.name}`);
    const tasklist = await createTasklist(config.zohoProjectId, phase.name);
    results.push(`📁 **${phase.name}**`);

    // Sync phase to cloud
    await syncToCloud("phase", {
      zohoProjectId: config.zohoProjectId,
      zohoTasklistId: tasklist.id,
      name: phase.name,
    }).catch((err) => log(`Phase sync failed: ${err}`, "warn"));

    for (const taskDef of phase.tasks) {
      log(`  Creating task: ${taskDef.name}`);
      const task = await createTask(config.zohoProjectId, tasklist.id, taskDef.name);
      results.push(`  ☐ ${taskDef.name}`);
      totalTasks++;

      // Sync task to cloud
      await syncToCloud("task", {
        zohoProjectId: config.zohoProjectId,
        zohoTasklistId: tasklist.id,
        zohoTaskId: task.id,
        name: taskDef.name,
        status: "open",
      }).catch((err) => log(`Task sync failed: ${err}`, "warn"));

      for (const subtaskName of taskDef.subtasks ?? []) {
        log(`    Creating subtask: ${subtaskName}`);
        const subtask = await createSubtask(config.zohoProjectId, task.id, subtaskName);
        results.push(`    · ${subtaskName}`);
        totalSubtasks++;

        await syncToCloud("subtask", {
          zohoTaskId: task.id,
          zohoSubtaskId: subtask.id,
          name: subtaskName,
        }).catch((err) => log(`Subtask sync failed: ${err}`, "warn"));
      }
    }
    results.push("");
  }

  results.push(
    `\n✓ Created ${parsed.phases.length} phases, ${totalTasks} tasks, ${totalSubtasks} subtasks on Zoho.`
  );
  return results.join("\n");
}
