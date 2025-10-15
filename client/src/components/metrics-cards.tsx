import { GlassmorphicCard } from "./glassmorphic-card";
import { TrendingUp, TrendingDown, Search, Target, DollarSign, MousePointerClick } from "lucide-react";
import type { Report } from "@shared/schema";

interface MetricsCardsProps {
  report: Report;
}

export function MetricsCards({ report }: MetricsCardsProps) {
  const metrics = [
    {
      label: "Volume",
      value: report.avgVolume?.toLocaleString() || "0",
      subtitle: "monthly searches",
      icon: Search,
      color: "text-chart-2",
    },
    {
      label: "3M Growth",
      value: report.growth3m ? `${report.growth3m}%` : "0%",
      subtitle: "3-month trend",
      icon: parseFloat(report.growth3m || "0") >= 0 ? TrendingUp : TrendingDown,
      color: parseFloat(report.growth3m || "0") >= 0 ? "text-chart-4" : "text-destructive",
    },
    {
      label: "YoY Growth",
      value: report.growthYoy ? `${report.growthYoy}%` : "0%",
      subtitle: "year over year",
      icon: parseFloat(report.growthYoy || "0") >= 0 ? TrendingUp : TrendingDown,
      color: parseFloat(report.growthYoy || "0") >= 0 ? "text-chart-4" : "text-destructive",
    },
    {
      label: "Competition",
      value: report.competition || "Unknown",
      subtitle: "market saturation",
      icon: Target,
      color:
        report.competition === "low"
          ? "text-chart-4"
          : report.competition === "medium"
          ? "text-chart-5"
          : "text-destructive",
    },
    {
      label: "Avg Top Page Bid",
      value: report.avgTopPageBid ? `$${report.avgTopPageBid}` : "$0.00",
      subtitle: "advertiser bid",
      icon: DollarSign,
      color: "text-chart-1",
    },
    {
      label: "CPC",
      value: report.avgCpc ? `$${report.avgCpc}` : "$0.00",
      subtitle: "cost per click",
      icon: MousePointerClick,
      color: "text-chart-3",
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
