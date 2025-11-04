import { GlassmorphicCard } from "./glassmorphic-card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Keyword } from "@shared/schema";
import {
  calculateAverageTrendData,
  calculateGrowthFromTrend,
} from "@/lib/trend-calculations";
import { HelpCircle } from "lucide-react";
import { usePaymentStatus } from "@/hooks/use-payment-status";

interface AverageTrendChartProps {
  keywords: Keyword[];
}

export function AverageTrendChart({ keywords }: AverageTrendChartProps) {
  const { data: paymentStatus } = usePaymentStatus();
  const hasPaid = paymentStatus?.hasPaid ?? false;

  if (!keywords || keywords.length === 0) {
    return null;
  }

  const averageTrendData = calculateAverageTrendData(keywords);

  if (averageTrendData.length === 0) {
    return null;
  }

  // Filter monthly data based on premium status
  // Premium: show all 48 months (4 years)
  // Non-premium: show only last 12 months
  const displayData = hasPaid 
    ? averageTrendData 
    : averageTrendData.slice(-12);

  const timeRangeText = hasPaid ? "4-year" : "12-month";

  return (
    <GlassmorphicCard className="p-8">
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-semibold text-white mb-2">
            Average Search Volume Trend (from keywords above)
          </h3>
          <p className="text-sm text-white/60">
            Weighted average across all keywords ({timeRangeText})
          </p>
        </div>

        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={displayData}>
              <defs>
                <linearGradient
                  id="colorAverageVolume"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="hsl(210, 70%, 55%)"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="hsl(210, 70%, 55%)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.1)"
              />
              <XAxis
                dataKey="month"
                stroke="rgba(255,255,255,0.6)"
                interval={hasPaid ? undefined : 0}
                tick={(props) => {
                  const { x, y, payload } = props;
                  if (hasPaid) {
                    // For 4-year chart, only show year labels at the start of each year (January)
                    const value = payload.value;
                    const yearMatch = value?.match(/\d{4}$/);
                    if (yearMatch) {
                      const year = yearMatch[0];
                      const monthStr = value?.split(' ')[0];
                      if (monthStr === 'Jan') {
                        return (
                          <text
                            x={x}
                            y={y}
                            dy={16}
                            textAnchor="middle"
                            fill="rgba(255,255,255,0.6)"
                            fontSize={12}
                          >
                            {year}
                          </text>
                        );
                      }
                      return null;
                    }
                    return null;
                  }
                  // For 12-month chart, show all labels as before
                  return (
                    <text
                      x={x}
                      y={y}
                      dy={16}
                      textAnchor="middle"
                      fill="rgba(255,255,255,0.6)"
                      fontSize={12}
                    >
                      {payload.value}
                    </text>
                  );
                }}
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
