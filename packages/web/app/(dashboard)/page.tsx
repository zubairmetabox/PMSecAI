import { auth } from "@clerk/nextjs/server";
import { DollarSign, Zap, CheckSquare, Bot } from "lucide-react";
import { db, workSessions, nonZohoWork, tasks, developerProfiles, systemUsage, eq, gte, sql, desc } from "@/lib/db";
import { StatCard } from "@/components/dashboard/stat-card";
import { CostChart } from "@/components/dashboard/cost-chart";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Header } from "@/components/layout/header";
import { formatCost, formatTokens } from "@/lib/utils";

export default async function DashboardPage() {
  await auth.protect();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // ── Stats ──
  const [devCostRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(cost_usd::numeric), 0)` })
    .from(workSessions)
    .where(gte(workSessions.startedAt, thirtyDaysAgo));

  const [sysCostRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(cost_usd::numeric), 0)` })
    .from(systemUsage)
    .where(gte(systemUsage.createdAt, thirtyDaysAgo));

  const [tokenRow] = await db
    .select({
      totalIn: sql<number>`COALESCE(SUM(total_tokens_in), 0)`,
      totalOut: sql<number>`COALESCE(SUM(total_tokens_out), 0)`,
    })
    .from(workSessions)
    .where(gte(workSessions.startedAt, thirtyDaysAgo));

  const [completedRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(tasks)
    .where(eq(tasks.status, "completed"));

  // ── Chart data — daily cost bucketed ──
  const dailyCosts = await db
    .select({
      date: sql<string>`DATE(started_at)`,
      developer: sql<number>`COALESCE(SUM(CASE WHEN source = 'developer' THEN cost_usd::numeric ELSE 0 END), 0)`,
      system: sql<number>`COALESCE(SUM(CASE WHEN source = 'pmsecai_system' THEN cost_usd::numeric ELSE 0 END), 0)`,
    })
    .from(workSessions)
    .where(gte(workSessions.startedAt, thirtyDaysAgo))
    .groupBy(sql`DATE(started_at)`)
    .orderBy(sql`DATE(started_at)`);

  // ── Recent activity ──
  const recentSessions = await db
    .select({
      id: workSessions.id,
      clerkUserId: workSessions.clerkUserId,
      costUsd: workSessions.costUsd,
      totalTokensIn: workSessions.totalTokensIn,
      totalTokensOut: workSessions.totalTokensOut,
      model: workSessions.model,
      endedAt: workSessions.endedAt,
      taskId: workSessions.taskId,
    })
    .from(workSessions)
    .orderBy(desc(workSessions.startedAt))
    .limit(10);

  // Fetch task names and developer names
  const enriched = await Promise.all(
    recentSessions.map(async (s) => {
      const [profile] = await db
        .select({ name: developerProfiles.name })
        .from(developerProfiles)
        .where(eq(developerProfiles.clerkUserId, s.clerkUserId));

      let taskName: string | null = null;
      if (s.taskId) {
        const [task] = await db
          .select({ name: tasks.name })
          .from(tasks)
          .where(eq(tasks.id, s.taskId));
        taskName = task?.name ?? null;
      }

      return {
        ...s,
        costUsd: String(s.costUsd),
        developerName: profile?.name ?? s.clerkUserId,
        taskName,
      };
    })
  );

  const totalCost = (devCostRow?.total ?? 0) + (sysCostRow?.total ?? 0);
  const totalTokens = (tokenRow?.totalIn ?? 0) + (tokenRow?.totalOut ?? 0);

  return (
    <div className="flex flex-col">
      <Header
        title="Dashboard"
        description="MetaBox Technology — AI usage overview"
      />
      <div className="p-6 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            title="Total AI Cost (30d)"
            value={formatCost(totalCost)}
            sub="Developer + PMSecAI system"
            icon={DollarSign}
          />
          <StatCard
            title="PMSecAI System Cost"
            value={formatCost(sysCostRow?.total ?? 0)}
            sub="Plan parsing, etc."
            icon={Bot}
          />
          <StatCard
            title="Tokens Used (30d)"
            value={formatTokens(totalTokens)}
            sub="Input + output"
            icon={Zap}
          />
          <StatCard
            title="Tasks Completed"
            value={String(completedRow?.count ?? 0)}
            sub="All time"
            icon={CheckSquare}
          />
        </div>

        {/* Chart + Activity */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <CostChart data={dailyCosts} />
          <ActivityFeed items={enriched} />
        </div>
      </div>
    </div>
  );
}
