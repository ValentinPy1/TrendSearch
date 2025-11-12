import { GlassmorphicCard } from "./glassmorphic-card";
import { SectorMetricsMini } from "./sector-metrics-mini";
import { Building2, Users, Package, ChevronRight, ExternalLink, LucideIcon } from "lucide-react";
import type { AggregatedMetrics } from "@/hooks/use-sector-data";
import { Button } from "./ui/button";

// Convert batch string from "Winter 2025" format to "Q1 2025" format
function formatBatchToQuarter(batch: string | undefined): string {
    if (!batch || batch.trim() === '') return '';
    
    const parts = batch.trim().split(' ');
    if (parts.length < 2) return batch;
    
    const season = parts[0].toLowerCase();
    const year = parts.slice(1).join(' '); // Handle multi-word years if any
    
    let quarter = '';
    if (season === 'winter') quarter = 'Q1';
    else if (season === 'spring') quarter = 'Q2';
    else if (season === 'summer') quarter = 'Q3';
    else if (season === 'fall' || season === 'autumn') quarter = 'Q4';
    else return batch; // Return original if season not recognized
    
    return `${quarter} ${year}`;
}

interface SectorCardProps {
    name: string;
    metrics: AggregatedMetrics;
    type: "sector" | "user_type" | "product_fit";
    onClick?: () => void;
    compact?: boolean;
    userTypeCount?: number;
    productFitCount?: number;
    description?: string;
    url?: string;
    icon?: LucideIcon;
    batch?: string;
    medianBatch?: string;
}

export function SectorCard({
    name,
    metrics,
    type,
    onClick,
    compact = false,
    userTypeCount,
    productFitCount,
    description,
    url,
    icon: customIcon,
    batch,
    medianBatch,
}: SectorCardProps) {
    const getIcon = () => {
        if (customIcon) {
            return customIcon;
        }
        switch (type) {
            case "sector":
                return Building2;
            case "user_type":
                return Users;
            case "product_fit":
                return Package;
        }
    };

    const Icon = getIcon();

    const handleLinkClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <GlassmorphicCard
            className={`p-4 ${onClick ? 'cursor-pointer transition-all duration-200 hover:bg-white/10 hover:scale-[1.02]' : ''} ${compact ? "" : "hover:shadow-lg"
                }`}
            onClick={onClick}
        >
            <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                        <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold text-white/90 truncate text-base">
                                    {name}
                                </h3>
                                {batch && type !== "sector" && (
                                    <span className="px-2 py-0.5 rounded bg-white/10 text-white/70 text-xs whitespace-nowrap shrink-0">{formatBatchToQuarter(batch)}</span>
                                )}
                                {url && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 shrink-0 text-white/60 hover:text-white/90"
                                        onClick={handleLinkClick}
                                        title="View on YC"
                                    >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                            </div>
                            {description && (
                                <p className="text-sm text-white/60 mt-1 line-clamp-2 min-h-[2.5rem]">
                                    {description}
                                </p>
                            )}
                            {!description && type !== "sector" && (
                                <div className="min-h-[2.5rem]"></div>
                            )}
                            {type === "sector" && userTypeCount !== undefined && (
                                <div className="flex items-center gap-3 mt-1 text-xs text-white/50 whitespace-nowrap">
                                    <span>{userTypeCount} {userTypeCount === 1 ? "startup" : "startups"}</span>
                                    {medianBatch && (
                                        <>
                                            <span className="text-white/30">•</span>
                                            <span className="px-2 py-0.5 rounded bg-white/10 text-white/70 whitespace-nowrap">{formatBatchToQuarter(medianBatch)}</span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    {onClick && !compact && !url && (
                        <ChevronRight className="h-5 w-5 text-white/30 shrink-0" />
                    )}
                </div>
                <SectorMetricsMini metrics={metrics} compact={compact || type !== "sector"} />
            </div>
        </GlassmorphicCard>
    );
}

