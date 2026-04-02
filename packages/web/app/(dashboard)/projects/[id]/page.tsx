import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { db, projects, phases, tasks, subtasks, workSessions, developerProfiles, eq, desc } from "@/lib/db";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckSquare, Square, ChevronRight } from "lucide-react";
import { formatCost, formatDate, formatDuration, formatTokens } from "@/lib/utils";

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  await auth.protect();

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, params.id));

  if (!project) notFound();

  const projectPhases = await db
    .select()
    .from(phases)
    .where(eq(phases.projectId, project.id))
    .orderBy(phases.order);

  const phasesWithTasks = await Promise.all(
    projectPhases.map(async (phase) => {
      const phaseTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.phaseId, phase.id))
        .orderBy(tasks.status);

      const tasksWithDetails = await Promise.all(
        phaseTasks.map(async (task) => {
          const taskSubtasks = await db
            .select()
            .from(subtasks)
            .where(eq(subtasks.taskId, task.id));

          const sessions = await db
            .select()
            .from(workSessions)
            .where(eq(workSessions.taskId, task.id))
            .orderBy(desc(workSessions.startedAt));

          const assignee = task.assignedTo
            ? (
                await db
                  .select({ name: developerProfiles.name })
                  .from(developerProfiles)
                  .where(eq(developerProfiles.clerkUserId, task.assignedTo))
              )[0]
            : null;

          const totalCost = sessions.reduce((sum, s) => sum + parseFloat(String(s.costUsd)), 0);
          const totalTokens = sessions.reduce((sum, s) => sum + s.totalTokensIn + s.totalTokensOut, 0);
          const totalDuration = sessions.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);

          return { ...task, subtasks: taskSubtasks, sessions, assignee, totalCost, totalTokens, totalDuration };
        })
      );

      return { ...phase, tasks: tasksWithDetails };
    })
  );

  return (
    <div className="flex flex-col">
      <Header
        title={project.name}
        description={project.repoName ? `Repo: ${project.repoName}` : undefined}
      />
      <div className="p-6 space-y-6">
        {phasesWithTasks.map((phase) => (
          <Card key={phase.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                {phase.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {phase.tasks.map((task) => (
                <div key={task.id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    {task.status === "completed" ? (
                      <CheckSquare className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{task.name}</p>
                      {task.assignee && (
                        <p className="text-xs text-muted-foreground">{task.assignee.name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {task.totalCost > 0 && (
                        <span className="text-xs font-mono text-muted-foreground">
                          {formatCost(task.totalCost)}
                        </span>
                      )}
                      {task.totalTokens > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {formatTokens(task.totalTokens)}
                        </Badge>
                      )}
                      {task.totalDuration > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {formatDuration(task.totalDuration)}
                        </Badge>
                      )}
                      <Badge variant={task.status === "completed" ? "success" : "outline"}>
                        {task.status}
                      </Badge>
                    </div>
                  </div>

                  {/* Subtasks */}
                  {task.subtasks.length > 0 && (
                    <div className="ml-6 space-y-1">
                      {task.subtasks.map((st) => (
                        <div key={st.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                          {st.status === "completed" ? (
                            <CheckSquare className="h-3 w-3 text-green-600" />
                          ) : (
                            <Square className="h-3 w-3" />
                          )}
                          {st.name}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Sessions */}
                  {task.sessions.length > 0 && (
                    <div className="ml-6 border-t pt-2 space-y-1">
                      {task.sessions.map((s) => (
                        <div key={s.id} className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{s.endedAt ? formatDate(s.endedAt) : "In progress"}</span>
                          <span>{formatCost(parseFloat(String(s.costUsd)))} · {s.model ?? "unknown model"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {phase.tasks.length === 0 && (
                <p className="text-sm text-muted-foreground">No tasks in this phase.</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
