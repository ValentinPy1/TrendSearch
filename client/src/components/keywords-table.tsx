import { useState, useMemo, useEffect, useRef } from "react";
import { GlassmorphicCard } from "./glassmorphic-card";
import { ArrowUpDown, ArrowUp, ArrowDown, Copy, Search, Trash2, Columns, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import type { Keyword } from "@shared/schema";

type SortField =
  | "keyword"
  | "similarityScore"
  | "volume"
  | "competition"
  | "cpc"
  | "growth3m"
  | "growthYoy"
    | "topPageBid"
    | "volatility"
    | "trendStrength"
    | "bidEfficiency"
    | "tac"
    | "sac"
    | "opportunityScore";
type SortDirection = "asc" | "desc" | null;

type ColumnAlign = "left" | "center" | "right";

type ColumnConfig = {
    id: string;
    label: string;
    field: keyof Keyword;
    align: ColumnAlign;
    sortable: boolean;
    format: (value: any, keyword: Keyword, allKeywords: Keyword[]) => React.ReactNode;
    tooltip: string;
    required?: boolean; // Cannot be hidden
};

const DEFAULT_VISIBLE_COLUMNS = [
    "keyword",
    "similarityScore",
    "volume",
    "competition",
    "cpc",
    "topPageBid",
    "growth3m",
    "growthYoy",
];

interface KeywordsTableProps {
  keywords: Keyword[];
  selectedKeyword: string | null;
  onKeywordSelect: (keyword: string) => void;
  onSearchKeyword?: (keyword: string) => void;
  onDeleteKeyword?: (keywordId: string) => void;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  reportId?: string;
}

export function KeywordsTable({
  keywords,
  selectedKeyword,
  onKeywordSelect,
  onSearchKeyword,
  onDeleteKeyword,
  onLoadMore,
  isLoadingMore = false,
  reportId,
}: KeywordsTableProps) {
  const { toast } = useToast();
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [keywordIdsAtSort, setKeywordIdsAtSort] = useState<Set<string>>(new Set());
  const previousKeywordCountRef = useRef(0);

    // Load visible columns from localStorage or use default
    const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('keywords-table-visible-columns');
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    // Basic validation - full validation happens after columnConfigs is available
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        return parsed;
                    }
                } catch (e) {
                    // Invalid JSON, use default
                }
            }
        }
        return DEFAULT_VISIBLE_COLUMNS;
    });
    const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false);

    // Save visible columns to localStorage whenever they change
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('keywords-table-visible-columns', JSON.stringify(visibleColumns));
        }
    }, [visibleColumns]);

  // Update keywordIdsAtSort when keywords change (idea switch or initial load)
  // but NOT when loading more keywords for the same idea
  useEffect(() => {
    const currentCount = keywords.length;
    const previousCount = previousKeywordCountRef.current;
    
    // If sort is active and keywords changed in a way other than appending
    // (i.e., different set of IDs), update keywordIdsAtSort
    if (sortField && sortDirection) {
      const currentIds = new Set(keywords.map(k => k.id));
      const hasNewKeywords = keywords.some(k => !keywordIdsAtSort.has(k.id));
      const hasMissingKeywords = Array.from(keywordIdsAtSort).some(id => 
        !keywords.find(k => k.id === id)
      );
      
      // If keywords were replaced (idea switch) or removed (filtering), update the set
      // But if keywords only increased (load more), don't update
      if (hasMissingKeywords) {
        setKeywordIdsAtSort(currentIds);
      } else if (hasNewKeywords && currentCount <= previousCount) {
        // Keywords changed but count didn't increase = replacement, not append
        setKeywordIdsAtSort(currentIds);
      }
    }
    
    previousKeywordCountRef.current = currentCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keywords, sortField, sortDirection]);

    // Helper functions for formatting
    const getBlueGradientText = (value: number) => {
        const normalizedValue = Math.min(1, Math.max(0, (value - 30) / 40));
        const lightness = 100 - normalizedValue * 40;
        return { color: `hsl(210, 80%, ${lightness}%)` };
    };

    const getRedGradientText = (value: number) => {
        const normalizedValue = Math.min(1, Math.max(0, value / 100));
        const lightness = 100 - normalizedValue * 40;
        return { color: `hsl(0, 80%, ${lightness}%)` };
    };

    const getPurpleGradientText = (value: number, max: number) => {
        const normalizedValue = Math.min(1, value / max);
        const lightness = 100 - normalizedValue * 40;
        return { color: `hsl(250, 80%, ${lightness}%)` };
    };

    const getTrendGradientText = (value: number) => {
        if (value >= 0) {
            const normalizedValue = Math.min(1, value / 200);
            const lightness = 100 - normalizedValue * 50;
            return { color: `hsl(142, 70%, ${lightness}%)` };
        } else {
            const normalizedValue = Math.min(1, Math.abs(value) / 100);
            const lightness = 100 - normalizedValue * 50;
            return { color: `hsl(0, 80%, ${lightness}%)` };
        }
    };

    const getGreenGradientText = (value: number, max: number = 1) => {
        const normalizedValue = Math.min(1, Math.max(0, value / max));
        const lightness = 100 - normalizedValue * 40;
        return { color: `hsl(142, 70%, ${lightness}%)` };
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

    const getTrendStrengthBidEfficiencyGradient = (value: number) => {
        // White to red from 1 to 0 (values below 1)
        // White to green from 1 to 5 (values above 1)
        if (value <= 1) {
            // Range 0-1: white (at 1) to red (at 0)
            const clampedValue = Math.max(0, Math.min(1, value)); // Clamp to 0-1
            const normalizedValue = 1 - clampedValue; // Reverse: 0 at value 1, 1 at value 0
            const lightness = 100 - normalizedValue * 50; // 100% (white) to 50% (red)
            return { color: `hsl(0, 80%, ${lightness}%)` };
        } else {
            // Range 1-5: white (at 1) to green (at 5)
            const clampedValue = Math.min(5, Math.max(1, value)); // Clamp to 1-5
            const normalizedValue = (clampedValue - 1) / 4; // Normalize 1-5 to 0-1
            const lightness = 100 - normalizedValue * 50; // 100% (white) to 50% (green)
            return { color: `hsl(142, 70%, ${lightness}%)` };
        }
    };

    const getLogarithmicPurpleGradient = (value: number) => {
        // Logarithmic gradient from white to purple, range 0 to 10,000,000
        const maxValue = 10000000; // 10 million
        const clampedValue = Math.max(0, Math.min(maxValue, value));

        if (clampedValue === 0) {
            // White for zero
            return { color: `hsl(250, 80%, 100%)` };
        }

        // Use logarithmic scale: log10(value) / log10(maxValue)
        // Add 1 to avoid log(0), and adjust max accordingly
        const normalizedValue = Math.log10(clampedValue + 1) / Math.log10(maxValue + 1);
        const lightness = 100 - normalizedValue * 40; // 100% (white) to 60% (purple)
        return { color: `hsl(250, 80%, ${lightness}%)` };
    };

    const formatCurrencyTwoSignificantDigits = (value: number): string => {
        if (value === 0 || isNaN(value) || !isFinite(value)) {
            return "N/A";
        }

        // Round to 2 significant digits
        const order = Math.floor(Math.log10(Math.abs(value)));
        const rounded = Math.round(value / Math.pow(10, order - 1)) * Math.pow(10, order - 1);

        // Format with thousands separators
        // For values >= 1, show as whole numbers
        // For values < 1, show decimals
        if (rounded >= 1) {
            return `$${Math.round(rounded).toLocaleString('en-US')}`;
        } else {
            // For small values, show up to 2 decimal places
            return `$${rounded.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
        }
    };

    // Column configuration
    const columnConfigs = useMemo<Record<string, ColumnConfig>>(() => {
        const configs: Record<string, ColumnConfig> = {
            keyword: {
                id: "keyword",
                label: "Keyword",
                field: "keyword",
                align: "left",
                sortable: true,
                required: true,
                tooltip: "Search terms related to your idea",
                format: (value, keyword) => (
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDeleteKeyword?.(keyword.id);
                            }}
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                        <span>{keyword.keyword}</span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(keyword.keyword);
                                    toast({
                                        title: "Copied!",
                                        description: `"${keyword.keyword}" copied to clipboard`,
                                    });
                                }}
                            >
                                <Copy className="h-3 w-3" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSearchKeyword?.(keyword.keyword);
                                    toast({
                                        title: "Keyword added to search",
                                        description: `"${keyword.keyword}" added to input field`,
                                    });
                                }}
                            >
                                <Search className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                ),
            },
            similarityScore: {
                id: "similarityScore",
                label: "Match",
                field: "similarityScore",
                align: "center",
                sortable: true,
                tooltip: "How closely this keyword matches your idea",
                format: (value) => {
                    const matchPercentage = parseFloat(value || "0") * 100;
                    return (
                        <span className="font-medium" style={getBlueGradientText(matchPercentage)}>
                            {matchPercentage.toFixed(0)}%
                        </span>
                    );
                },
            },
            volume: {
                id: "volume",
                label: "Volume",
                field: "volume",
                align: "right",
                sortable: true,
                tooltip: "Average monthly searches for this keyword",
                format: (value) => (value?.toLocaleString() || "N/A"),
            },
            competition: {
                id: "competition",
                label: "Competition",
                field: "competition",
                align: "center",
                sortable: true,
                tooltip: "Level of advertiser competition (0-100 scale)",
                format: (value) => {
                    const competition = value || 0;
                    return (
                        <span className="font-medium" style={getRedGradientText(competition)}>
                            {competition}
                        </span>
                    );
                },
            },
            cpc: {
                id: "cpc",
                label: "CPC",
                field: "cpc",
                align: "right",
                sortable: true,
                tooltip: "Average cost per click in advertising",
                format: (value, keyword, allKeywords) => {
                    const cpc = parseFloat(value || "0");
                    const maxCpc = Math.max(...allKeywords.map((k) => parseFloat(k.cpc || "0")));
                    return (
                        <span className="font-medium" style={getPurpleGradientText(cpc, maxCpc)}>
                            ${cpc.toFixed(2)}
                        </span>
                    );
                },
            },
            topPageBid: {
                id: "topPageBid",
                label: "Top Page Bid",
                field: "topPageBid",
                align: "right",
                sortable: true,
                tooltip: "Estimated cost to appear at top of search results",
                format: (value, keyword, allKeywords) => {
                    const topPageBid = parseFloat(value || "0");
                    const maxTopPageBid = Math.max(...allKeywords.map((k) => parseFloat(k.topPageBid || "0")));
                    return (
                        <span className="font-medium" style={getPurpleGradientText(topPageBid, maxTopPageBid)}>
                            ${topPageBid.toFixed(2)}
                        </span>
                    );
                },
            },
            growth3m: {
                id: "growth3m",
                label: "3Mo Trend",
                field: "growth3m",
                align: "right",
                sortable: true,
                tooltip: "Search volume change over last 3 months",
                format: (value) => {
                    const growth3m = parseFloat(value || "0");
                    return (
                        <span className="font-medium" style={getTrendGradientText(growth3m)}>
                            {growth3m >= 0 ? "+" : ""}
                            {growth3m.toFixed(1)}%
                        </span>
                    );
                },
            },
            growthYoy: {
                id: "growthYoy",
                label: "YoY Trend",
                field: "growthYoy",
                align: "right",
                sortable: true,
                tooltip: "Search volume change compared to last year",
                format: (value) => {
                    const growthYoy = parseFloat(value || "0");
                    return (
                        <span className="font-medium" style={getTrendGradientText(growthYoy)}>
                            {growthYoy >= 0 ? "+" : ""}
                            {growthYoy.toFixed(1)}%
                        </span>
                    );
                },
            },
            volatility: {
                id: "volatility",
                label: "Volatility",
                field: "volatility",
                align: "right",
                sortable: true,
                tooltip: "Variability in search volume (lower = more stable)",
                format: (value) => {
                    const volatility = parseFloat(value || "0");
                    return (
                        <span className="font-medium text-white/80">
                            {volatility.toFixed(2)}
                        </span>
                    );
                },
            },
            trendStrength: {
                id: "trendStrength",
                label: "Trend Strength",
                field: "trendStrength",
                align: "right",
                sortable: true,
                tooltip: "Strength and reliability of the trend (0-1, higher = stronger trend)",
                format: (value) => {
                    const strength = parseFloat(value || "0");
                    return (
                        <span className="font-medium" style={getTrendStrengthBidEfficiencyGradient(strength)}>
                            {strength.toFixed(2)}
                        </span>
                    );
                },
            },
            bidEfficiency: {
                id: "bidEfficiency",
                label: "Bid Efficiency",
                field: "bidEfficiency",
                align: "right",
                sortable: true,
                tooltip: "Efficiency metric for bidding (higher = better value)",
                format: (value) => {
                    const efficiency = parseFloat(value || "0");
                    return (
                        <span className="font-medium" style={getTrendStrengthBidEfficiencyGradient(efficiency)}>
                            {efficiency.toFixed(2)}
                        </span>
                    );
                },
            },
            tac: {
                id: "tac",
                label: "TAC",
                field: "tac",
                align: "right",
                sortable: true,
                tooltip: "Total Acquisition Cost",
                format: (value) => {
                    const tac = parseFloat(value || "0");
                    const displayValue = formatCurrencyTwoSignificantDigits(tac);
                    return (
                        <span className="font-medium" style={getLogarithmicPurpleGradient(tac)}>
                            {displayValue}
                        </span>
                    );
                },
            },
            sac: {
                id: "sac",
                label: "SAC",
                field: "sac",
                align: "right",
                sortable: true,
                tooltip: "Search Acquisition Cost",
                format: (value) => {
                    const sac = parseFloat(value || "0");
                    const displayValue = formatCurrencyTwoSignificantDigits(sac);
                    return (
                        <span className="font-medium" style={getLogarithmicPurpleGradient(sac)}>
                            {displayValue}
                        </span>
                    );
                },
            },
            opportunityScore: {
                id: "opportunityScore",
                label: "Opportunity Score",
                field: "opportunityScore",
                align: "right",
                sortable: true,
                tooltip: "Comprehensive opportunity score combining multiple factors (higher = better opportunity)",
                format: (value) => {
                    const score = parseFloat(value || "0");
                    const maxScore = 25; // Scale gradient from 0 to 100
                    return (
                        <span className="font-medium" style={getOrangeGradientText(score, maxScore)}>
                            {score.toFixed(2)}
                        </span>
                    );
                },
            },
        };
        return configs;
    }, [onDeleteKeyword, onSearchKeyword, toast]);

    // Validate and sanitize visibleColumns against available columnConfigs
    // This runs once after columnConfigs is available to clean up any invalid stored columns
    const hasValidatedRef = useRef(false);
    useEffect(() => {
        if (hasValidatedRef.current) return;

        const availableColumnIds = Object.keys(columnConfigs);
        setVisibleColumns((prev) => {
            // Filter out any columns that no longer exist
            const validColumns = prev.filter((id) => availableColumnIds.includes(id));

            // If no valid columns remain, or keyword column was removed, restore defaults
            if (validColumns.length === 0 || !validColumns.includes("keyword")) {
                hasValidatedRef.current = true;
                return DEFAULT_VISIBLE_COLUMNS;
            }

            // If columns were filtered out, update the state (which will trigger localStorage save)
            if (validColumns.length !== prev.length) {
                hasValidatedRef.current = true;
                return validColumns;
            }

            // No changes needed
            hasValidatedRef.current = true;
            return prev;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [columnConfigs]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortDirection(null);
        setSortField(null);
        setKeywordIdsAtSort(new Set());
      } else {
        setSortDirection("asc");
        // Capture current keyword IDs when applying sort
        setKeywordIdsAtSort(new Set(keywords.map(k => k.id)));
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
      // Capture current keyword IDs when applying sort
      setKeywordIdsAtSort(new Set(keywords.map(k => k.id)));
    }
  };

  const sortedKeywords = useMemo(() => {
    if (!sortField || !sortDirection) {
      return keywords;
    }

    // Separate keywords into those present at sort time and new ones
    const keywordsAtSort = keywords.filter(k => keywordIdsAtSort.has(k.id));
    const newKeywords = keywords.filter(k => !keywordIdsAtSort.has(k.id));

    // Sort only the keywords that were present when sort was applied
    const sorted = [...keywordsAtSort].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case "keyword":
          aVal = a.keyword?.toLowerCase() || "";
          bVal = b.keyword?.toLowerCase() || "";
          break;
        case "similarityScore":
          aVal = parseFloat(a.similarityScore || "0");
          bVal = parseFloat(b.similarityScore || "0");
          break;
        case "volume":
          aVal = a.volume || 0;
          bVal = b.volume || 0;
          break;
        case "competition":
          aVal = a.competition || 0;
          bVal = b.competition || 0;
          break;
        case "cpc":
          aVal = parseFloat(a.cpc || "0");
          bVal = parseFloat(b.cpc || "0");
          break;
        case "growth3m":
          aVal = parseFloat(a.growth3m || "0");
          bVal = parseFloat(b.growth3m || "0");
          break;
        case "growthYoy":
          aVal = parseFloat(a.growthYoy || "0");
          bVal = parseFloat(b.growthYoy || "0");
          break;
        case "topPageBid":
          aVal = parseFloat(a.topPageBid || "0");
          bVal = parseFloat(b.topPageBid || "0");
          break;
                case "volatility":
                    aVal = parseFloat(a.volatility || "0");
                    bVal = parseFloat(b.volatility || "0");
                    break;
                case "trendStrength":
                    aVal = parseFloat(a.trendStrength || "0");
                    bVal = parseFloat(b.trendStrength || "0");
                    break;
                case "bidEfficiency":
                    aVal = parseFloat(a.bidEfficiency || "0");
                    bVal = parseFloat(b.bidEfficiency || "0");
                    break;
                case "tac":
                    aVal = parseFloat(a.tac || "0");
                    bVal = parseFloat(b.tac || "0");
                    break;
                case "sac":
                    aVal = parseFloat(a.sac || "0");
                    bVal = parseFloat(b.sac || "0");
                    break;
                case "opportunityScore":
                    aVal = parseFloat(a.opportunityScore || "0");
                    bVal = parseFloat(b.opportunityScore || "0");
                    break;
      }

      if (sortDirection === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    // Append new keywords to the end
    return [...sorted, ...newKeywords];
  }, [keywords, sortField, sortDirection, keywordIdsAtSort]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 text-white/40" />;
    }
    if (sortDirection === "asc") {
      return <ArrowUp className="h-4 w-4 ml-1 text-primary" />;
    }
    return <ArrowDown className="h-4 w-4 ml-1 text-primary" />;
  };

    // Column management functions
    const handleToggleColumn = (columnId: string) => {
        const config = columnConfigs[columnId];
        if (config?.required) return; // Cannot hide required columns

        setVisibleColumns((prev) => {
            if (prev.includes(columnId)) {
                // Remove column
                return prev.filter((id) => id !== columnId);
            } else {
                // Add column to end
                return [...prev, columnId];
            }
        });
    };

    const handleMoveColumn = (columnId: string, direction: "up" | "down") => {
        setVisibleColumns((prev) => {
            const index = prev.indexOf(columnId);
            if (index === -1) return prev;

            const newColumns = [...prev];
            if (direction === "up" && index > 0) {
                [newColumns[index - 1], newColumns[index]] = [newColumns[index], newColumns[index - 1]];
            } else if (direction === "down" && index < newColumns.length - 1) {
                [newColumns[index], newColumns[index + 1]] = [newColumns[index + 1], newColumns[index]];
            }
            return newColumns;
        });
    };

    // Get visible and hidden columns
    const visibleColumnConfigs = visibleColumns.map((id) => columnConfigs[id]).filter(Boolean);
    const hiddenColumnIds = Object.keys(columnConfigs).filter(
        (id) => !visibleColumns.includes(id)
    );

  return (
    <GlassmorphicCard className="p-8">
            <div className="flex justify-end mb-4">
                <Popover open={isColumnSelectorOpen} onOpenChange={setIsColumnSelectorOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-white/60 hover:text-white"
                        >
                            <Columns className="h-4 w-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 bg-popover/95 backdrop-blur-xl border-white/10" align="end">
                        <div className="space-y-4">
                            <div className="font-semibold text-sm text-white/90">Column Settings</div>
                            <Separator className="bg-white/10" />

                            {/* Visible columns with reordering */}
                            <div className="space-y-2">
                                <div className="text-xs font-medium text-white/60">Visible Columns</div>
                                {visibleColumnConfigs.map((config, idx) => (
                                    <div key={config.id} className="flex items-center gap-2 p-2 rounded hover:bg-white/5">
                                        <Checkbox
                                            checked={true}
                                            onCheckedChange={() => handleToggleColumn(config.id)}
                                            disabled={config.required}
                                        />
                                        <span className="flex-1 text-sm text-white/80">{config.label}</span>
                                        <div className="flex gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6"
                                                onClick={() => handleMoveColumn(config.id, "up")}
                                                disabled={idx === 0}
                                            >
                                                <ChevronUp className="h-3 w-3" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6"
                                                onClick={() => handleMoveColumn(config.id, "down")}
                                                disabled={idx === visibleColumnConfigs.length - 1}
                                            >
                                                <ChevronDown className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Hidden columns */}
                            {hiddenColumnIds.length > 0 && (
                                <>
                                    <Separator className="bg-white/10" />
                                    <div className="space-y-2">
                                        <div className="text-xs font-medium text-white/60">Available Columns</div>
                                        {hiddenColumnIds.map((id) => {
                                            const config = columnConfigs[id];
                                            if (!config) return null;
                                            return (
                                                <div key={id} className="flex items-center gap-2 p-2 rounded hover:bg-white/5">
                                                    <Checkbox
                                                        checked={false}
                                                        onCheckedChange={() => handleToggleColumn(id)}
                                                    />
                                                    <span className="flex-1 text-sm text-white/80">{config.label}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
      <div className="overflow-x-auto">
        <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                            {visibleColumnConfigs.map((config) => {
                                const alignClass =
                                    config.align === "left"
                                        ? "text-left"
                                        : config.align === "center"
                                            ? "text-center"
                                            : "text-right";
                                const justifyClass =
                                    config.align === "left"
                                        ? "justify-start"
                                        : config.align === "center"
                                            ? "justify-center"
                                            : "justify-end";

                                return (
                                    <th
                                        key={config.id}
                                        className={`${alignClass} py-3 px-4 text-sm font-semibold text-white/80 ${config.sortable ? "cursor-pointer hover-elevate" : ""
                                            }`}
                                        onClick={() => config.sortable && handleSort(config.field as SortField)}
                                        data-testid={`header-${config.id}`}
                                    >
                                        {config.sortable ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                                                    <div className={`flex items-center ${justifyClass}`}>
                                                        {config.label}
                                                        <SortIcon field={config.field as SortField} />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                                                    <p>{config.tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                                        ) : (
                                            <div className={`flex items-center ${justifyClass}`}>
                                                {config.label}
                      </div>
                                        )}
                </th>
                                );
                            })}
              </tr>
            </thead>
            <tbody>
              {sortedKeywords.map((keyword, index) => {
                return (
                  <tr
                    key={keyword.id}
                    onClick={() => onKeywordSelect(keyword.keyword)}
                    className={`
                      group border-b border-white/5 cursor-pointer transition-all
                      hover-elevate active-elevate-2
                      ${selectedKeyword === keyword.keyword ? "bg-white/10" : ""}
                    `}
                    data-testid={`row-keyword-${index}`}
                  >
                                    {visibleColumnConfigs.map((config) => {
                                        const alignClass =
                                            config.align === "left"
                                                ? "text-left"
                                                : config.align === "center"
                                                    ? "text-center"
                                                    : "text-right";
                                        const value = keyword[config.field];
                                        return (
                                            <td
                                                key={config.id}
                                                className={`py-4 px-4 text-sm ${alignClass} ${config.id === "keyword" ? "text-white font-medium" : ""
                                                    }`}
                                            >
                                                {config.format(value, keyword, sortedKeywords)}
                    </td>
                                        );
                                    })}
                  </tr>
                );
              })}
              {onLoadMore && (
                <tr className="border-t border-white/10">
                                <td colSpan={visibleColumns.length} className="py-4 px-4">
                    <Button
                      variant="ghost"
                      onClick={onLoadMore}
                      disabled={isLoadingMore}
                      className="w-full text-white/60 hover:text-white transition-colors"
                      data-testid="button-load-more-keyword"
                    >
                      {isLoadingMore ? (
                        <span className="flex items-center gap-2">
                          <div className="h-4 w-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                          Loading keywords...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="text-lg">+</span>
                          Show 5 more keywords
                        </span>
                      )}
                    </Button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
      </div>
    </GlassmorphicCard>
  );
}
