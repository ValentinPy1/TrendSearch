import { useState, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { X, Filter, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type FilterOperator = ">" | ">=" | "<" | "<=" | "=";

export interface KeywordFilter {
    id: string;
    metric: string;
    operator: FilterOperator;
    value: number;
}

interface KeywordFiltersProps {
    ideaText: string | null;
    filters: KeywordFilter[];
    onFiltersChange: (filters: KeywordFilter[]) => void;
}

// Available metrics for filtering
const FILTERABLE_METRICS = [
    { value: "volume", label: "Volume" },
    { value: "competition", label: "Competition" },
    { value: "cpc", label: "CPC" },
    { value: "topPageBid", label: "Top Page Bid" },
    { value: "growth3m", label: "3Mo Growth" },
    { value: "growthYoy", label: "YoY Growth" },
    { value: "similarityScore", label: "Similarity Score" },
    { value: "volatility", label: "Volatility" },
    { value: "trendStrength", label: "Trend Strength" },
    { value: "bidEfficiency", label: "Bid Efficiency" },
    { value: "tac", label: "TAC" },
    { value: "sac", label: "SAC" },
    { value: "opportunityScore", label: "Opportunity Score" },
] as const;

const OPERATORS: { value: FilterOperator; label: string }[] = [
    { value: ">", label: "Greater than" },
    { value: ">=", label: "Greater than or equal" },
    { value: "<", label: "Less than" },
    { value: "<=", label: "Less than or equal" },
    { value: "=", label: "Equals" },
];

export function KeywordFilters({
    ideaText,
    filters,
    onFiltersChange,
}: KeywordFiltersProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [newFilterMetric, setNewFilterMetric] = useState<string>("");
    const [newFilterOperator, setNewFilterOperator] = useState<FilterOperator>(">");
    const [newFilterValue, setNewFilterValue] = useState<string>("");
    const [previewCount, setPreviewCount] = useState<number | null>(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);

    // Get available metrics (not already filtered)
    const usedMetrics = new Set(filters.map((f) => f.metric));
    const availableMetrics = FILTERABLE_METRICS.filter(
        (m) => !usedMetrics.has(m.value),
    );

    // Debounced preview count fetching
    const previewCountMutation = useMutation({
        mutationFn: async (data: { ideaText: string | null; filters: KeywordFilter[] }) => {
            if (!data.ideaText || data.filters.length === 0) {
                return { count: null };
            }
            const res = await apiRequest("POST", "/api/preview-filter-count", {
                ideaText: data.ideaText,
                filters: data.filters.map(({ id, ...rest }) => rest),
            });
            return res.json();
        },
        onSuccess: (result) => {
            setPreviewCount(result.count);
            setIsLoadingPreview(false);
        },
        onError: () => {
            setPreviewCount(null);
            setIsLoadingPreview(false);
        },
    });

    // Debounce preview updates
    useEffect(() => {
        if (!ideaText || filters.length === 0) {
            setPreviewCount(null);
            return;
        }

        setIsLoadingPreview(true);
        const timeoutId = setTimeout(() => {
            previewCountMutation.mutate({ ideaText, filters });
        }, 500);

        return () => {
            clearTimeout(timeoutId);
            setIsLoadingPreview(false);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ideaText, filters.length, JSON.stringify(filters.map(({ id, ...rest }) => rest))]);

    const handleAddFilter = () => {
        if (!newFilterMetric || !newFilterValue) return;

        const numericValue = parseFloat(newFilterValue);
        if (isNaN(numericValue)) return;

        const newFilter: KeywordFilter = {
            id: Date.now().toString(),
            metric: newFilterMetric,
            operator: newFilterOperator,
            value: numericValue,
        };

        onFiltersChange([...filters, newFilter]);
        setNewFilterMetric("");
        setNewFilterValue("");
    };

    const handleRemoveFilter = (filterId: string) => {
        onFiltersChange(filters.filter((f) => f.id !== filterId));
    };

    const handleClearAll = () => {
        onFiltersChange([]);
    };

    const getMetricLabel = (metricValue: string) => {
        return FILTERABLE_METRICS.find((m) => m.value === metricValue)?.label || metricValue;
    };

    const getOperatorLabel = (operator: FilterOperator) => {
        return OPERATORS.find((o) => o.value === operator)?.label || operator;
    };

    const formatFilterValue = (metric: string, value: number) => {
        if (metric === "similarityScore") {
            return (value * 100).toFixed(0) + "%";
        }
        if (metric.includes("growth") || metric === "competition") {
            return value + (metric === "competition" ? "" : "%");
        }
        if (metric === "cpc" || metric === "topPageBid" || metric === "tac" || metric === "sac") {
            return "$" + value.toFixed(2);
        }
        if (metric === "volume") {
            return value.toLocaleString();
        }
        return value.toFixed(2);
    };

    const canAddFilter = newFilterMetric && newFilterValue && !isNaN(parseFloat(newFilterValue));

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <div className="flex items-center justify-between">
                <CollapsibleTrigger asChild>
                    <Button
                        variant="ghost"
                        className="text-white/60 hover:text-white text-sm flex items-center gap-2"
                    >
                        <Filter className="h-4 w-4" />
                        Advanced Filters
                        {filters.length > 0 && (
                            <Badge variant="secondary" className="ml-2">
                                {filters.length}
                            </Badge>
                        )}
                        {isOpen ? (
                            <ChevronUp className="h-4 w-4" />
                        ) : (
                            <ChevronDown className="h-4 w-4" />
                        )}
                    </Button>
                </CollapsibleTrigger>
                {filters.length > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearAll}
                        className="text-white/60 hover:text-white text-xs"
                    >
                        Clear all
                    </Button>
                )}
            </div>

            <CollapsibleContent className="mt-4 space-y-4">
                {/* Active Filters */}
                {filters.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {filters.map((filter) => (
                            <Badge
                                key={filter.id}
                                variant="secondary"
                                className="px-3 py-1.5 bg-white/10 text-white border-white/20 flex items-center gap-2"
                            >
                                <span className="font-medium">{getMetricLabel(filter.metric)}</span>
                                <span className="text-white/60">{filter.operator}</span>
                                <span>{formatFilterValue(filter.metric, filter.value)}</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-4 w-4 ml-1 hover:bg-white/20"
                                    onClick={() => handleRemoveFilter(filter.id)}
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            </Badge>
                        ))}
                    </div>
                )}

                {/* Add Filter Form */}
                <div className="flex flex-wrap gap-2 items-end p-4 bg-white/5 rounded-lg border border-white/10">
                    <div className="flex-1 min-w-[150px]">
                        <label className="text-xs text-white/60 mb-1 block">Metric</label>
                        <Select value={newFilterMetric} onValueChange={setNewFilterMetric}>
                            <SelectTrigger className="bg-white/5 border-white/10 text-white">
                                <SelectValue placeholder="Select metric" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableMetrics.map((metric) => (
                                    <SelectItem key={metric.value} value={metric.value}>
                                        {metric.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="w-32">
                        <label className="text-xs text-white/60 mb-1 block">Operator</label>
                        <Select
                            value={newFilterOperator}
                            onValueChange={(value) => setNewFilterOperator(value as FilterOperator)}
                        >
                            <SelectTrigger className="bg-white/5 border-white/10 text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {OPERATORS.map((op) => (
                                    <SelectItem key={op.value} value={op.value}>
                                        {op.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex-1 min-w-[120px]">
                        <label className="text-xs text-white/60 mb-1 block">Value</label>
                        <Input
                            type="number"
                            step="any"
                            value={newFilterValue}
                            onChange={(e) => setNewFilterValue(e.target.value)}
                            placeholder="Enter value"
                            className="bg-white/5 border-white/10 text-white"
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && canAddFilter) {
                                    handleAddFilter();
                                }
                            }}
                        />
                    </div>

                    <Button
                        onClick={handleAddFilter}
                        disabled={!canAddFilter}
                        size="sm"
                        variant="secondary"
                        className="flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        Add Filter
                    </Button>
                </div>

                {/* Preview Count */}
                {filters.length > 0 && ideaText && (
                    <div className="text-sm text-white/60 flex items-center gap-2">
                        {isLoadingPreview ? (
                            <>
                                <div className="h-3 w-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                                <span>Checking matches...</span>
                            </>
                        ) : previewCount !== null ? (
                            <span>
                                <span className="font-medium text-white">{previewCount.toLocaleString()}</span>{" "}
                                keywords match your filters
                            </span>
                        ) : (
                            <span>Enter an idea to preview matches</span>
                        )}
                    </div>
                )}
            </CollapsibleContent>
        </Collapsible>
    );
}
