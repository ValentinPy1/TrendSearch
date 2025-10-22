import { GlassmorphicCard } from "./glassmorphic-card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { Keyword } from "@shared/schema";

interface AverageTrendChartProps {
  keywords: Keyword[];
}

export function AverageTrendChart({ keywords }: AverageTrendChartProps) {
  if (!keywords || keywords.length === 0) {
    return null;
  }

  // Calculate weighted average for each month
  // Using weight = (match%)² only (same as volume calculation)
  const calculateAverageTrend = () => {
    // Get all unique months from any keyword
    const firstKeyword = keywords.find(k => k.monthlyData && k.monthlyData.length > 0);
    if (!firstKeyword || !firstKeyword.monthlyData) return [];

    const months = firstKeyword.monthlyData.map(m => m.month);

    return months.map((month, monthIndex) => {
      // Calculate total weight
      const totalWeight = keywords.reduce((sum, k) => {
        const scoreStr = k.similarityScore || "0";
        const matchPct = parseFloat(scoreStr.replace('%', '')) / 100;
        const weight = matchPct * matchPct;
        return sum + weight;
      }, 0);

      if (totalWeight === 0) return { month, volume: 0 };

      // Calculate weighted sum of square roots
      const weightedSumOfSqrts = keywords.reduce((sum, k) => {
        const scoreStr = k.similarityScore || "0";
        const matchPct = parseFloat(scoreStr.replace('%', '')) / 100;
        const weight = matchPct * matchPct;
        
        if (!k.monthlyData || !k.monthlyData[monthIndex]) return sum;
        
        const volume = k.monthlyData[monthIndex].volume || 0;
        return sum + (Math.sqrt(volume) * weight);
      }, 0);

      const avgSqrt = weightedSumOfSqrts / totalWeight;
      const avgVolume = Math.round(avgSqrt * avgSqrt);

      return { month, volume: avgVolume };
    });
  };

  const averageTrendData = calculateAverageTrend();

  if (averageTrendData.length === 0) {
    return null;
  }

  return (
    <GlassmorphicCard className="p-8">
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-semibold text-white mb-2">
            Average Search Volume Trend
          </h3>
          <p className="text-sm text-white/60">
            Weighted average across all 10 keywords over 12 months
          </p>
        </div>

        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={averageTrendData}>
              <defs>
                <linearGradient id="colorAverageVolume" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(210, 70%, 55%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(210, 70%, 55%)" stopOpacity={0} />
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
                stroke="hsl(210, 70%, 55%)"
                strokeWidth={3}
                fill="url(#colorAverageVolume)"
                dot={{ fill: "hsl(210, 70%, 55%)", r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </GlassmorphicCard>
  );
}
