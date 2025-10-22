import { GlassmorphicCard } from "./glassmorphic-card";
import { TrendingUp, TrendingDown, Search, Target, DollarSign, MousePointerClick } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Keyword } from "@shared/schema";

interface MetricsCardsProps {
  keywords: Keyword[];
}

export function MetricsCards({ keywords }: MetricsCardsProps) {
  // Calculate weighted averages based on match percentage (similarityScore)
  const calculateWeightedAverage = (getValue: (k: Keyword) => number) => {
    if (keywords.length === 0) return 0;
    
    const totalWeight = keywords.reduce((sum, k) => {
      const scoreStr = k.similarityScore || "0";
      // Remove % sign if present and convert to 0-1 range
      const weight = parseFloat(scoreStr.replace('%', '')) / 100;
      return sum + weight;
    }, 0);
    
    if (totalWeight === 0) return 0;
    
    const weightedSum = keywords.reduce((sum, k) => {
      const scoreStr = k.similarityScore || "0";
      // Remove % sign if present and convert to 0-1 range
      const weight = parseFloat(scoreStr.replace('%', '')) / 100;
      const value = getValue(k);
      // Add defensive check for NaN
      if (isNaN(weight) || isNaN(value)) return sum;
      return sum + (value * weight);
    }, 0);
    
    return weightedSum / totalWeight;
  };

  const avgVolume = Math.round(calculateWeightedAverage(k => k.volume || 0));
  const avgCompetition = Math.round(calculateWeightedAverage(k => k.competition || 0));
  const avgTopPageBid = calculateWeightedAverage(k => parseFloat(k.topPageBid || "0"));
  const avgCpc = calculateWeightedAverage(k => parseFloat(k.cpc || "0"));
  const avg3mGrowth = calculateWeightedAverage(k => parseFloat(k.growth3m || "0"));
  const avgYoyGrowth = calculateWeightedAverage(k => parseFloat(k.growthYoy || "0"));

  // Calculate max values for purple gradients
  const maxCpc = Math.max(...keywords.map(k => parseFloat(k.cpc || "0")), 1);
  const maxTopPageBid = Math.max(...keywords.map(k => parseFloat(k.topPageBid || "0")), 1);

  const getTrendGradientText = (value: number) => {
    if (value >= 0) {
      const normalizedValue = Math.min(1, value / 200);
      const lightness = 100 - (normalizedValue * 50);
      return { color: `hsl(142, 70%, ${lightness}%)` };
    } else {
      const normalizedValue = Math.min(1, Math.abs(value) / 100);
      const lightness = 100 - (normalizedValue * 50);
      return { color: `hsl(0, 80%, ${lightness}%)` };
    }
  };

  const getRedGradientText = (value: number) => {
    const normalizedValue = Math.min(1, Math.max(0, value / 100));
    const lightness = 100 - (normalizedValue * 40);
    return { color: `hsl(0, 80%, ${lightness}%)` };
  };

  const getPurpleGradientText = (value: number, max: number) => {
    const normalizedValue = Math.min(1, (value / max));
    const lightness = 100 - (normalizedValue * 40);
    return { color: `hsl(250, 80%, ${lightness}%)` };
  };

  const metrics = [
    {
      label: "Volume",
      value: avgVolume.toLocaleString(),
      subtitle: "monthly searches",
      icon: Search,
      style: { color: 'rgb(255, 255, 255)' },
      info: "Weighted average monthly searches across all 10 keywords",
    },
    {
      label: "Competition",
      value: avgCompetition,
      subtitle: "market saturation",
      icon: Target,
      style: getRedGradientText(avgCompetition),
      info: "Weighted average advertiser competition (0-100 scale)",
    },
    {
      label: "Top Page Bid",
      value: `$${avgTopPageBid.toFixed(2)}`,
      subtitle: "advertiser bid",
      icon: DollarSign,
      style: getPurpleGradientText(avgTopPageBid, maxTopPageBid),
      info: "Weighted average bid to appear at top of search results",
    },
    {
      label: "CPC",
      value: `$${avgCpc.toFixed(2)}`,
      subtitle: "cost per click",
      icon: MousePointerClick,
      style: getPurpleGradientText(avgCpc, maxCpc),
      info: "Weighted average cost per click in advertising",
    },
    {
      label: "3M Growth",
      value: `${avg3mGrowth >= 0 ? '+' : ''}${avg3mGrowth.toFixed(1)}%`,
      subtitle: "3-month trend",
      icon: avg3mGrowth >= 0 ? TrendingUp : TrendingDown,
      style: getTrendGradientText(avg3mGrowth),
      info: "Weighted average search volume change over last 3 months",
    },
    {
      label: "YoY Growth",
      value: `${avgYoyGrowth >= 0 ? '+' : ''}${avgYoyGrowth.toFixed(1)}%`,
      subtitle: "year over year",
      icon: avgYoyGrowth >= 0 ? TrendingUp : TrendingDown,
      style: getTrendGradientText(avgYoyGrowth),
      info: "Weighted average search volume change compared to last year",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <Tooltip key={metric.label}>
            <TooltipTrigger asChild>
              <GlassmorphicCard className="p-6 cursor-help">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/60">{metric.label}</span>
                    <Icon className="h-5 w-5 text-white/60" />
                  </div>
                  <div>
                    <div 
                      className="text-3xl font-bold mb-1" 
                      style={metric.style}
                      data-testid={`metric-${metric.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {metric.value}
                    </div>
                    <div className="text-xs text-white/40">{metric.subtitle}</div>
                  </div>
                </div>
              </GlassmorphicCard>
            </TooltipTrigger>
            <TooltipContent>
              <p>{metric.info}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
