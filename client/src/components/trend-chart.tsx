import { GlassmorphicCard } from "./glassmorphic-card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { Keyword } from "@shared/schema";

interface TrendChartProps {
  keywords: Keyword[];
  reportId: string;
  selectedKeyword: string | null;
}

export function TrendChart({ keywords, reportId, selectedKeyword }: TrendChartProps) {
  const keyword = keywords.find((k) => k.keyword === selectedKeyword) || keywords[0];

  if (!keyword || !keyword.monthlyData) {
    return null;
  }

  return (
    <GlassmorphicCard className="p-8">
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-semibold text-white mb-2">
            {keyword.keyword}
          </h3>
          <p className="text-sm text-white/60">
            12-month search volume history
          </p>
        </div>

        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={keyword.monthlyData}>
              <defs>
                <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(250, 70%, 60%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(250, 70%, 60%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis 
                dataKey="month" 
                stroke="rgba(255,255,255,0.6)"
                tick={{ fill: "rgba(255,255,255,0.6)" }}
              />
              <YAxis 
                stroke="rgba(255,255,255,0.6)"
                tick={{ fill: "rgba(255,255,255,0.6)" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(10, 10, 15, 0.9)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  backdropFilter: "blur(12px)",
                  color: "white",
                }}
              />
              <Line
                type="monotone"
                dataKey="volume"
                stroke="hsl(250, 70%, 60%)"
                strokeWidth={3}
                fill="url(#colorVolume)"
                dot={{ fill: "hsl(250, 70%, 60%)", r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </GlassmorphicCard>
  );
}
