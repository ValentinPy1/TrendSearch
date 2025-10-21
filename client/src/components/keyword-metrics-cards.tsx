import { GlassmorphicCard } from "./glassmorphic-card";
import { TrendingUp, TrendingDown, Search, Target, DollarSign, MousePointerClick } from "lucide-react";
import type { Keyword } from "@shared/schema";

interface KeywordMetricsCardsProps {
  keyword: Keyword;
}

export function KeywordMetricsCards({ keyword }: KeywordMetricsCardsProps) {
  const growth3m = parseFloat(keyword.growth3m || "0");
  const growthYoy = parseFloat(keyword.growthYoy || "0");

  const metrics = [
    {
      label: "Volume",
      value: keyword.volume?.toLocaleString() || "0",
      subtitle: "monthly searches",
      icon: Search,
      color: "text-chart-2",
    },
    {
      label: "3M Growth",
      value: `${growth3m >= 0 ? '+' : ''}${growth3m.toFixed(1)}%`,
      subtitle: "3-month trend",
      icon: growth3m >= 0 ? TrendingUp : TrendingDown,
      color: growth3m >= 0 ? "text-chart-4" : "text-destructive",
    },
    {
      label: "YoY Growth",
      value: `${growthYoy >= 0 ? '+' : ''}${growthYoy.toFixed(1)}%`,
      subtitle: "year over year",
      icon: growthYoy >= 0 ? TrendingUp : TrendingDown,
      color: growthYoy >= 0 ? "text-chart-4" : "text-destructive",
    },
    {
      label: "Competition",
      value: keyword.competition || "Unknown",
      subtitle: "market saturation",
      icon: Target,
      color:
        keyword.competition === "low"
          ? "text-chart-4"
          : keyword.competition === "medium"
          ? "text-chart-5"
          : "text-destructive",
    },
    {
      label: "Top Page Bid",
      value: keyword.topPageBid ? `$${keyword.topPageBid}` : "$0.00",
      subtitle: "advertiser bid",
      icon: DollarSign,
      color: "text-chart-1",
    },
    {
      label: "CPC",
      value: keyword.cpc ? `$${keyword.cpc}` : "$0.00",
      subtitle: "cost per click",
      icon: MousePointerClick,
      color: "text-chart-3",
    },
  ];

  return (
    <div>
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
                  <div className="text-3xl font-bold text-white mb-1" data-testid={`keyword-metric-${metric.label.toLowerCase().replace(/\s+/g, '-')}`}>
                    {metric.value}
                  </div>
                  <div className="text-xs text-white/40">{metric.subtitle}</div>
                </div>
              </div>
            </GlassmorphicCard>
          );
        })}
      </div>
    </div>
  );
}
