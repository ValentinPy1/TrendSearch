import { GlassmorphicCard } from "./glassmorphic-card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Tooltip as TooltipUI, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
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

  // Convert decimal strings to numbers for display
  const growthSlope = keyword.growthSlope ? Number(keyword.growthSlope) : null;
  const growthConsistency = keyword.growthConsistency ? Number(keyword.growthConsistency) : null;
  const growthStability = keyword.growthStability ? Number(keyword.growthStability) : null;
  const growthR2 = keyword.growthR2 ? Number(keyword.growthR2) : null;
  const sustainedGrowthScore = keyword.sustainedGrowthScore ? Number(keyword.sustainedGrowthScore) : null;

  return (
    <GlassmorphicCard className="p-8">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-white mb-2">
              {keyword.keyword}
            </h3>
            <p className="text-sm text-white/60">
              12-month search volume history
            </p>
          </div>
          
          {/* Sustained Growth Indicators */}
          <div className="flex gap-6 flex-wrap">
            <TooltipUI>
              <TooltipTrigger asChild>
                <div className="text-right cursor-help">
                  <div className="flex items-center justify-end gap-1 text-xs text-white/60 mb-1">
                    <span>Slope</span>
                    <HelpCircle className="h-3 w-3" />
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {growthSlope !== null ? growthSlope.toFixed(2) : 'N/A'}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Linear regression slope showing the rate of volume change over time. Higher values indicate faster growth.</p>
              </TooltipContent>
            </TooltipUI>

            <TooltipUI>
              <TooltipTrigger asChild>
                <div className="text-right cursor-help">
                  <div className="flex items-center justify-end gap-1 text-xs text-white/60 mb-1">
                    <span>Consistency</span>
                    <HelpCircle className="h-3 w-3" />
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {growthConsistency !== null ? growthConsistency.toFixed(2) : 'N/A'}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Measures how regularly the trend moves in the same direction. Higher values mean fewer reversals in growth direction.</p>
              </TooltipContent>
            </TooltipUI>

            <TooltipUI>
              <TooltipTrigger asChild>
                <div className="text-right cursor-help">
                  <div className="flex items-center justify-end gap-1 text-xs text-white/60 mb-1">
                    <span>Stability</span>
                    <HelpCircle className="h-3 w-3" />
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {growthStability !== null ? growthStability.toFixed(2) : 'N/A'}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Inverse of volatility - measures how steady the growth is. Higher values indicate less fluctuation in month-to-month changes.</p>
              </TooltipContent>
            </TooltipUI>

            <TooltipUI>
              <TooltipTrigger asChild>
                <div className="text-right cursor-help">
                  <div className="flex items-center justify-end gap-1 text-xs text-white/60 mb-1">
                    <span>R²</span>
                    <HelpCircle className="h-3 w-3" />
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {growthR2 !== null ? growthR2.toFixed(3) : 'N/A'}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>R-squared value (0-1) measuring how well growth fits a linear trend. Values closer to 1 indicate more predictable, linear growth.</p>
              </TooltipContent>
            </TooltipUI>

            <TooltipUI>
              <TooltipTrigger asChild>
                <div className="text-right cursor-help">
                  <div className="flex items-center justify-end gap-1 text-xs text-white/60 mb-1">
                    <span>Score</span>
                    <HelpCircle className="h-3 w-3" />
                  </div>
                  <div 
                    className="text-sm font-bold"
                    style={{
                      color: sustainedGrowthScore !== null && sustainedGrowthScore >= 7 
                        ? 'hsl(142, 70%, 60%)' 
                        : sustainedGrowthScore !== null && sustainedGrowthScore >= 4
                        ? 'hsl(45, 90%, 60%)'
                        : 'hsl(0, 80%, 65%)'
                    }}
                  >
                    {sustainedGrowthScore !== null ? sustainedGrowthScore.toFixed(2) : 'N/A'}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Overall growth quality score (0-10) combining all metrics. Green ≥7 (excellent), Yellow ≥4 (moderate), Red &lt;4 (weak).</p>
              </TooltipContent>
            </TooltipUI>
          </div>
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
