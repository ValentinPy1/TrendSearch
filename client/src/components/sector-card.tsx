import { GlassmorphicCard } from "./glassmorphic-card";
import { SectorMetricsMini } from "./sector-metrics-mini";
import { Building2, Users, Package, ChevronRight, ExternalLink, LucideIcon } from "lucide-react";
import type { AggregatedMetrics } from "@/hooks/use-sector-data";
import { Button } from "./ui/button";

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
                            <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-white/90 truncate text-base">
                                    {name}
                                </h3>
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
                                <p className="text-sm text-white/60 mt-1 line-clamp-2">
                                    {description}
                                </p>
                            )}
                            {type === "sector" && userTypeCount !== undefined && (
                                <div className="flex items-center gap-3 mt-1 text-xs text-white/50">
                                    <span>{userTypeCount} {userTypeCount === 1 ? "startup" : "startups"}</span>
                                </div>
                            )}
                            {batch && type !== "sector" && (
                                <div className="flex items-center gap-3 mt-1 text-xs text-white/50">
                                    <span className="px-2 py-0.5 rounded bg-white/10 text-white/70">{batch}</span>
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

