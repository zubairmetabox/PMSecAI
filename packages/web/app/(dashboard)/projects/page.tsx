import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { FolderKanban, ExternalLink } from "lucide-react";
import { db, projects, phases, tasks, eq, sql, desc } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/layout/header";

export default async function ProjectsPage() {
  await auth.protect();

  const allProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      repoName: projects.repoName,
      zohoProjectId: projects.zohoProjectId,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .orderBy(desc(projects.createdAt));

  // Enrich with task counts
  const enriched = await Promise.all(
    allProjects.map(async (p) => {
      const [taskStats] = await db
        .select({
          total: sql<number>`COUNT(*)`,
          completed: sql<number>`SUM(CASE WHEN ${tasks.status} = 'completed' THEN 1 ELSE 0 END)`,
        })
        .from(tasks)
        .innerJoin(phases, eq(phases.id, tasks.phaseId))
        .where(eq(phases.projectId, p.id));

      return {
        ...p,
        totalTasks: Number(taskStats?.total ?? 0),
        completedTasks: Number(taskStats?.completed ?? 0),
      };
    })
  );

  return (
    <div className="flex flex-col">
      <Header title="Projects" description="All Zoho-linked projects" />
      <div className="p-6">
        {enriched.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FolderKanban className="mx-auto h-10 w-10 mb-3 opacity-40" />
            <p>No projects yet. Link a repo using PMSecAI in Claude Code.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {enriched.map((p) => {
              const progress =
                p.totalTasks > 0 ? Math.round((p.completedTasks / p.totalTasks) * 100) : 0;
              return (
                <Link key={p.id} href={`/projects/${p.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{p.name}</CardTitle>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      </div>
                      {p.repoName && (
                        <p className="text-xs text-muted-foreground font-mono">{p.repoName}</p>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {p.completedTasks}/{p.totalTasks} tasks
                        </span>
                        <Badge variant={progress === 100 ? "success" : "secondary"}>
                          {progress}%
                        </Badge>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div
                          className="bg-primary h-1.5 rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
