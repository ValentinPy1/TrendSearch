import { useState, useMemo } from "react";
import { GlassmorphicCard } from "./glassmorphic-card";
import { Input } from "@/components/ui/input";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { Keyword } from "@shared/schema";

type SortField = 'keyword' | 'similarityScore' | 'volume' | 'competition' | 'cpc' | 'topPageBid' | 'growth3m' | 'growthYoy' | 'sustainedGrowthScore';
type SortDirection = 'asc' | 'desc' | null;

interface KeywordsTableProps {
  keywords: Keyword[];
  selectedKeyword: string | null;
  onKeywordSelect: (keyword: string) => void;
  keywordCount: number;
  onKeywordCountChange: (count: number) => void;
}

export function KeywordsTable({ keywords, selectedKeyword, onKeywordSelect, keywordCount, onKeywordCountChange }: KeywordsTableProps) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortField(null);
      } else {
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedKeywords = useMemo(() => {
    if (!sortField || !sortDirection) {
      return keywords;
    }

    return [...keywords].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case 'keyword':
          aVal = a.keyword?.toLowerCase() || '';
          bVal = b.keyword?.toLowerCase() || '';
          break;
        case 'similarityScore':
          aVal = parseFloat(a.similarityScore || "0");
          bVal = parseFloat(b.similarityScore || "0");
          break;
        case 'volume':
          aVal = a.volume || 0;
          bVal = b.volume || 0;
          break;
        case 'competition':
          aVal = a.competition || 0;
          bVal = b.competition || 0;
          break;
        case 'cpc':
          aVal = parseFloat(a.cpc || "0");
          bVal = parseFloat(b.cpc || "0");
          break;
        case 'topPageBid':
          aVal = parseFloat(a.topPageBid || "0");
          bVal = parseFloat(b.topPageBid || "0");
          break;
        case 'growth3m':
          aVal = parseFloat(a.growth3m || "0");
          bVal = parseFloat(b.growth3m || "0");
          break;
        case 'growthYoy':
          aVal = parseFloat(a.growthYoy || "0");
          bVal = parseFloat(b.growthYoy || "0");
          break;
        case 'sustainedGrowthScore':
          aVal = parseFloat(a.sustainedGrowthScore || "0");
          bVal = parseFloat(b.sustainedGrowthScore || "0");
          break;
      }

      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  }, [keywords, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 text-white/40" />;
    }
    if (sortDirection === 'asc') {
      return <ArrowUp className="h-4 w-4 ml-1 text-primary" />;
    }
    return <ArrowDown className="h-4 w-4 ml-1 text-primary" />;
  };

  return (
    <GlassmorphicCard className="p-8">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-xl font-semibold text-white mb-2">
              Top {keywordCount} Related Keywords
            </h3>
            <p className="text-sm text-white/60">
              Click a keyword to view its trend analysis
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="keyword-count" className="text-sm text-white/80 font-medium">
              Keywords:
            </label>
            <Input
              id="keyword-count"
              type="number"
              min="1"
              max="100"
              value={keywordCount}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                if (!isNaN(value) && value >= 1 && value <= 100) {
                  onKeywordCountChange(value);
                }
              }}
              className="w-20 bg-white/5 border-white/10 text-white text-center"
              data-testid="input-keyword-count"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-[#0a0a0f] z-10">
              <tr className="border-b border-white/10">
                <th 
                  className="text-left py-3 px-4 text-sm font-semibold text-white/80 cursor-pointer hover-elevate"
                  onClick={() => handleSort('keyword')}
                  data-testid="header-keyword"
                >
                  <div className="flex items-center">
                    Keyword
                    <SortIcon field="keyword" />
                  </div>
                </th>
                <th 
                  className="text-center py-3 px-4 text-sm font-semibold text-white/80 cursor-pointer hover-elevate"
                  onClick={() => handleSort('similarityScore')}
                  data-testid="header-similarity"
                >
                  <div className="flex items-center justify-center">
                    Match
                    <SortIcon field="similarityScore" />
                  </div>
                </th>
                <th 
                  className="text-right py-3 px-4 text-sm font-semibold text-white/80 cursor-pointer hover-elevate"
                  onClick={() => handleSort('volume')}
                  data-testid="header-volume"
                >
                  <div className="flex items-center justify-end">
                    Volume
                    <SortIcon field="volume" />
                  </div>
                </th>
                <th 
                  className="text-center py-3 px-4 text-sm font-semibold text-white/80 cursor-pointer hover-elevate"
                  onClick={() => handleSort('competition')}
                  data-testid="header-competition"
                >
                  <div className="flex items-center justify-center">
                    Competition
                    <SortIcon field="competition" />
                  </div>
                </th>
                <th 
                  className="text-right py-3 px-4 text-sm font-semibold text-white/80 cursor-pointer hover-elevate"
                  onClick={() => handleSort('cpc')}
                  data-testid="header-cpc"
                >
                  <div className="flex items-center justify-end">
                    CPC
                    <SortIcon field="cpc" />
                  </div>
                </th>
                <th 
                  className="text-right py-3 px-4 text-sm font-semibold text-white/80 cursor-pointer hover-elevate"
                  onClick={() => handleSort('topPageBid')}
                  data-testid="header-top-page-bid"
                >
                  <div className="flex items-center justify-end">
                    Top Page Bid
                    <SortIcon field="topPageBid" />
                  </div>
                </th>
                <th 
                  className="text-right py-3 px-4 text-sm font-semibold text-white/80 cursor-pointer hover-elevate"
                  onClick={() => handleSort('growth3m')}
                  data-testid="header-growth-3m"
                >
                  <div className="flex items-center justify-end">
                    3Mo Trend
                    <SortIcon field="growth3m" />
                  </div>
                </th>
                <th 
                  className="text-right py-3 px-4 text-sm font-semibold text-white/80 cursor-pointer hover-elevate"
                  onClick={() => handleSort('growthYoy')}
                  data-testid="header-growth-yoy"
                >
                  <div className="flex items-center justify-end">
                    YoY Trend
                    <SortIcon field="growthYoy" />
                  </div>
                </th>
                <th 
                  className="text-center py-3 px-4 text-sm font-semibold text-white/80 cursor-pointer hover-elevate"
                  onClick={() => handleSort('sustainedGrowthScore')}
                  data-testid="header-growth-score"
                >
                  <div className="flex items-center justify-center">
                    Growth Score
                    <SortIcon field="sustainedGrowthScore" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedKeywords.map((keyword, index) => {
                const growth3m = parseFloat(keyword.growth3m || "0");
                const growthYoy = parseFloat(keyword.growthYoy || "0");
                const growthScore = parseFloat(keyword.sustainedGrowthScore || "0");
                
                return (
                  <tr
                    key={keyword.id}
                    onClick={() => onKeywordSelect(keyword.keyword)}
                    className={`
                      border-b border-white/5 cursor-pointer transition-all
                      hover-elevate active-elevate-2
                      ${selectedKeyword === keyword.keyword ? 'bg-white/10' : ''}
                    `}
                    data-testid={`row-keyword-${index}`}
                  >
                    <td className="py-4 px-4 text-sm text-white font-medium">
                      {keyword.keyword}
                    </td>
                    <td className="py-4 px-4 text-sm text-center">
                      <span className={`
                        inline-block px-2 py-1 rounded text-xs font-medium
                        ${parseFloat(keyword.similarityScore || "0") >= 0.8 ? 'bg-green-500/20 text-green-300' : ''}
                        ${parseFloat(keyword.similarityScore || "0") >= 0.6 && parseFloat(keyword.similarityScore || "0") < 0.8 ? 'bg-blue-500/20 text-blue-300' : ''}
                        ${parseFloat(keyword.similarityScore || "0") < 0.6 ? 'bg-yellow-500/20 text-yellow-300' : ''}
                      `}>
                        {(parseFloat(keyword.similarityScore || "0") * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm text-white text-right">
                      {keyword.volume?.toLocaleString() || "N/A"}
                    </td>
                    <td className="py-4 px-4 text-sm text-white text-center">
                      <span className={`
                        inline-block px-3 py-1 rounded-full text-xs font-medium
                        ${(keyword.competition || 0) < 33 ? 'bg-green-500/20 text-green-300' : ''}
                        ${(keyword.competition || 0) >= 33 && (keyword.competition || 0) < 66 ? 'bg-yellow-500/20 text-yellow-300' : ''}
                        ${(keyword.competition || 0) >= 66 ? 'bg-red-500/20 text-red-300' : ''}
                      `}>
                        {keyword.competition ?? "N/A"}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm text-white text-right">
                      ${keyword.cpc || "0.00"}
                    </td>
                    <td className="py-4 px-4 text-sm text-white text-right">
                      ${keyword.topPageBid || "0.00"}
                    </td>
                    <td className="py-4 px-4 text-sm text-right">
                      <span className={growth3m >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {growth3m >= 0 ? '+' : ''}{growth3m.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm text-right">
                      <span className={growthYoy >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {growthYoy >= 0 ? '+' : ''}{growthYoy.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm text-center">
                      <span className={`
                        inline-block px-2 py-1 rounded text-xs font-medium
                        ${growthScore >= 0.01 ? 'bg-green-500/20 text-green-300' : ''}
                        ${growthScore < 0.01 && growthScore >= 0 ? 'bg-blue-500/20 text-blue-300' : ''}
                        ${growthScore < 0 ? 'bg-red-500/20 text-red-300' : ''}
                      `}>
                        {growthScore.toFixed(4)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </GlassmorphicCard>
  );
}
