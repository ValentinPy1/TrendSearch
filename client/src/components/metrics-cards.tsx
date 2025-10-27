import { GlassmorphicCard } from "./glassmorphic-card";
import { Trophy, TrendingUp, Zap, DollarSign, Coins } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Keyword } from "@shared/schema";

interface MetricsCardsProps {
  keywords: Keyword[];
}

export function MetricsCards({ keywords }: MetricsCardsProps) {
  // Calculate weighted averages using: weight = (match%)² × √(volume)
  const calculateWeightedAverage = (getValue: (k: Keyword) => number) => {
    if (keywords.length === 0) return 0;
    
    const totalWeight = keywords.reduce((sum, k) => {
      const scoreStr = k.similarityScore || "0";
      const matchPct = parseFloat(scoreStr.replace('%', '')) / 100; // 0-1 range
      const volume = k.volume || 0;
      // weight = (match%)² × √(volume)
      const weight = (matchPct * matchPct) * Math.sqrt(volume);
      return sum + weight;
    }, 0);
    
    if (totalWeight === 0) return 0;
    
    const weightedSum = keywords.reduce((sum, k) => {
      const scoreStr = k.similarityScore || "0";
      const matchPct = parseFloat(scoreStr.replace('%', '')) / 100;
      const volume = k.volume || 0;
      const weight = (matchPct * matchPct) * Math.sqrt(volume);
      const value = getValue(k);
      // Add defensive check for NaN
      if (isNaN(weight) || isNaN(value)) return sum;
      return sum + (value * weight);
    }, 0);
    
    return weightedSum / totalWeight;
  };

  // Special calculation for volume: average the square roots, then square back
  // Using weight = (match%)² only (no volume in weight)
  const calculateVolumeAverage = () => {
    if (keywords.length === 0) return 0;
    
    const totalWeight = keywords.reduce((sum, k) => {
      const scoreStr = k.similarityScore || "0";
      const matchPct = parseFloat(scoreStr.replace('%', '')) / 100;
      // weight = (match%)² only
      const weight = matchPct * matchPct;
      return sum + weight;
    }, 0);
    
    if (totalWeight === 0) return 0;
    
    const weightedSumOfSqrts = keywords.reduce((sum, k) => {
      const scoreStr = k.similarityScore || "0";
      const matchPct = parseFloat(scoreStr.replace('%', '')) / 100;
      const volume = k.volume || 0;
      const weight = matchPct * matchPct;
      if (isNaN(weight) || isNaN(volume) || volume < 0) return sum;
      return sum + (Math.sqrt(volume) * weight);
    }, 0);
    
    const avgSqrt = weightedSumOfSqrts / totalWeight;
    return avgSqrt * avgSqrt; // Square the result
  };

  const avgOpportunityScore = calculateWeightedAverage(k => parseFloat(k.opportunityScore || "0"));
  const avgTrendStrength = calculateWeightedAverage(k => parseFloat(k.trendStrength || "0"));
  const avgBidEfficiency = calculateWeightedAverage(k => parseFloat(k.bidEfficiency || "0"));
  const avgTAC = calculateWeightedAverage(k => parseFloat(k.tac || "0"));
  const avgSAC = calculateWeightedAverage(k => parseFloat(k.sac || "0"));

  // Calculate max values for gradients
  const maxOpportunityScore = Math.max(...keywords.map(k => parseFloat(k.opportunityScore || "0")), 1);
  const maxTrendStrength = Math.max(...keywords.map(k => parseFloat(k.trendStrength || "0")), 1);
  const maxBidEfficiency = Math.max(...keywords.map(k => parseFloat(k.bidEfficiency || "0")), 1);
  const maxTAC = Math.max(...keywords.map(k => parseFloat(k.tac || "0")), 1);
  const maxSAC = Math.max(...keywords.map(k => parseFloat(k.sac || "0")), 1);

  const getOpportunityGradientText = (value: number, max: number) => {
    const normalizedValue = Math.min(1, (value / max));
    const hue = 142 * normalizedValue; // 0 (red) to 142 (green)
    const saturation = 70;
    const lightness = 100 - (normalizedValue * 40);
    return { color: `hsl(${hue}, ${saturation}%, ${lightness}%)` };
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
      label: "Avg Opportunity",
      value: avgOpportunityScore.toFixed(1),
      subtitle: "comprehensive score",
      icon: Trophy,
      style: getOpportunityGradientText(avgOpportunityScore, maxOpportunityScore),
      info: "Weighted average opportunity score - log(SAC) × Trend Strength × Bid Efficiency across all keywords",
    },
    {
      label: "Avg Trend Strength",
      value: avgTrendStrength.toFixed(2),
      subtitle: "growth momentum",
      icon: TrendingUp,
      style: getGreenGradientText(avgTrendStrength, maxTrendStrength),
      info: "Weighted average trend strength - (1 + YoY Growth/100) / (1 + Volatility) showing consistent growth patterns",
    },
    {
      label: "Avg Bid Efficiency",
      value: avgBidEfficiency.toFixed(2),
      subtitle: "advertiser margin",
      icon: Zap,
      style: getBlueGradientText(avgBidEfficiency, maxBidEfficiency),
      info: "Weighted average bid efficiency - Top Page Bid / CPC showing advertiser premium for top placement",
    },
    {
      label: "Avg TAC",
      value: `$${Math.round(avgTAC).toLocaleString()}`,
      subtitle: "total ad cost",
      icon: DollarSign,
      style: getPurpleGradientText(avgTAC, maxTAC),
      info: "Weighted average Total Advertiser Cost - Volume × CPC estimated monthly ad spend",
    },
    {
      label: "Avg SAC",
      value: `$${Math.round(avgSAC).toLocaleString()}`,
      subtitle: "seller ad cost",
      icon: Coins,
      style: getPurpleGradientText(avgSAC, maxSAC),
      info: "Weighted average Seller Advertiser Cost - TAC × (1 - Competition/100) effective market size",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
