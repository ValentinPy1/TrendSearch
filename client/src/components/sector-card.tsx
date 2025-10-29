import { GlassmorphicCard } from "./glassmorphic-card";
import { SectorMetricsMini } from "./sector-metrics-mini";
import { Building2, Users, Package, ChevronRight } from "lucide-react";
import type { AggregatedMetrics } from "@/hooks/use-sector-data";

interface SectorCardProps {
    name: string;
    metrics: AggregatedMetrics;
    type: "sector" | "user_type" | "product_fit";
    onClick?: () => void;
    compact?: boolean;
    userTypeCount?: number;
    productFitCount?: number;
}

export function SectorCard({
    name,
    metrics,
    type,
    onClick,
    compact = false,
    userTypeCount,
    productFitCount,
}: SectorCardProps) {
    const getIcon = () => {
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

    return (
        <GlassmorphicCard
            className={`p-4 cursor-pointer transition-all duration-200 hover:bg-white/10 hover:scale-[1.02] ${
                compact ? "" : "hover:shadow-lg"
            }`}
            onClick={onClick}
        >
            <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                        <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-white/90 truncate text-base">
                                {name}
                            </h3>
                            {type === "sector" && (userTypeCount !== undefined || productFitCount !== undefined) && (
                                <div className="flex items-center gap-3 mt-1 text-xs text-white/50">
                                    {userTypeCount !== undefined && (
                                        <span>{userTypeCount} user {userTypeCount === 1 ? "type" : "types"}</span>
                                    )}
                                    {productFitCount !== undefined && (
                                        <span>{productFitCount} product {productFitCount === 1 ? "fit" : "fits"}</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    {onClick && !compact && (
                        <ChevronRight className="h-5 w-5 text-white/30 shrink-0" />
                    )}
                </div>
                <SectorMetricsMini metrics={metrics} compact={compact || type !== "sector"} />
            </div>
        </GlassmorphicCard>
    );
}

