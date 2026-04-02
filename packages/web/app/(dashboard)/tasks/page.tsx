import { auth } from "@clerk/nextjs/server";
import { db, tasks, phases, projects, developerProfiles, workSessions, eq, desc, sql } from "@/lib/db";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, Square } from "lucide-react";
import { formatCost, formatDuration, formatTokens } from "@/lib/utils";
import Link from "next/link";

export default async function TasksPage() {
  await auth.protect();

  const allTasks = await db
    .select({
      id: tasks.id,
      name: tasks.name,
      status: tasks.status,
      assignedTo: tasks.assignedTo,
      startedAt: tasks.startedAt,
      completedAt: tasks.completedAt,
      phaseId: tasks.phaseId,
      phaseName: phases.name,
      projectId: phases.projectId,
      projectName: projects.name,
    })
    .from(tasks)
    .innerJoin(phases, eq(phases.id, tasks.phaseId))
    .innerJoin(projects, eq(projects.id, phases.projectId))
    .orderBy(desc(tasks.completedAt));

  const enriched = await Promise.all(
    allTasks.map(async (t) => {
      const [sessionStats] = await db
        .select({
          totalCost: sql<string>`COALESCE(SUM(cost_usd::numeric), 0)`,
          totalTokens: sql<number>`COALESCE(SUM(total_tokens_in + total_tokens_out), 0)`,
          totalDuration: sql<number>`COALESCE(SUM(duration_seconds), 0)`,
        })
        .from(workSessions)
        .where(eq(workSessions.taskId, t.id));

      const assignee = t.assignedTo
        ? (
            await db
              .select({ name: developerProfiles.name })
              .from(developerProfiles)
              .where(eq(developerProfiles.clerkUserId, t.assignedTo))
          )[0]
        : null;

      return { ...t, sessionStats, assigneeName: assignee?.name ?? null };
    })
  );

  return (
    <div className="flex flex-col">
      <Header title="Tasks" description="All tasks across projects" />
      <div className="p-6">
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Task</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Project</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Assignee</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Tokens</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Cost</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Duration</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map((t) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {t.status === "completed" ? (
                        <CheckSquare className="h-3.5 w-3.5 text-green-600 shrink-0" />
                      ) : (
                        <Square className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="font-medium truncate max-w-xs">{t.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${t.projectId}`}
                      className="text-primary hover:underline"
                    >
                      {t.projectName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {t.assigneeName ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {t.sessionStats?.totalTokens
                      ? formatTokens(Number(t.sessionStats.totalTokens))
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {t.sessionStats?.totalCost
                      ? formatCost(parseFloat(t.sessionStats.totalCost))
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                    {t.sessionStats?.totalDuration
                      ? formatDuration(Number(t.sessionStats.totalDuration))
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={t.status === "completed" ? "success" : t.status === "in_progress" ? "warning" : "outline"}>
                      {t.status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {enriched.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No tasks yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
