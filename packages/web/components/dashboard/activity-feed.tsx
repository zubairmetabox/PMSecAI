import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCost, formatDate, formatTokens } from "@/lib/utils";

interface ActivityItem {
  id: string;
  developerName: string;
  taskName: string | null;
  costUsd: string;
  totalTokensIn: number;
  totalTokensOut: number;
  model: string | null;
  endedAt: Date | null;
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">No sessions yet.</p>
        )}
        {items.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium truncate">
                {item.taskName ?? "Non-project work"}
              </p>
              <p className="text-muted-foreground text-xs">
                {item.developerName} · {item.endedAt ? formatDate(item.endedAt) : "in progress"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="font-mono text-xs font-medium">{formatCost(parseFloat(item.costUsd))}</span>
              <Badge variant="secondary" className="text-xs">
                {formatTokens(item.totalTokensIn + item.totalTokensOut)} tokens
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
