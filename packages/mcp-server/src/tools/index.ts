import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";

import { linkProject, linkProjectSchema } from "./link-project.js";
import { getProjectStatus } from "./get-project-status.js";
import { createTasksFromPlan, createTasksSchema } from "./create-tasks-from-plan.js";
import { startTaskTool, startTaskSchema } from "./start-task.js";
import { completeTaskTool, completeTaskSchema } from "./complete-task.js";
import { logNonZohoWork, logNonZohoWorkSchema } from "./log-non-zoho-work.js";
import { getSessionStats } from "./get-session-stats.js";
import { log } from "../logger.js";

const TOOLS = [
  {
    name: "link_project",
    description:
      "Link the current repo to a Zoho project. Call this when the developer mentions which client project they're working on. Creates a .pmSecAI.json file in the repo root.",
    inputSchema: zodToJsonSchema(linkProjectSchema),
    handler: async (args: unknown) => linkProject(linkProjectSchema.parse(args)),
  },
  {
    name: "get_project_status",
    description:
      "Fetch the current project's phases, tasks, and their completion status from Zoho. Call this at the start of a session to understand what's already been done.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: async () => getProjectStatus(),
  },
  {
    name: "create_tasks_from_plan",
    description:
      "Parse a free-form project plan and create Phases > Tasks > Subtasks on Zoho Projects. Call this when the developer says 'create tasks' or 'create the tasks on Zoho'.",
    inputSchema: zodToJsonSchema(createTasksSchema),
    handler: async (args: unknown) => createTasksFromPlan(createTasksSchema.parse(args)),
  },
  {
    name: "start_task",
    description:
      "Mark a task as started and begin tracking wall-clock time and token usage. Call this when the developer says they're starting work on a specific task.",
    inputSchema: zodToJsonSchema(startTaskSchema),
    handler: async (args: unknown) => startTaskTool(startTaskSchema.parse(args)),
  },
  {
    name: "complete_task",
    description:
      "Mark the active (or named) task as complete. Logs wall-clock time to Zoho, posts a token/cost summary as a Zoho comment, and syncs the session to the PMSecAI dashboard. Call this when the developer says a task is done.",
    inputSchema: zodToJsonSchema(completeTaskSchema),
    handler: async (args: unknown) => completeTaskTool(completeTaskSchema.parse(args)),
  },
  {
    name: "log_non_zoho_work",
    description:
      "Log work that is not tied to any Zoho project (R&D, exploration, internal tooling). Saves to the PMSecAI dashboard work log only.",
    inputSchema: zodToJsonSchema(logNonZohoWorkSchema),
    handler: async (args: unknown) => logNonZohoWork(logNonZohoWorkSchema.parse(args)),
  },
  {
    name: "get_session_stats",
    description:
      "Show current session stats: active task, elapsed time, accumulated tokens, and estimated AI cost so far.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: async () => getSessionStats(),
  },
];

export function registerTools(server: Server): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = TOOLS.find((t) => t.name === name);

    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      log(`Tool called: ${name}`);
      const result = await tool.handler(args ?? {});
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`Tool error [${name}]: ${message}`, "error");
      return {
        content: [{ type: "text", text: `Error in ${name}: ${message}` }],
        isError: true,
      };
    }
  });
}
