import { GlassmorphicCard } from "./glassmorphic-card";
import { TrendingUp, TrendingDown, Search, Target, DollarSign, MousePointerClick, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Keyword } from "@shared/schema";

interface KeywordMetricsCardsProps {
  keyword: Keyword;
  allKeywords: Keyword[];
}

export function KeywordMetricsCards({ keyword, allKeywords }: KeywordMetricsCardsProps) {
  const growth3m = parseFloat(keyword.growth3m || "0");
  const growthYoy = parseFloat(keyword.growthYoy || "0");
  const competition = keyword.competition || 0;
  const cpc = parseFloat(keyword.cpc || "0");
  const topPageBid = parseFloat(keyword.topPageBid || "0");

  // Calculate max values for purple gradients
  const maxCpc = Math.max(...allKeywords.map(k => parseFloat(k.cpc || "0")));
  const maxTopPageBid = Math.max(...allKeywords.map(k => parseFloat(k.topPageBid || "0")));

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
      value: keyword.volume?.toLocaleString() || "0",
      subtitle: "monthly searches",
      icon: Search,
      style: { color: 'rgb(255, 255, 255)' },
      info: "Average monthly searches for this keyword",
    },
    {
      label: "3M Growth",
      value: `${growth3m >= 0 ? '+' : ''}${growth3m.toFixed(1)}%`,
      subtitle: "3-month trend",
      icon: growth3m >= 0 ? TrendingUp : TrendingDown,
      style: getTrendGradientText(growth3m),
      info: "Search volume change over last 3 months",
    },
    {
      label: "YoY Growth",
      value: `${growthYoy >= 0 ? '+' : ''}${growthYoy.toFixed(1)}%`,
      subtitle: "year over year",
      icon: growthYoy >= 0 ? TrendingUp : TrendingDown,
      style: getTrendGradientText(growthYoy),
      info: "Search volume change compared to last year",
    },
    {
      label: "Competition",
      value: competition,
      subtitle: "market saturation",
      icon: Target,
      style: getRedGradientText(competition),
      info: "Level of advertiser competition (0-100 scale)",
    },
    {
      label: "Top Page Bid",
      value: `$${topPageBid.toFixed(2)}`,
      subtitle: "advertiser bid",
      icon: DollarSign,
      style: getPurpleGradientText(topPageBid, maxTopPageBid),
      info: "Estimated bid to appear at top of search results",
    },
    {
      label: "CPC",
      value: `$${cpc.toFixed(2)}`,
      subtitle: "cost per click",
      icon: MousePointerClick,
      style: getPurpleGradientText(cpc, maxCpc),
      info: "Average cost per click in advertising",
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
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-white/40 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{metric.info}</p>
                      </TooltipContent>
                    </Tooltip>
                    <Icon className="h-5 w-5 text-white/60" />
                  </div>
                </div>
                <div>
                  <div 
                    className="text-3xl font-bold mb-1" 
                    style={metric.style}
                    data-testid={`keyword-metric-${metric.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
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
