import { NextRequest, NextResponse } from "next/server";
import { validateSyncAuth } from "@/lib/sync-auth";
import {
  db,
  projects,
  phases,
  tasks,
  subtasks,
  workSessions,
  nonZohoWork,
  systemUsage,
  developerProfiles,
  eq,
} from "@/lib/db";

export async function POST(req: NextRequest) {
  if (!validateSyncAuth(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { type: string; payload: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, payload } = body;

  try {
    switch (type) {
      case "project":
        await upsertProject(payload);
        break;
      case "phase":
        await upsertPhase(payload);
        break;
      case "task":
        await upsertTask(payload);
        break;
      case "task_status":
        await updateTaskStatus(payload);
        break;
      case "subtask":
        await upsertSubtask(payload);
        break;
      case "session":
        await insertSession(payload);
        break;
      case "non_zoho_work":
        await insertNonZohoWork(payload);
        break;
      case "system_usage":
        await insertSystemUsage(payload);
        break;
      default:
        return NextResponse.json({ error: `Unknown sync type: ${type}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[/api/sync] Error handling type="${type}":`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function upsertProject(p: Record<string, unknown>) {
  await db
    .insert(projects)
    .values({
      zohoProjectId: String(p.zohoProjectId),
      name: String(p.name),
      repoPath: p.repoPath ? String(p.repoPath) : null,
      repoName: p.repoName ? String(p.repoName) : null,
    })
    .onConflictDoUpdate({
      target: projects.zohoProjectId,
      set: {
        name: String(p.name),
        repoPath: p.repoPath ? String(p.repoPath) : null,
        repoName: p.repoName ? String(p.repoName) : null,
        updatedAt: new Date(),
      },
    });
}

async function upsertPhase(p: Record<string, unknown>) {
  // Find the project row first
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.zohoProjectId, String(p.zohoProjectId)));
  if (!project) return;

  await db
    .insert(phases)
    .values({
      projectId: project.id,
      zohoTasklistId: String(p.zohoTasklistId),
      name: String(p.name),
    })
    .onConflictDoUpdate({
      target: phases.zohoTasklistId,
      set: { name: String(p.name) },
    });
}

async function upsertTask(p: Record<string, unknown>) {
  const [phase] = await db
    .select({ id: phases.id })
    .from(phases)
    .where(eq(phases.zohoTasklistId, String(p.zohoTasklistId)));
  if (!phase) return;

  await db
    .insert(tasks)
    .values({
      phaseId: phase.id,
      zohoTaskId: String(p.zohoTaskId),
      name: String(p.name),
      status: "open",
    })
    .onConflictDoUpdate({
      target: tasks.zohoTaskId,
      set: { name: String(p.name) },
    });
}

async function updateTaskStatus(p: Record<string, unknown>) {
  await db
    .update(tasks)
    .set({
      status: "completed",
      completedAt: p.completedAt ? new Date(String(p.completedAt)) : new Date(),
    })
    .where(eq(tasks.zohoTaskId, String(p.zohoTaskId)));
}

async function upsertSubtask(p: Record<string, unknown>) {
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.zohoTaskId, String(p.zohoTaskId)));
  if (!task) return;

  await db
    .insert(subtasks)
    .values({
      taskId: task.id,
      zohoSubtaskId: String(p.zohoSubtaskId),
      name: String(p.name),
    })
    .onConflictDoUpdate({
      target: subtasks.zohoSubtaskId,
      set: { name: String(p.name) },
    });
}

async function resolveClerkUserId(vsCodeIdentity: string): Promise<string> {
  const [profile] = await db
    .select({ clerkUserId: developerProfiles.clerkUserId })
    .from(developerProfiles)
    .where(eq(developerProfiles.vsCodeIdentity, vsCodeIdentity));
  // Fall back to the identity string itself if profile not yet created
  return profile?.clerkUserId ?? vsCodeIdentity;
}

async function insertSession(p: Record<string, unknown>) {
  const clerkUserId = await resolveClerkUserId(String(p.vsCodeIdentity));

  let taskId: string | null = null;
  if (p.zohoTaskId) {
    const [task] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.zohoTaskId, String(p.zohoTaskId)));
    taskId = task?.id ?? null;
  }

  await db.insert(workSessions).values({
    taskId,
    clerkUserId,
    source: "developer",
    startedAt: new Date(String(p.startedAt)),
    endedAt: p.endedAt ? new Date(String(p.endedAt)) : null,
    totalTokensIn: Number(p.totalTokensIn ?? 0),
    totalTokensOut: Number(p.totalTokensOut ?? 0),
    costUsd: String(p.costUsd ?? "0"),
    model: p.model ? String(p.model) : null,
    durationSeconds: p.durationSeconds ? Number(p.durationSeconds) : null,
  });
}

async function insertNonZohoWork(p: Record<string, unknown>) {
  const clerkUserId = await resolveClerkUserId(String(p.vsCodeIdentity));

  await db.insert(nonZohoWork).values({
    clerkUserId,
    description: String(p.description),
    startedAt: new Date(String(p.startedAt)),
    endedAt: p.endedAt ? new Date(String(p.endedAt)) : null,
    totalTokens: Number(p.totalTokens ?? 0),
    costUsd: String(p.costUsd ?? "0"),
    model: p.model ? String(p.model) : null,
    durationSeconds: p.durationSeconds ? Number(p.durationSeconds) : null,
  });
}

async function insertSystemUsage(p: Record<string, unknown>) {
  const clerkUserId = await resolveClerkUserId(String(p.vsCodeIdentity));

  await db.insert(systemUsage).values({
    clerkUserId,
    operation: String(p.operation),
    tokensIn: Number(p.tokensIn ?? 0),
    tokensOut: Number(p.tokensOut ?? 0),
    costUsd: String(p.costUsd ?? "0"),
    model: p.model ? String(p.model) : null,
  });
}
