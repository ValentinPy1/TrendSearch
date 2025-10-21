import { GlassmorphicCard } from "./glassmorphic-card";
import type { Keyword } from "@shared/schema";

interface KeywordsTableProps {
  keywords: Keyword[];
  selectedKeyword: string | null;
  onKeywordSelect: (keyword: string) => void;
}

export function KeywordsTable({ keywords, selectedKeyword, onKeywordSelect }: KeywordsTableProps) {
  const topKeywords = keywords.slice(0, 10);

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
                <th className="text-left py-3 px-4 text-sm font-semibold text-white/80">
                  Keyword
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-white/80">
                  Volume
                </th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-white/80">
                  Competition
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-white/80">
                  CPC
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-white/80">
                  Top Page Bid
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-white/80">
                  3Mo Trend
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-white/80">
                  YoY Trend
                </th>
              </tr>
            </thead>
            <tbody>
              {topKeywords.map((keyword, index) => {
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
                        ${keyword.competition === 'low' ? 'bg-green-500/20 text-green-300' : ''}
                        ${keyword.competition === 'medium' ? 'bg-yellow-500/20 text-yellow-300' : ''}
                        ${keyword.competition === 'high' ? 'bg-red-500/20 text-red-300' : ''}
                      `}>
                        {keyword.competition || "N/A"}
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
