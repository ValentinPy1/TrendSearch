import { GlassmorphicCard } from "./glassmorphic-card";
import { TrendingUp, BarChart3, Users, DollarSign, Zap } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Keyword } from "@shared/schema";

interface KeywordMetricsCardsProps {
    keyword: Keyword;
    allKeywords: Keyword[];
}

export function KeywordMetricsCards({ keyword, allKeywords }: KeywordMetricsCardsProps) {
    const opportunityScore = parseFloat(keyword.opportunityScore || "0");
    const growthYoy = parseFloat(keyword.growthYoy || "0");
    const volume = keyword.volume || 0;
    const competition = keyword.competition || 0;
    const cpc = parseFloat(keyword.cpc || "0");

    // Calculate max values for gradients
    const maxVolume = Math.max(...allKeywords.map(k => k.volume || 0));
    const maxCpc = Math.max(...allKeywords.map(k => parseFloat(k.cpc || "0")));
    const maxOpportunityScore = Math.max(...allKeywords.map(k => parseFloat(k.opportunityScore || "0")));

    const getTrendGradientText = (value: number) => {
        // White at 0%, full green at +200%, full red at -100%
        if (value >= 0) {
            // Positive: white to green (0% to +200%)
            const normalizedValue = Math.min(1, value / 200);
            const lightness = 100 - normalizedValue * 50; // 100% (white) to 50% (green)
            return {
                color: `hsl(142, 70%, ${lightness}%)`,
            };
        } else {
            // Negative: white to red (0% to -100%)
            const normalizedValue = Math.min(1, Math.abs(value) / 100);
            const lightness = 100 - normalizedValue * 50; // 100% (white) to 50% (red)
            return {
                color: `hsl(0, 80%, ${lightness}%)`,
            };
        }
    };

    const getWhiteGradientText = (value: number, max: number) => {
        const normalizedValue = Math.min(1, (value / max));
        const lightness = 100 - (normalizedValue * 40);
        return { color: `hsl(0, 0%, ${lightness}%)` };
    };

    const getRedGradientText = (value: number) => {
        // 0-100 range to white-to-red gradient
        const normalizedValue = Math.min(1, Math.max(0, value / 100));
        const lightness = 100 - normalizedValue * 40; // 100% (white) to 60% (red)
        return {
            color: `hsl(0, 80%, ${lightness}%)`,
        };
    };

    const getPurpleGradientText = (value: number, max: number) => {
        const normalizedValue = Math.min(1, (value / max));
        const lightness = 100 - (normalizedValue * 40);
        return { color: `hsl(250, 80%, ${lightness}%)` };
    };

    const getOrangeGradientText = (value: number, max: number) => {
        const normalizedValue = Math.min(1, (value / max));
        const lightness = 100 - (normalizedValue * 40);
        return { color: `hsl(142, 80%, ${lightness}%)` };
    };

    const formatTwoSignificantDigits = (value: number): string => {
        if (value === 0 || isNaN(value) || !isFinite(value)) {
            return "0";
        }

        // Round to 2 significant digits
        const order = Math.floor(Math.log10(Math.abs(value)));
        const rounded = Math.round(value / Math.pow(10, order - 1)) * Math.pow(10, order - 1);

        // Format with millions (M) if >= 1,000,000
        if (rounded >= 1000000) {
            const inMillions = rounded / 1000000;
            // Round to 2 significant digits for the millions value
            const millionsOrder = Math.floor(Math.log10(Math.abs(inMillions)));
            const roundedMillions = Math.round(inMillions / Math.pow(10, millionsOrder - 1)) * Math.pow(10, millionsOrder - 1);
            return `${roundedMillions.toLocaleString('en-US', { maximumFractionDigits: 1 })}M`;
        }

        // Format with thousands (k) if >= 1,000
        if (rounded >= 1000) {
            const inThousands = rounded / 1000;
            // Round to 2 significant digits for the thousands value
            const thousandsOrder = Math.floor(Math.log10(Math.abs(inThousands)));
            const roundedThousands = Math.round(inThousands / Math.pow(10, thousandsOrder - 1)) * Math.pow(10, thousandsOrder - 1);
            return `${roundedThousands.toLocaleString('en-US', { maximumFractionDigits: 1 })}k`;
        }

        // Format with thousands separators for smaller values
        if (rounded >= 1) {
            return Math.round(rounded).toLocaleString('en-US');
        } else {
            // For small values, show up to 2 decimal places if needed
            return rounded.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        }
    };

    const metrics = [
        {
            label: "Opportunity",
            value: Math.round(opportunityScore).toString(),
            subtitle: "opportunity score",
            icon: Zap,
            style: getOrangeGradientText(opportunityScore, maxOpportunityScore),
            info: "Comprehensive opportunity score combining multiple factors (higher = better opportunity)",
        },
        {
            label: "YoY Growth",
            value: `${growthYoy >= 0 ? "+" : ""}${Math.round(growthYoy)}%`,
            subtitle: "annual trend",
            icon: TrendingUp,
            style: getTrendGradientText(growthYoy),
            info: "Year-over-year search volume growth - shows long-term trend momentum",
        },
        {
            label: "Volume",
            value: formatTwoSignificantDigits(volume),
            subtitle: "monthly searches",
            icon: BarChart3,
            style: getWhiteGradientText(volume, maxVolume),
            info: "Average monthly search volume - indicates market size and demand",
        },
        {
            label: "CPC",
            value: `$${cpc.toFixed(2)}`,
            subtitle: "avg click cost",
            icon: DollarSign,
            style: getPurpleGradientText(cpc, maxCpc),
            info: "Average cost per click - what advertisers typically pay for each click",
        },
        {
            label: "Competition",
            value: competition.toString(),
            subtitle: "advertiser density",
            icon: Users,
            style: getRedGradientText(competition),
            info: "Advertiser competition level (0-100) - higher values mean more advertisers bidding",
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
