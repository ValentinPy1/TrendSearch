import { GlassmorphicCard } from "./glassmorphic-card";
import { TrendingUp, TrendingDown, Search, Target, DollarSign, MousePointerClick } from "lucide-react";
import type { Keyword } from "@shared/schema";

interface MetricsCardsProps {
  keywords: Keyword[];
}

export function MetricsCards({ keywords }: MetricsCardsProps) {
  // Calculate weighted averages based on match percentage (similarityScore)
  const calculateWeightedAverage = (getValue: (k: Keyword) => number) => {
    if (keywords.length === 0) return 0;
    
    const totalWeight = keywords.reduce((sum, k) => {
      const weight = parseFloat(k.similarityScore || "0");
      return sum + weight;
    }, 0);
    
    if (totalWeight === 0) return 0;
    
    const weightedSum = keywords.reduce((sum, k) => {
      const weight = parseFloat(k.similarityScore || "0");
      const value = getValue(k);
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

  const getCompetitionLabel = (comp: number) => {
    if (comp < 33) return "low";
    if (comp < 67) return "medium";
    return "high";
  };

  const competitionLabel = getCompetitionLabel(avgCompetition);

  const metrics = [
    {
      label: "Volume",
      value: avgVolume.toLocaleString(),
      subtitle: "monthly searches",
      icon: Search,
      color: "text-chart-2",
    },
    {
      label: "Competition",
      value: competitionLabel,
      subtitle: "market saturation",
      icon: Target,
      color:
        competitionLabel === "low"
          ? "text-chart-4"
          : competitionLabel === "medium"
          ? "text-chart-5"
          : "text-destructive",
    },
    {
      label: "Avg Top Page Bid",
      value: `$${avgTopPageBid.toFixed(2)}`,
      subtitle: "advertiser bid",
      icon: DollarSign,
      color: "text-chart-1",
    },
    {
      label: "CPC",
      value: `$${avgCpc.toFixed(2)}`,
      subtitle: "cost per click",
      icon: MousePointerClick,
      color: "text-chart-3",
    },
    {
      label: "3M Growth",
      value: `${avg3mGrowth >= 0 ? '+' : ''}${avg3mGrowth.toFixed(1)}%`,
      subtitle: "3-month trend",
      icon: avg3mGrowth >= 0 ? TrendingUp : TrendingDown,
      color: avg3mGrowth >= 0 ? "text-chart-4" : "text-destructive",
    },
    {
      label: "YoY Growth",
      value: `${avgYoyGrowth >= 0 ? '+' : ''}${avgYoyGrowth.toFixed(1)}%`,
      subtitle: "year over year",
      icon: avgYoyGrowth >= 0 ? TrendingUp : TrendingDown,
      color: avgYoyGrowth >= 0 ? "text-chart-4" : "text-destructive",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <GlassmorphicCard key={metric.label} className="p-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">{metric.label}</span>
                <Icon className={`h-5 w-5 ${metric.color}`} />
              </div>
              <div>
                <div className="text-3xl font-bold text-white mb-1" data-testid={`metric-${metric.label.toLowerCase().replace(/\s+/g, '-')}`}>
                  {metric.value}
                </div>
                <div className="text-xs text-white/40">{metric.subtitle}</div>
              </div>
            </div>
          </GlassmorphicCard>
        );
      })}
    </div>
  );
}
