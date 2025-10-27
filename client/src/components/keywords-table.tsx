import { useState, useMemo, useEffect, useRef } from "react";
import { GlassmorphicCard } from "./glassmorphic-card";
import { ArrowUpDown, ArrowUp, ArrowDown, Copy, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Keyword } from "@shared/schema";

type SortField =
  | "keyword"
  | "similarityScore"
  | "volume"
  | "competition"
  | "cpc"
  | "topPageBid"
  | "volatility"
  | "growthYoy"
  | "opportunityScore";
type SortDirection = "asc" | "desc" | null;

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

  const columnInfo = {
    keyword: "Search terms related to your idea",
    similarityScore: "How closely this keyword matches your idea",
    volume: "Average monthly searches for this keyword",
    competition: "Level of advertiser competition (0-100 scale)",
    cpc: "Average cost per click in advertising",
    topPageBid: "Estimated bid to appear at top of search results",
    volatility: "Average relative deviation from exponential growth trend - measures keyword stability",
    growthYoy: "Search volume change compared to last year",
    opportunityScore: "log(SAC) × Trend Strength × Bid Efficiency - comprehensive opportunity metric",
  };

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
        case "opportunityScore":
          aVal = a.opportunityScore || 0;
          bVal = b.opportunityScore || 0;
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
        case "topPageBid":
          aVal = parseFloat(a.topPageBid || "0");
          bVal = parseFloat(b.topPageBid || "0");
          break;
        case "volatility":
          aVal = parseFloat(a.volatility || "0");
          bVal = parseFloat(b.volatility || "0");
          break;
        case "growthYoy":
          aVal = parseFloat(a.growthYoy || "0");
          bVal = parseFloat(b.growthYoy || "0");
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

  const getBlueGradientText = (value: number) => {
    // Map 30-70 range to white-to-blue gradient
    const normalizedValue = Math.min(1, Math.max(0, (value - 30) / 40));
    const lightness = 100 - normalizedValue * 40; // 100% (white) to 60% (blue)
    return {
      color: `hsl(210, 80%, ${lightness}%)`,
    };
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
    // Scaled to max value, white-to-purple gradient
    const normalizedValue = Math.min(1, value / max);
    const lightness = 100 - normalizedValue * 40; // 100% (white) to 60% (purple)
    return {
      color: `hsl(250, 80%, ${lightness}%)`,
    };
  };

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

  const getOpportunityGradientText = (score: number) => {
    // 0-100 range: low (red) to medium (yellow) to high (green)
    if (score < 50) {
      // 0-50: red to yellow
      const normalizedValue = score / 50;
      const hue = normalizedValue * 60; // 0 (red) to 60 (yellow)
      const lightness = 60 - normalizedValue * 10; // 60% to 50%
      return {
        color: `hsl(${hue}, 80%, ${lightness}%)`,
      };
    } else {
      // 50-100: yellow to green
      const normalizedValue = (score - 50) / 50;
      const hue = 60 + normalizedValue * 82; // 60 (yellow) to 142 (green)
      const lightness = 60 - normalizedValue * 10; // 60% to 50%
      return {
        color: `hsl(${hue}, 80%, ${lightness}%)`,
      };
    }
  };

  return (
    <GlassmorphicCard className="p-8">
      <div className="overflow-x-auto">
        <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th
                  className="text-left py-3 px-4 text-sm font-semibold text-white/80 cursor-pointer hover-elevate"
                  onClick={() => handleSort("keyword")}
                  data-testid="header-keyword"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center">
                        Keyword
                        <SortIcon field="keyword" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{columnInfo.keyword}</p>
                    </TooltipContent>
                  </Tooltip>
                </th>
                <th
                  className="text-center py-3 px-4 text-sm font-semibold text-white/80 cursor-pointer hover-elevate"
                  onClick={() => handleSort("similarityScore")}
                  data-testid="header-similarity"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-center">
                        Match
                        <SortIcon field="similarityScore" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{columnInfo.similarityScore}</p>
                    </TooltipContent>
                  </Tooltip>
                </th>
                <th
                  className="text-right py-3 px-4 text-sm font-semibold text-white/80 cursor-pointer hover-elevate"
                  onClick={() => handleSort("volume")}
                  data-testid="header-volume"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-end">
                        Volume
                        <SortIcon field="volume" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{columnInfo.volume}</p>
                    </TooltipContent>
                  </Tooltip>
                </th>
                <th
                  className="text-center py-3 px-4 text-sm font-semibold text-white/80 cursor-pointer hover-elevate"
                  onClick={() => handleSort("competition")}
                  data-testid="header-competition"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-center">
                        Competition
                        <SortIcon field="competition" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{columnInfo.competition}</p>
                    </TooltipContent>
                  </Tooltip>
                </th>
                <th
                  className="text-right py-3 px-4 text-sm font-semibold text-white/80 cursor-pointer hover-elevate"
                  onClick={() => handleSort("cpc")}
                  data-testid="header-cpc"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-end">
                        CPC
                        <SortIcon field="cpc" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{columnInfo.cpc}</p>
                    </TooltipContent>
                  </Tooltip>
                </th>
                <th
                  className="text-right py-3 px-4 text-sm font-semibold text-white/80 cursor-pointer hover-elevate"
                  onClick={() => handleSort("topPageBid")}
                  data-testid="header-top-page-bid"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-end">
                        Top Page Bid
                        <SortIcon field="topPageBid" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{columnInfo.topPageBid}</p>
                    </TooltipContent>
                  </Tooltip>
                </th>
                <th
                  className="text-right py-3 px-4 text-sm font-semibold text-white/80 cursor-pointer hover-elevate"
                  onClick={() => handleSort("volatility")}
                  data-testid="header-volatility"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-end">
                        Volatility
                        <SortIcon field="volatility" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{columnInfo.volatility}</p>
                    </TooltipContent>
                  </Tooltip>
                </th>
                <th
                  className="text-right py-3 px-4 text-sm font-semibold text-white/80 cursor-pointer hover-elevate"
                  onClick={() => handleSort("growthYoy")}
                  data-testid="header-growth-yoy"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-end">
                        YoY Trend
                        <SortIcon field="growthYoy" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{columnInfo.growthYoy}</p>
                    </TooltipContent>
                  </Tooltip>
                </th>
                <th
                  className="text-right py-3 px-4 text-sm font-semibold text-white/80 cursor-pointer hover-elevate"
                  onClick={() => handleSort("opportunityScore")}
                  data-testid="header-opportunity-score"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-end">
                        Opportunity
                        <SortIcon field="opportunityScore" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{columnInfo.opportunityScore}</p>
                    </TooltipContent>
                  </Tooltip>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedKeywords.map((keyword, index) => {
                const volatility = parseFloat(keyword.volatility || "0");
                const growthYoy = parseFloat(keyword.growthYoy || "0");
                const opportunityScore = parseFloat(keyword.opportunityScore || "0");
                const matchPercentage =
                  parseFloat(keyword.similarityScore || "0") * 100;
                const competition = keyword.competition || 0;
                const cpc = parseFloat(keyword.cpc || "0");
                const topPageBid = parseFloat(keyword.topPageBid || "0");

                const maxCpc = Math.max(
                  ...sortedKeywords.map((k) => parseFloat(k.cpc || "0")),
                );
                const maxTopPageBid = Math.max(
                  ...sortedKeywords.map((k) => parseFloat(k.topPageBid || "0")),
                );

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
                    <td className="py-4 px-4 text-sm text-white font-medium">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteKeyword?.(keyword.id);
                          }}
                          data-testid={`button-delete-${index}`}
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
                            data-testid={`button-copy-${index}`}
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
                            data-testid={`button-search-${index}`}
                          >
                            <Search className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-sm text-center">
                      <span
                        className="font-medium"
                        style={getBlueGradientText(matchPercentage)}
                      >
                        {matchPercentage.toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm text-white text-right">
                      {keyword.volume?.toLocaleString() || "N/A"}
                    </td>
                    <td className="py-4 px-4 text-sm text-center">
                      <span
                        className="font-medium"
                        style={getRedGradientText(competition)}
                      >
                        {competition}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm text-right">
                      <span
                        className="font-medium"
                        style={getPurpleGradientText(cpc, maxCpc)}
                      >
                        ${cpc.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm text-right">
                      <span
                        className="font-medium"
                        style={getPurpleGradientText(topPageBid, maxTopPageBid)}
                      >
                        ${topPageBid.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm text-right">
                      <span className="font-medium text-white/70">
                        {(volatility * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm text-right">
                      <span
                        className="font-medium"
                        style={getTrendGradientText(growthYoy)}
                      >
                        {growthYoy >= 0 ? "+" : ""}
                        {growthYoy.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm text-right">
                      <span
                        className="font-medium"
                        style={getOpportunityGradientText(opportunityScore)}
                      >
                        {opportunityScore.toFixed(1)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {onLoadMore && (
                <tr className="border-t border-white/10">
                  <td colSpan={9} className="py-4 px-4">
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
