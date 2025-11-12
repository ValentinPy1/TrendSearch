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
            // Range: 0 to 50
            // Normalize to 0-1 range
            const normalizedValue = Math.min(1, Math.max(0, value / 50));
            // Lightness ranges from 100% (white) at 0% to 50% (darker green) at 50%
            const lightness = 100 - normalizedValue * 50;
            // Ensure minimum lightness for visibility (at least 60%)
            const finalLightness = Math.max(60, lightness);
            return {
                color: `hsl(142, 70%, ${finalLightness}%)`,
            };
        } else {
            // For negative values, use red gradient
            // Range: 0 to -10
            const normalizedValue = Math.min(1, Math.max(0, Math.abs(value) / 10));
            const lightness = 100 - normalizedValue * 50;
            // Ensure minimum lightness for visibility (at least 60%)
            const finalLightness = Math.max(60, lightness);
            return {
                color: `hsl(0, 80%, ${finalLightness}%)`,
            };
        }
    };

    const getPurpleGradientText = (value: number) => {
        // Range: 3 to 10
        const minCpc = 3;
        const maxCpc = 10;
        // Clamp value to range and normalize
        const clampedValue = Math.max(minCpc, Math.min(maxCpc, value));
        const normalizedValue = (clampedValue - minCpc) / (maxCpc - minCpc);
        const lightness = 100 - normalizedValue * 40;
        return {
            color: `hsl(250, 80%, ${lightness}%)`,
        };
    };

    const getOrangeGradientText = (value: number) => {
        // Range: 20 to 35
        const minOpportunity = 20;
        const maxOpportunity = 32;
        // Clamp value to range and normalize
        const clampedValue = Math.max(minOpportunity, Math.min(maxOpportunity, value));
        const normalizedValue = (clampedValue - minOpportunity) / (maxOpportunity - minOpportunity);

        // Interpolate from white (at 20) to orange (at 35)
        // White: hsl(0, 0%, 100%) -> Orange: hsl(25, 100%, 60%)
        if (normalizedValue === 0) {
            return { color: `hsl(0, 0%, 100%)` }; // Pure white at 20
        }

        // At 20: white (0% saturation, 100% lightness)
        // At 35: orange (25 hue, 100% saturation, 60% lightness)
        const hue = 25;
        const saturation = normalizedValue * 100; // 0% to 100%
        const lightness = 100 - (normalizedValue * 40); // 100% to 60%

        return { color: `hsl(${hue}, ${saturation}%, ${lightness}%)` };
    };

    const getBlueGradientText = (value: number) => {
        // Range: 0 to 6,000,000
        const maxVolume = 6000000;
        const normalizedValue = Math.min(1, Math.max(0, value / maxVolume));
        // Vibrant blue gradient: light blue at 0, more vibrant blue at max
        const lightness = 100 - normalizedValue * 25; // 100% to 75% (slightly darker for vibrancy)
        const saturation = 70 + normalizedValue * 25; // 70% to 95% (high saturation for vibrancy)
        return { color: `hsl(200, ${saturation}%, ${lightness}%)` };
    };

    // For compact display, we'll show 4 key metrics
    // Ensure avgGrowthYoy is a valid number (handle NaN, undefined, null)
    const avgGrowthYoy = typeof metrics.avgGrowthYoy === 'number' && !isNaN(metrics.avgGrowthYoy)
        ? metrics.avgGrowthYoy
        : 0;

    // Format volume to 3 significant digits
    const formatVolume = (volume: number): string => {
        if (volume === 0) return "0 k";
        const significantDigits = 3;
        const magnitude = Math.floor(Math.log10(Math.abs(volume)));
        const factor = Math.pow(10, significantDigits - 1 - magnitude);
        const rounded = Math.round(volume * factor) / factor;
        return rounded.toLocaleString() + " k";
    };

    const displayMetrics = [
        {
            label: "Avg Volume",
            value: formatVolume(metrics.avgVolume),
            icon: BarChart3,
            style: getBlueGradientText(metrics.avgVolume),
        },
        {
            label: "Avg Opportunity",
            value: Math.round(metrics.opportunityScore).toString(),
            icon: Zap,
            style: getOrangeGradientText(metrics.opportunityScore),
        },
        {
            label: "Avg YoY Growth",
            value: `${avgGrowthYoy >= 0 ? "+" : ""}${avgGrowthYoy.toFixed(1)}%`,
            icon: TrendingUp,
            style: getTrendGradientText(avgGrowthYoy),
        },
        {
            label: "Avg CPC",
            value: `$${metrics.avgCpc.toFixed(2)}`,
            icon: DollarSign,
            style: getPurpleGradientText(metrics.avgCpc),
        },
    ];

    if (compact) {
        return (
            <div className="grid grid-cols-2 gap-2">
                {displayMetrics.map((metric) => {
                    const Icon = metric.icon;
                    return (
                        <div key={metric.label} className="flex flex-col items-center justify-center text-center">
                            <div className="flex items-center gap-1 mb-0.5">
                                <Icon className="h-3.5 w-3.5 text-white/40" />
                                <div className="text-xs text-white/40">{metric.label}</div>
                            </div>
                            <div className="text-sm font-semibold" style={metric.style}>
                                {metric.value}
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
                    <div key={metric.label} className="flex flex-col items-center justify-center text-center">
                        <div className="flex items-center gap-1 mb-0.5">
                            <Icon className="h-4 w-4 text-white/50" />
                            <div className="text-xs text-white/50">{metric.label}</div>
                        </div>
                        <div className="text-base font-bold" style={metric.style}>
                            {metric.value}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

