import { TrendingUp, Zap, BarChart3, DollarSign } from "lucide-react";
import type { AggregatedMetrics } from "@/hooks/use-sector-data";

interface SectorMetricsMiniProps {
    metrics: AggregatedMetrics;
    compact?: boolean;
}

export function SectorMetricsMini({ metrics, compact = false }: SectorMetricsMiniProps) {
    const getTrendGradientText = (value: number) => {
        if (value >= 0) {
            // For positive values, use green gradient
            // Normalize to 0-1 range (cap at 200% growth)
            const normalizedValue = Math.min(1, Math.max(0, value / 200));
            // Lightness ranges from 100% (white) at 0% to 50% (darker green) at 200%
            const lightness = 100 - normalizedValue * 50;
            // Ensure minimum lightness for visibility (at least 60%)
            const finalLightness = Math.max(60, lightness);
            return {
                color: `hsl(142, 70%, ${finalLightness}%)`,
            };
        } else {
            // For negative values, use red gradient
            const normalizedValue = Math.min(1, Math.max(0, Math.abs(value) / 100));
            const lightness = 100 - normalizedValue * 50;
            // Ensure minimum lightness for visibility (at least 60%)
            const finalLightness = Math.max(60, lightness);
            return {
                color: `hsl(0, 80%, ${finalLightness}%)`,
            };
        }
    };

    const getPurpleGradientText = (value: number, max: number) => {
        const normalizedValue = Math.min(1, value / max);
        const lightness = 100 - normalizedValue * 40;
        return {
            color: `hsl(250, 80%, ${lightness}%)`,
        };
    };

    const getOrangeGradientText = (value: number, max: number = 100) => {
        const normalizedValue = Math.min(1, Math.max(0, value / max));

        // Interpolate from white (at 0) to orange (at 100)
        // White: hsl(0, 0%, 100%) -> Orange: hsl(25, 100%, 60%)
        if (normalizedValue === 0) {
            return { color: `hsl(0, 0%, 100%)` }; // Pure white at 0
        }

        // At 0: white (0% saturation, 100% lightness)
        // At 100: orange (25 hue, 100% saturation, 60% lightness)
        const hue = 25;
        const saturation = normalizedValue * 100; // 0% to 100%
        const lightness = 100 - (normalizedValue * 40); // 100% to 60%

        return { color: `hsl(${hue}, ${saturation}%, ${lightness}%)` };
    };

    const getWhiteGradientText = (value: number, max: number) => {
        const normalizedValue = Math.min(1, value / max);
        const lightness = 100 - normalizedValue * 40;
        return { color: `hsl(0, 0%, ${lightness}%)` };
    };

    // For compact display, we'll show 4 key metrics
    // Ensure avgGrowthYoy is a valid number (handle NaN, undefined, null)
    const avgGrowthYoy = typeof metrics.avgGrowthYoy === 'number' && !isNaN(metrics.avgGrowthYoy) 
        ? metrics.avgGrowthYoy 
        : 0;
    
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
            style: getOrangeGradientText(metrics.opportunityScore, 40),
        },
        {
            label: "YoY Growth",
            value: `${avgGrowthYoy >= 0 ? "+" : ""}${avgGrowthYoy.toFixed(1)}%`,
            icon: TrendingUp,
            style: getTrendGradientText(avgGrowthYoy),
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

