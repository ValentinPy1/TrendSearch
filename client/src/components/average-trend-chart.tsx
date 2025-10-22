import { GlassmorphicCard } from "./glassmorphic-card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer } from "recharts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Keyword } from "@shared/schema";
import { calculateAverageTrendData, calculateGrowthFromTrend } from "@/lib/trend-calculations";
import { HelpCircle } from "lucide-react";

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
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-xl font-semibold text-white mb-2">
              Average Search Volume Trend
            </h3>
            <p className="text-sm text-white/60">
              Weighted average across all 10 keywords over 12 months
            </p>
          </div>
          
          {/* Sustained Growth Indicators */}
          <div className="flex gap-6 flex-wrap">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-right cursor-help">
                  <div className="flex items-center justify-end gap-1 text-xs text-white/60 mb-1">
                    <span>Slope</span>
                    <HelpCircle className="h-3 w-3" />
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {avgGrowthSlope.toFixed(2)}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Linear regression slope showing the rate of volume change over time. Higher values indicate faster growth.</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-right cursor-help">
                  <div className="flex items-center justify-end gap-1 text-xs text-white/60 mb-1">
                    <span>R²</span>
                    <HelpCircle className="h-3 w-3" />
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {avgGrowthR2.toFixed(3)}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>R-squared value (0-1) measuring how well growth fits a linear trend. Values closer to 1 indicate more predictable, linear growth.</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-right cursor-help">
                  <div className="flex items-center justify-end gap-1 text-xs text-white/60 mb-1">
                    <span>Consistency</span>
                    <HelpCircle className="h-3 w-3" />
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {avgGrowthConsistency.toFixed(2)}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Measures how regularly the trend moves in the same direction. Higher values mean fewer reversals in growth direction.</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-right cursor-help">
                  <div className="flex items-center justify-end gap-1 text-xs text-white/60 mb-1">
                    <span>Stability</span>
                    <HelpCircle className="h-3 w-3" />
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {avgGrowthStability.toFixed(2)}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Inverse of volatility - measures how steady the growth is. Higher values indicate less fluctuation in month-to-month changes.</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-right cursor-help">
                  <div className="flex items-center justify-end gap-1 text-xs text-white/60 mb-1">
                    <span>Score</span>
                    <HelpCircle className="h-3 w-3" />
                  </div>
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
              </TooltipTrigger>
              <TooltipContent>
                <p>Overall growth quality score (0-10) combining all metrics. Green ≥7 (excellent), Yellow ≥4 (moderate), Red &lt;4 (weak).</p>
              </TooltipContent>
            </Tooltip>
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
              <ChartTooltip
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
