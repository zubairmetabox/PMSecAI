import { auth } from "@clerk/nextjs/server";
import { db, systemUsage, developerProfiles, eq, desc, sql, gte } from "@/lib/db";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { Bot, Zap, DollarSign, Hash } from "lucide-react";
import { formatCost, formatDate, formatTokens } from "@/lib/utils";

export default async function PMSecAIUsagePage() {
  await auth.protect();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [totals] = await db
    .select({
      totalCost: sql<string>`COALESCE(SUM(cost_usd::numeric), 0)`,
      totalTokensIn: sql<number>`COALESCE(SUM(tokens_in), 0)`,
      totalTokensOut: sql<number>`COALESCE(SUM(tokens_out), 0)`,
      totalOps: sql<number>`COUNT(*)`,
    })
    .from(systemUsage)
    .where(gte(systemUsage.createdAt, thirtyDaysAgo));

  // Top operations by cost
  const topOps = await db
    .select({
      operation: systemUsage.operation,
      count: sql<number>`COUNT(*)`,
      totalCost: sql<string>`SUM(cost_usd::numeric)`,
      avgCost: sql<string>`AVG(cost_usd::numeric)`,
    })
    .from(systemUsage)
    .where(gte(systemUsage.createdAt, thirtyDaysAgo))
    .groupBy(systemUsage.operation)
    .orderBy(sql`SUM(cost_usd::numeric) DESC`);

  // Recent entries
  const recent = await db
    .select()
    .from(systemUsage)
    .orderBy(desc(systemUsage.createdAt))
    .limit(50);

  const enrichedRecent = await Promise.all(
    recent.map(async (r) => {
      const [profile] = await db
        .select({ name: developerProfiles.name })
        .from(developerProfiles)
        .where(eq(developerProfiles.clerkUserId, r.clerkUserId));
      return { ...r, developerName: profile?.name ?? r.clerkUserId };
    })
  );

  return (
    <div className="flex flex-col">
      <Header
        title="PMSecAI Usage"
        description="AI cost from PMSecAI's internal operations (plan parsing, fuzzy matching, etc.)"
      />
      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            title="System Cost (30d)"
            value={formatCost(parseFloat(totals?.totalCost ?? "0"))}
            sub="PMSecAI internal ops"
            icon={DollarSign}
          />
          <StatCard
            title="Operations Run"
            value={String(totals?.totalOps ?? 0)}
            sub="Total API calls made"
            icon={Hash}
          />
          <StatCard
            title="Tokens In (30d)"
            value={formatTokens(totals?.totalTokensIn ?? 0)}
            icon={Zap}
          />
          <StatCard
            title="Tokens Out (30d)"
            value={formatTokens(totals?.totalTokensOut ?? 0)}
            icon={Bot}
          />
        </div>

        {/* Top operations */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cost by Operation (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left pb-2 font-medium text-muted-foreground">Operation</th>
                  <th className="text-right pb-2 font-medium text-muted-foreground">Calls</th>
                  <th className="text-right pb-2 font-medium text-muted-foreground">Total Cost</th>
                  <th className="text-right pb-2 font-medium text-muted-foreground">Avg Cost</th>
                </tr>
              </thead>
              <tbody>
                {topOps.map((op) => (
                  <tr key={op.operation} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{op.operation}</td>
                    <td className="py-2 text-right text-muted-foreground">{op.count}</td>
                    <td className="py-2 text-right font-mono text-xs">{formatCost(parseFloat(op.totalCost))}</td>
                    <td className="py-2 text-right font-mono text-xs">{formatCost(parseFloat(op.avgCost))}</td>
                  </tr>
                ))}
                {topOps.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-muted-foreground">No data yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Recent log */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent System Calls</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {enrichedRecent.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                      {r.operation}
                    </span>
                    <span className="text-muted-foreground text-xs ml-2">
                      by {r.developerName} · {formatDate(r.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {formatTokens(r.tokensIn + r.tokensOut)} tokens
                    </span>
                    <span className="font-mono text-xs">{formatCost(parseFloat(String(r.costUsd)))}</span>
                    {r.model && <Badge variant="secondary" className="text-xs">{r.model}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
