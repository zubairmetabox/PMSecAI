import { zohoApi, sleep } from "./client.js";
import { getPortalId } from "./portal.js";

export interface ZohoTasklist {
  id: string;
  name: string;
  sequence: number;
}

export interface ZohoTask {
  id: string;
  name: string;
  status: { name: string };
  tasklist?: { id: string; name: string };
  subtasks?: ZohoTask[];
}

// ─── Tasklists (Phases) ───────────────────────────────────────────────────────

export async function getTasklists(projectId: string): Promise<ZohoTasklist[]> {
  const portalId = await getPortalId();
  const resp = await zohoApi.get<{ tasklists: ZohoTasklist[] }>(
    `/portal/${portalId}/projects/${projectId}/tasklists/`
  );
  return resp.data.tasklists ?? [];
}

export async function createTasklist(projectId: string, name: string): Promise<ZohoTasklist> {
  const portalId = await getPortalId();
  const resp = await zohoApi.post<{ tasklists: ZohoTasklist[] }>(
    `/portal/${portalId}/projects/${projectId}/tasklists/`,
    new URLSearchParams({ name }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return resp.data.tasklists[0];
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function getTasksInTasklist(
  projectId: string,
  tasklistId: string
): Promise<ZohoTask[]> {
  const portalId = await getPortalId();
  const resp = await zohoApi.get<{ tasks: ZohoTask[] }>(
    `/portal/${portalId}/projects/${projectId}/tasklists/${tasklistId}/tasks/`
  );
  return resp.data.tasks ?? [];
}

export async function createTask(
  projectId: string,
  tasklistId: string,
  name: string
): Promise<ZohoTask> {
  const portalId = await getPortalId();
  await sleep(200); // respect rate limits
  const resp = await zohoApi.post<{ tasks: ZohoTask[] }>(
    `/portal/${portalId}/projects/${projectId}/tasks/`,
    new URLSearchParams({ name, tasklist_id: tasklistId }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return resp.data.tasks[0];
}

export async function createSubtask(
  projectId: string,
  parentTaskId: string,
  name: string
): Promise<ZohoTask> {
  const portalId = await getPortalId();
  await sleep(200);
  const resp = await zohoApi.post<{ tasks: ZohoTask[] }>(
    `/portal/${portalId}/projects/${projectId}/tasks/`,
    new URLSearchParams({ name, parent_task_id: parentTaskId }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return resp.data.tasks[0];
}

export async function completeTask(projectId: string, taskId: string): Promise<void> {
  const portalId = await getPortalId();
  await zohoApi.post(
    `/portal/${portalId}/projects/${projectId}/tasks/${taskId}/`,
    new URLSearchParams({ status: "closed" }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
}

// ─── Time Logs ────────────────────────────────────────────────────────────────

export async function logTime(
  projectId: string,
  taskId: string,
  hours: number,
  minutes: number,
  logDate: string // YYYY-MM-DD
): Promise<void> {
  const portalId = await getPortalId();
  await zohoApi.post(
    `/portal/${portalId}/projects/${projectId}/tasks/${taskId}/logs/`,
    new URLSearchParams({
      date: logDate,
      hours: String(hours),
      minutes: String(minutes),
      billing_status: "Non Billable",
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
}

// ─── Comments (used as fallback for token data on Premium plan) ───────────────

export async function addComment(
  projectId: string,
  taskId: string,
  content: string
): Promise<void> {
  const portalId = await getPortalId();
  await zohoApi.post(
    `/portal/${portalId}/projects/${projectId}/tasks/${taskId}/comments/`,
    new URLSearchParams({ content }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
}

// ─── Fuzzy task search across all tasklists ───────────────────────────────────

export async function findTaskByName(
  projectId: string,
  query: string
): Promise<{ task: ZohoTask; tasklistId: string } | null> {
  const tasklists = await getTasklists(projectId);
  const q = query.toLowerCase().trim();

  for (const tl of tasklists) {
    const tasks = await getTasksInTasklist(projectId, tl.id);
    const match = tasks.find((t) => t.name.toLowerCase().includes(q));
    if (match) return { task: match, tasklistId: tl.id };
  }
  return null;
}
