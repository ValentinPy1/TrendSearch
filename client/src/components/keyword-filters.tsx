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
import { X, Filter, ChevronDown, ChevronUp, Plus, Pencil, Check, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PaywallModal } from "./paywall-modal";
import { usePaymentStatus } from "@/hooks/use-payment-status";

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
    const [editingFilterId, setEditingFilterId] = useState<string | null>(null);
    const [previewCount, setPreviewCount] = useState<number | null>(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [showPaywall, setShowPaywall] = useState(false);
    const { data: paymentStatus } = usePaymentStatus();
    const hasPaid = paymentStatus?.hasPaid ?? false;

    // Get available metrics (not already filtered, except the one being edited)
    const usedMetrics = new Set(
        filters.filter((f) => f.id !== editingFilterId).map((f) => f.metric)
    );
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
        onError: (error: any) => {
            // Check if it's a payment required error
            if (error?.message?.includes("402") || error?.status === 402 || error?.requiresPayment) {
                setShowPaywall(true);
            }
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

        // Check if user has paid before adding filter
        if (!hasPaid) {
            setShowPaywall(true);
            return;
        }

        const numericValue = parseFloat(newFilterValue);
        if (isNaN(numericValue)) return;

        if (editingFilterId) {
            // Update existing filter
            onFiltersChange(
                filters.map((f) =>
                    f.id === editingFilterId
                        ? {
                            ...f,
                            metric: newFilterMetric,
                            operator: newFilterOperator,
                            value: numericValue,
                        }
                        : f
                )
            );
            setEditingFilterId(null);
        } else {
            // Add new filter
            const newFilter: KeywordFilter = {
                id: Date.now().toString(),
                metric: newFilterMetric,
                operator: newFilterOperator,
                value: numericValue,
            };
            onFiltersChange([...filters, newFilter]);
        }

        // Reset form
        setNewFilterMetric("");
        setNewFilterValue("");
        setNewFilterOperator(">");
    };

    const handleEditFilter = (filter: KeywordFilter) => {
        setNewFilterMetric(filter.metric);
        setNewFilterOperator(filter.operator);
        setNewFilterValue(filter.value.toString());
        setEditingFilterId(filter.id);
    };

    const handleCancelEdit = () => {
        setNewFilterMetric("");
        setNewFilterValue("");
        setNewFilterOperator(">");
        setEditingFilterId(null);
    };

    const handleRemoveFilter = (filterId: string) => {
        // If removing the filter being edited, cancel edit mode
        if (editingFilterId === filterId) {
            handleCancelEdit();
        }
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
        <>
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
                                className={`px-3 py-1.5 text-white border flex items-center gap-2 ${editingFilterId === filter.id
                                    ? "bg-white/20 border-white/40 ring-2 ring-white/30"
                                    : "bg-white/10 border-white/20"
                                    }`}
                            >
                                <span className="font-medium">{getMetricLabel(filter.metric)}</span>
                                <span className="text-white/60">{filter.operator}</span>
                                <span>{formatFilterValue(filter.metric, filter.value)}</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-4 w-4 ml-1 hover:bg-white/20"
                                    onClick={() => handleEditFilter(filter)}
                                    disabled={editingFilterId !== null && editingFilterId !== filter.id}
                                >
                                    <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-4 w-4 hover:bg-white/20"
                                    onClick={() => handleRemoveFilter(filter.id)}
                                    disabled={editingFilterId === filter.id}
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            </Badge>
                        ))}
                    </div>
                )}

                {/* Add/Edit Filter Form */}
                <div className="flex flex-wrap gap-2 items-end p-4 bg-white/5 rounded-lg border border-white/10">
                    <div className="flex-1 min-w-[150px]">
                        <label className="text-xs text-white/60 mb-1 block">Metric</label>
                        <Select value={newFilterMetric} onValueChange={setNewFilterMetric}>
                            <SelectTrigger className="bg-white/5 border-white/10 text-white">
                                <SelectValue placeholder="Select metric" />
                            </SelectTrigger>
                            <SelectContent>
                                {editingFilterId ? (
                                    // When editing, show all metrics including the current one
                                    FILTERABLE_METRICS.map((metric) => (
                                        <SelectItem key={metric.value} value={metric.value}>
                                            {metric.label}
                                        </SelectItem>
                                    ))
                                ) : (
                                    // When adding, only show available metrics
                                    availableMetrics.map((metric) => (
                                        <SelectItem key={metric.value} value={metric.value}>
                                            {metric.label}
                                        </SelectItem>
                                    ))
                                )}
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
                        {editingFilterId ? (
                            <>
                                <Check className="h-4 w-4" />
                                Update
                            </>
                        ) : (
                            <>
                                <Plus className="h-4 w-4" />
                                Add Filter
                            </>
                        )}
                    </Button>
                    {editingFilterId && (
                        <Button
                            onClick={handleCancelEdit}
                            size="sm"
                            variant="ghost"
                            className="flex items-center gap-2 text-white/60 hover:text-white"
                        >
                            Cancel
                        </Button>
                    )}
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
        
        <PaywallModal
            open={showPaywall}
            onOpenChange={setShowPaywall}
            feature="advanced-filters"
        />
    </>
    );
}
