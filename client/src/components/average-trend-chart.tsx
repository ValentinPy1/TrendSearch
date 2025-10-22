import { GlassmorphicCard } from "./glassmorphic-card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { Keyword } from "@shared/schema";
import { calculateAverageTrendData, calculateGrowthFromTrend } from "@/lib/trend-calculations";

interface AverageTrendChartProps {
  keywords: Keyword[];
}

export function AverageTrendChart({ keywords }: AverageTrendChartProps) {
  if (!keywords || keywords.length === 0) {
    return null;
  }

  const averageTrendData = calculateAverageTrendData(keywords);

  if (averageTrendData.length === 0) {
    return null;
  }

  const { growth3m, growthYoy } = calculateGrowthFromTrend(averageTrendData);

  // Calculate weighted average of sustained growth indicators
  const calculateWeightedAverage = (getValue: (k: Keyword) => number) => {
    const totalWeight = keywords.reduce((sum, k) => {
      const scoreStr = k.similarityScore || "0";
      const matchPct = parseFloat(scoreStr.replace('%', '')) / 100;
      const weight = matchPct * matchPct;
      return sum + weight;
    }, 0);

    if (totalWeight === 0) return 0;

    const weightedSum = keywords.reduce((sum, k) => {
      const scoreStr = k.similarityScore || "0";
      const matchPct = parseFloat(scoreStr.replace('%', '')) / 100;
      const weight = matchPct * matchPct;
      const value = getValue(k);
      if (isNaN(weight) || isNaN(value)) return sum;
      return sum + (value * weight);
    }, 0);

    return weightedSum / totalWeight;
  };

  const avgGrowthSlope = calculateWeightedAverage(k => parseFloat(k.growthSlope || "0"));
  const avgGrowthR2 = calculateWeightedAverage(k => parseFloat(k.growthR2 || "0"));
  const avgGrowthConsistency = calculateWeightedAverage(k => parseFloat(k.growthConsistency || "0"));
  const avgGrowthStability = calculateWeightedAverage(k => parseFloat(k.growthStability || "0"));
  const avgSustainedGrowthScore = calculateWeightedAverage(k => parseFloat(k.sustainedGrowthScore || "0"));

  return (
    <GlassmorphicCard className="p-8">
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-semibold text-white mb-2">
              Average Search Volume Trend
            </h3>
            <p className="text-sm text-white/60">
              Weighted average across all 10 keywords over 12 months
            </p>
          </div>
          <div className="flex gap-6">
            <div className="text-right">
              <div className="text-xs text-white/60 mb-1">3M Growth</div>
              <div 
                className="text-lg font-bold"
                style={{
                  color: growth3m >= 0 
                    ? `hsl(142, 70%, ${100 - Math.min(1, growth3m / 200) * 50}%)` 
                    : `hsl(0, 80%, ${100 - Math.min(1, Math.abs(growth3m) / 100) * 50}%)`
                }}
              >
                {growth3m >= 0 ? '+' : ''}{growth3m.toFixed(1)}%
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-white/60 mb-1">YoY Growth</div>
              <div 
                className="text-lg font-bold"
                style={{
                  color: growthYoy >= 0 
                    ? `hsl(142, 70%, ${100 - Math.min(1, growthYoy / 200) * 50}%)` 
                    : `hsl(0, 80%, ${100 - Math.min(1, Math.abs(growthYoy) / 100) * 50}%)`
                }}
              >
                {growthYoy >= 0 ? '+' : ''}{growthYoy.toFixed(1)}%
              </div>
            </div>
          </div>
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

        {/* Sustained Growth Indicators */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t border-white/10">
          <div className="text-center">
            <div className="text-xs text-white/60 mb-1">Growth Slope</div>
            <div className="text-sm font-semibold text-white">
              {avgGrowthSlope.toFixed(2)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-white/60 mb-1">Growth R²</div>
            <div className="text-sm font-semibold text-white">
              {avgGrowthR2.toFixed(3)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-white/60 mb-1">Consistency</div>
            <div className="text-sm font-semibold text-white">
              {avgGrowthConsistency.toFixed(2)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-white/60 mb-1">Stability</div>
            <div className="text-sm font-semibold text-white">
              {avgGrowthStability.toFixed(2)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-white/60 mb-1">Sustained Score</div>
            <div 
              className="text-sm font-bold"
              style={{
                color: avgSustainedGrowthScore >= 7 
                  ? 'hsl(142, 70%, 60%)' 
                  : avgSustainedGrowthScore >= 4
                  ? 'hsl(45, 90%, 60%)'
                  : 'hsl(0, 80%, 65%)'
              }}
            >
              {avgSustainedGrowthScore.toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </GlassmorphicCard>
  );
}
