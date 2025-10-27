import { GlassmorphicCard } from "./glassmorphic-card";
import { Trophy, TrendingUp, Zap, DollarSign, Coins } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Keyword } from "@shared/schema";

interface KeywordMetricsCardsProps {
  keyword: Keyword;
  allKeywords: Keyword[];
}

export function KeywordMetricsCards({ keyword, allKeywords }: KeywordMetricsCardsProps) {
  const opportunityScore = parseFloat(keyword.opportunityScore || "0");
  const trendStrength = parseFloat(keyword.trendStrength || "0");
  const bidEfficiency = parseFloat(keyword.bidEfficiency || "0");
  const tac = parseFloat(keyword.tac || "0");
  const topPageBid = parseFloat(keyword.topPageBid || "0");

  // Calculate max values for gradients
  const maxTrendStrength = Math.max(...allKeywords.map(k => parseFloat(k.trendStrength || "0")));
  const maxBidEfficiency = Math.max(...allKeywords.map(k => parseFloat(k.bidEfficiency || "0")));
  const maxTAC = Math.max(...allKeywords.map(k => parseFloat(k.tac || "0")));
  const maxTopPageBid = Math.max(...allKeywords.map(k => parseFloat(k.topPageBid || "0")));

  const getOpportunityGradientText = (score: number) => {
    // 0-100 range: low (red) to medium (yellow) to high (green)
    // Matches the gradient used in the keywords table
    if (score < 50) {
      // 0-50: red to yellow
      const normalizedValue = score / 50;
      const hue = normalizedValue * 60; // 0 (red) to 60 (yellow)
      const lightness = 60 - normalizedValue * 10; // 60% to 50%
      return {
        color: `hsl(${hue}, 80%, ${lightness}%)`,
      };
    } else {
      // 50-100: yellow to green
      const normalizedValue = (score - 50) / 50;
      const hue = 60 + normalizedValue * 82; // 60 (yellow) to 142 (green)
      const lightness = 60 - normalizedValue * 10; // 60% to 50%
      return {
        color: `hsl(${hue}, 80%, ${lightness}%)`,
      };
    }
  };

  const getGreenGradientText = (value: number, max: number) => {
    const normalizedValue = Math.min(1, (value / max));
    const lightness = 100 - (normalizedValue * 40);
    return { color: `hsl(142, 70%, ${lightness}%)` };
  };

  const getBlueGradientText = (value: number, max: number) => {
    const normalizedValue = Math.min(1, (value / max));
    const lightness = 100 - (normalizedValue * 40);
    return { color: `hsl(210, 70%, ${lightness}%)` };
  };

  const getPurpleGradientText = (value: number, max: number) => {
    const normalizedValue = Math.min(1, (value / max));
    const lightness = 100 - (normalizedValue * 40);
    return { color: `hsl(250, 80%, ${lightness}%)` };
  };

  const metrics = [
    {
      label: "Opportunity",
      value: opportunityScore.toFixed(1),
      subtitle: "comprehensive score",
      icon: Trophy,
      style: getOpportunityGradientText(opportunityScore),
      info: "log(SAC) × Trend Strength × Bid Efficiency - comprehensive opportunity metric combining market size, growth momentum, and advertising efficiency",
    },
    {
      label: "Trend Strength",
      value: trendStrength.toFixed(2),
      subtitle: "growth momentum",
      icon: TrendingUp,
      style: getGreenGradientText(trendStrength, maxTrendStrength),
      info: "Growth / (1 + Volatility) - normalizes growth by volatility to prevent explosion at low volatility. Higher values = strong stable growth",
    },
    {
      label: "Top Page Bid",
      value: `$${topPageBid.toFixed(2)}`,
      subtitle: "top placement cost",
      icon: DollarSign,
      style: getPurpleGradientText(topPageBid, maxTopPageBid),
      info: "Estimated bid to appear at top of search results - higher bids indicate more competitive keywords",
    },
    {
      label: "Bid Efficiency",
      value: bidEfficiency.toFixed(2),
      subtitle: "advertiser margin",
      icon: Zap,
      style: getBlueGradientText(bidEfficiency, maxBidEfficiency),
      info: "Top Page Bid / CPC - ratio showing the premium advertisers pay for top placement versus average click costs",
    },
    {
      label: "TAC",
      value: `$${tac.toLocaleString()}`,
      subtitle: "total ad cost",
      icon: Coins,
      style: getPurpleGradientText(tac, maxTAC),
      info: "Total Advertiser Cost = Volume × CPC - estimated monthly ad spend across all advertisers",
    },
  ];

  return (
    <div className="flex flex-col justify-between h-full gap-3">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <Tooltip key={metric.label}>
            <TooltipTrigger asChild>
              <GlassmorphicCard className="p-2.5 cursor-help flex-1 flex flex-col justify-center">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/60">{metric.label}</span>
                    <Icon className="h-4 w-4 text-white/60" />
                  </div>
                  <div>
                    <div 
                      className="text-2xl font-bold" 
                      style={metric.style}
                      data-testid={`keyword-metric-${metric.label.toLowerCase().replace(/\s+/g, '-')}`}
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
