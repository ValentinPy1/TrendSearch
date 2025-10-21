import { useState, useMemo } from "react";
import { GlassmorphicCard } from "./glassmorphic-card";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { Keyword } from "@shared/schema";

type SortField = 'keyword' | 'volume' | 'competition' | 'cpc' | 'topPageBid' | 'growth3m' | 'growthYoy';
type SortDirection = 'asc' | 'desc' | null;

interface KeywordsTableProps {
  keywords: Keyword[];
  selectedKeyword: string | null;
  onKeywordSelect: (keyword: string) => void;
}

export function KeywordsTable({ keywords, selectedKeyword, onKeywordSelect }: KeywordsTableProps) {
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
    const topKeywords = keywords.slice(0, 10);
    
    if (!sortField || !sortDirection) {
      return topKeywords;
    }

    return [...topKeywords].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case 'keyword':
          aVal = a.keyword?.toLowerCase() || '';
          bVal = b.keyword?.toLowerCase() || '';
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
        <div>
          <h3 className="text-xl font-semibold text-white mb-2">
            Top 10 Related Keywords
          </h3>
          <p className="text-sm text-white/60">
            Click a keyword to view its trend analysis
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
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
              </tr>
            </thead>
            <tbody>
              {sortedKeywords.map((keyword, index) => {
                const growth3m = parseFloat(keyword.growth3m || "0");
                const growthYoy = parseFloat(keyword.growthYoy || "0");
                
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
