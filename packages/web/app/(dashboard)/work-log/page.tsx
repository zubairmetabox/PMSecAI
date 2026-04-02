import { auth } from "@clerk/nextjs/server";
import { db, nonZohoWork, developerProfiles, eq, desc } from "@/lib/db";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { formatCost, formatDate, formatDuration, formatTokens } from "@/lib/utils";

export default async function WorkLogPage() {
  await auth.protect();

  const entries = await db
    .select()
    .from(nonZohoWork)
    .orderBy(desc(nonZohoWork.startedAt));

  const enriched = await Promise.all(
    entries.map(async (e) => {
      const [profile] = await db
        .select({ name: developerProfiles.name })
        .from(developerProfiles)
        .where(eq(developerProfiles.clerkUserId, e.clerkUserId));
      return { ...e, developerName: profile?.name ?? e.clerkUserId };
    })
  );

  return (
    <div className="flex flex-col">
      <Header
        title="Work Log"
        description="Non-Zoho work sessions — R&D, exploration, internal tooling"
      />
      <div className="p-6">
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Developer</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Duration</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Tokens</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Cost</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Model</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map((e) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium max-w-xs truncate">{e.description}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.developerName}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(e.startedAt)}</td>
                  <td className="px-4 py-3 text-right text-xs">
                    {e.durationSeconds ? formatDuration(e.durationSeconds) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {formatTokens(e.totalTokens)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {formatCost(parseFloat(String(e.costUsd)))}
                  </td>
                  <td className="px-4 py-3">
                    {e.model && <Badge variant="secondary" className="text-xs">{e.model}</Badge>}
                  </td>
                </tr>
              ))}
              {enriched.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No work log entries yet.
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
