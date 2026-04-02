"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CostDataPoint {
  date: string;
  developer: number;
  system: number;
}

interface CostChartProps {
  data: CostDataPoint[];
}

export function CostChart({ data }: CostChartProps) {
  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle className="text-base">AI Cost — Last 30 Days</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="devGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(262.1 83.3% 57.8%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(262.1 83.3% 57.8%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="sysGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(200 95% 45%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(200 95% 45%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `$${v.toFixed(2)}`}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                `$${value.toFixed(4)}`,
                name === "developer" ? "Developer" : "PMSecAI System",
              ]}
            />
            <Area
              type="monotone"
              dataKey="developer"
              stroke="hsl(262.1 83.3% 57.8%)"
              fill="url(#devGradient)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="system"
              stroke="hsl(200 95% 45%)"
              fill="url(#sysGradient)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
