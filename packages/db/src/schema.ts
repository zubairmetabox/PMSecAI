import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", ["admin", "developer"]);
export const taskStatusEnum = pgEnum("task_status", ["open", "in_progress", "completed"]);
export const subtaskStatusEnum = pgEnum("subtask_status", ["open", "completed"]);
export const sessionSourceEnum = pgEnum("session_source", ["developer", "pmsecai_system"]);

// ─── Developer Profiles ───────────────────────────────────────────────────────
// Clerk owns identity. This table extends Clerk users with app-specific data.

export const developerProfiles = pgTable(
  "developer_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: userRoleEnum("role").notNull().default("developer"),
    zohoEmail: text("zoho_email"),
    vsCodeIdentity: text("vs_code_identity").notNull(), // "Name <email>" used by MCP to resolve user
    claudeModel: text("claude_model").default("claude-sonnet-4-6"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_developer_vs_code_identity").on(t.vsCodeIdentity)]
);

// ─── Projects ─────────────────────────────────────────────────────────────────

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    zohoProjectId: text("zoho_project_id").notNull().unique(),
    name: text("name").notNull(),
    repoPath: text("repo_path"),
    repoName: text("repo_name"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_projects_zoho_id").on(t.zohoProjectId)]
);

// ─── Phases (Zoho Tasklists) ──────────────────────────────────────────────────

export const phases = pgTable(
  "phases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    zohoTasklistId: text("zoho_tasklist_id").notNull(),
    name: text("name").notNull(),
    order: integer("order").notNull().default(0),
  },
  (t) => [
    uniqueIndex("uq_phases_zoho_tasklist_id").on(t.zohoTasklistId),
    index("idx_phases_project_id").on(t.projectId),
  ]
);

// ─── Tasks ────────────────────────────────────────────────────────────────────

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phaseId: uuid("phase_id")
      .notNull()
      .references(() => phases.id, { onDelete: "cascade" }),
    zohoTaskId: text("zoho_task_id").notNull().unique(),
    name: text("name").notNull(),
    status: taskStatusEnum("status").notNull().default("open"),
    assignedTo: text("assigned_to"), // clerk_user_id of assignee
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
  },
  (t) => [
    uniqueIndex("uq_tasks_zoho_task_id").on(t.zohoTaskId),
    index("idx_tasks_phase_id").on(t.phaseId),
    index("idx_tasks_assigned_to").on(t.assignedTo),
  ]
);

// ─── Subtasks ─────────────────────────────────────────────────────────────────

export const subtasks = pgTable(
  "subtasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    zohoSubtaskId: text("zoho_subtask_id").notNull().unique(),
    name: text("name").notNull(),
    status: subtaskStatusEnum("status").notNull().default("open"),
  },
  (t) => [
    uniqueIndex("uq_subtasks_zoho_subtask_id").on(t.zohoSubtaskId),
    index("idx_subtasks_task_id").on(t.taskId),
  ]
);

// ─── Work Sessions ────────────────────────────────────────────────────────────
// Tracks both developer coding sessions (source=developer)
// and PMSecAI internal Claude calls (source=pmsecai_system).

export const workSessions = pgTable(
  "work_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    clerkUserId: text("clerk_user_id").notNull(),
    source: sessionSourceEnum("source").notNull().default("developer"),
    startedAt: timestamp("started_at").notNull(),
    endedAt: timestamp("ended_at"),
    totalTokensIn: integer("total_tokens_in").notNull().default(0),
    totalTokensOut: integer("total_tokens_out").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 8 }).notNull().default("0"),
    model: text("model"),
    // Wall-clock duration in seconds (populated on completion)
    durationSeconds: integer("duration_seconds"),
  },
  (t) => [
    index("idx_work_sessions_clerk_user_id").on(t.clerkUserId),
    index("idx_work_sessions_task_id").on(t.taskId),
    index("idx_work_sessions_source").on(t.source),
    index("idx_work_sessions_started_at").on(t.startedAt),
  ]
);

// ─── Non-Zoho Work ────────────────────────────────────────────────────────────
// Work that has no corresponding Zoho project (R&D, exploration, etc.)

export const nonZohoWork = pgTable(
  "non_zoho_work",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull(),
    description: text("description").notNull(),
    startedAt: timestamp("started_at").notNull(),
    endedAt: timestamp("ended_at"),
    totalTokens: integer("total_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 8 }).notNull().default("0"),
    model: text("model"),
    durationSeconds: integer("duration_seconds"),
  },
  (t) => [
    index("idx_non_zoho_work_clerk_user_id").on(t.clerkUserId),
    index("idx_non_zoho_work_started_at").on(t.startedAt),
  ]
);

// ─── System Usage ─────────────────────────────────────────────────────────────
// Granular log of every internal PMSecAI Claude API call.
// Rolled up in the /pmsecai-usage dashboard page.

export const systemUsage = pgTable(
  "system_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull(),
    operation: text("operation").notNull(), // e.g. "parse_plan", "fuzzy_match_project"
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 8 }).notNull().default("0"),
    model: text("model"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_system_usage_clerk_user_id").on(t.clerkUserId),
    index("idx_system_usage_created_at").on(t.createdAt),
  ]
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const projectsRelations = relations(projects, ({ many }) => ({
  phases: many(phases),
}));

export const phasesRelations = relations(phases, ({ one, many }) => ({
  project: one(projects, { fields: [phases.projectId], references: [projects.id] }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  phase: one(phases, { fields: [tasks.phaseId], references: [phases.id] }),
  subtasks: many(subtasks),
  workSessions: many(workSessions),
}));

export const subtasksRelations = relations(subtasks, ({ one }) => ({
  task: one(tasks, { fields: [subtasks.taskId], references: [tasks.id] }),
}));

export const workSessionsRelations = relations(workSessions, ({ one }) => ({
  task: one(tasks, { fields: [workSessions.taskId], references: [tasks.id] }),
}));
