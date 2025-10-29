import { TrendingUp, Zap, BarChart3, DollarSign } from "lucide-react";
import type { AggregatedMetrics } from "@/hooks/use-sector-data";

interface SectorMetricsMiniProps {
    metrics: AggregatedMetrics;
    compact?: boolean;
}

export function SectorMetricsMini({ metrics, compact = false }: SectorMetricsMiniProps) {
    const getTrendGradientText = (value: number) => {
        if (value >= 0) {
            const normalizedValue = Math.min(1, value / 200);
            const lightness = 100 - normalizedValue * 50;
            return {
                color: `hsl(142, 70%, ${lightness}%)`,
            };
        } else {
            const normalizedValue = Math.min(1, Math.abs(value) / 100);
            const lightness = 100 - normalizedValue * 50;
            return {
                color: `hsl(0, 80%, ${lightness}%)`,
            };
        }
    };

    const getPurpleGradientText = (value: number, max: number) => {
        const normalizedValue = Math.min(1, value / max);
        const lightness = 100 - normalizedValue * 40;
        return {
            color: `hsl(270, 70%, ${lightness}%)`,
        };
    };

    const getWhiteGradientText = (value: number, max: number) => {
        const normalizedValue = Math.min(1, value / max);
        const lightness = 100 - normalizedValue * 40;
        return { color: `hsl(0, 0%, ${lightness}%)` };
    };

    // For compact display, we'll show 4 key metrics
    const displayMetrics = [
        {
            label: "Volume",
            value: metrics.avgVolume.toLocaleString(),
            icon: BarChart3,
            style: getWhiteGradientText(metrics.avgVolume, Math.max(metrics.avgVolume, 100000)),
        },
        {
            label: "Opportunity",
            value: metrics.opportunityScore.toFixed(1),
            icon: Zap,
            style: getPurpleGradientText(metrics.opportunityScore, Math.max(metrics.opportunityScore, 100)),
        },
        {
            label: "YoY Growth",
            value: `${metrics.avgGrowthYoy >= 0 ? "+" : ""}${metrics.avgGrowthYoy.toFixed(1)}%`,
            icon: TrendingUp,
            style: getTrendGradientText(metrics.avgGrowthYoy),
        },
        {
            label: "Avg CPC",
            value: `$${metrics.avgCpc.toFixed(2)}`,
            icon: DollarSign,
            style: getPurpleGradientText(metrics.avgCpc, Math.max(metrics.avgCpc, 10)),
        },
    ];

    if (compact) {
        return (
            <div className="grid grid-cols-2 gap-2">
                {displayMetrics.map((metric) => {
                    const Icon = metric.icon;
                    return (
                        <div key={metric.label} className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5 text-white/40 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <div className="text-xs text-white/40 truncate">{metric.label}</div>
                                <div className="text-sm font-semibold truncate" style={metric.style}>
                                    {metric.value}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
    );
    }

    return (
        <div className="grid grid-cols-2 gap-3">
            {displayMetrics.map((metric) => {
                const Icon = metric.icon;
                return (
                    <div key={metric.label} className="flex items-start gap-2">
                        <Icon className="h-4 w-4 text-white/50 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <div className="text-xs text-white/50 mb-0.5">{metric.label}</div>
                            <div className="text-base font-bold truncate" style={metric.style}>
                                {metric.value}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

