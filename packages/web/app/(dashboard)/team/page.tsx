import { auth, currentUser } from "@clerk/nextjs/server";
import { db, developerProfiles, workSessions, nonZohoWork, tasks, eq, sql, gte, desc } from "@/lib/db";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCost, formatTokens } from "@/lib/utils";

export default async function TeamPage() {
  const { userId } = await auth.protect();

  // Check if current user is admin
  const [myProfile] = await db
    .select({ role: developerProfiles.role })
    .from(developerProfiles)
    .where(eq(developerProfiles.clerkUserId, userId!));

  const isAdmin = myProfile?.role === "admin";

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const allProfiles = await db
    .select()
    .from(developerProfiles)
    .orderBy(developerProfiles.name);

  const enriched = await Promise.all(
    allProfiles.map(async (p) => {
      const [sessionStats] = await db
        .select({
          totalCost: sql<string>`COALESCE(SUM(cost_usd::numeric), 0)`,
          totalTokens: sql<number>`COALESCE(SUM(total_tokens_in + total_tokens_out), 0)`,
          sessionCount: sql<number>`COUNT(*)`,
        })
        .from(workSessions)
        .where(eq(workSessions.clerkUserId, p.clerkUserId))
        // Only show 30-day data to non-admins looking at others
        // Admins see all time — adjust if needed

      const [completedCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(tasks)
        .where(eq(tasks.assignedTo, p.clerkUserId));

      return {
        ...p,
        totalCost: parseFloat(sessionStats?.totalCost ?? "0"),
        totalTokens: sessionStats?.totalTokens ?? 0,
        sessionCount: sessionStats?.sessionCount ?? 0,
        completedTasks: completedCount?.count ?? 0,
      };
    })
  );

  return (
    <div className="flex flex-col">
      <Header title="Team" description="Per-developer AI usage and productivity" />
      <div className="p-6">
        {!isAdmin && (
          <p className="text-sm text-muted-foreground mb-4">
            Showing all-time stats. Admin view shows full detail.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {enriched.map((dev) => (
            <Card key={dev.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{dev.name}</CardTitle>
                  <Badge variant={dev.role === "admin" ? "default" : "secondary"}>
                    {dev.role}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{dev.email}</p>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">AI Cost</span>
                  <span className="font-mono font-medium">{formatCost(dev.totalCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tokens Used</span>
                  <span className="font-mono">{formatTokens(dev.totalTokens)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sessions</span>
                  <span>{dev.sessionCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tasks Completed</span>
                  <span>{dev.completedTasks}</span>
                </div>
                {isAdmin && (
                  <div className="pt-1 border-t text-xs text-muted-foreground font-mono">
                    {dev.vsCodeIdentity}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
