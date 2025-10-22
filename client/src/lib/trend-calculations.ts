import type { Keyword } from "@shared/schema";

export interface TrendDataPoint {
  month: string;
  volume: number;
}

export interface TrendGrowthMetrics {
  growth3m: number;
  growthYoy: number;
}

// Calculate weighted average trend data using weight = (match%)²
export function calculateAverageTrendData(keywords: Keyword[]): TrendDataPoint[] {
  if (!keywords || keywords.length === 0) return [];

  const firstKeyword = keywords.find(k => k.monthlyData && k.monthlyData.length > 0);
  if (!firstKeyword || !firstKeyword.monthlyData) return [];

  const months = firstKeyword.monthlyData.map(m => m.month);

  return months.map((month, monthIndex) => {
    // Calculate total weight
    const totalWeight = keywords.reduce((sum, k) => {
      const scoreStr = k.similarityScore || "0";
      const matchPct = parseFloat(scoreStr.replace('%', '')) / 100;
      const weight = matchPct * matchPct;
      return sum + weight;
    }, 0);

    if (totalWeight === 0) return { month, volume: 0 };

    // Calculate weighted sum of square roots
    const weightedSumOfSqrts = keywords.reduce((sum, k) => {
      const scoreStr = k.similarityScore || "0";
      const matchPct = parseFloat(scoreStr.replace('%', '')) / 100;
      const weight = matchPct * matchPct;
      
      if (!k.monthlyData || !k.monthlyData[monthIndex]) return sum;
      
      const volume = k.monthlyData[monthIndex].volume || 0;
      return sum + (Math.sqrt(volume) * weight);
    }, 0);

    const avgSqrt = weightedSumOfSqrts / totalWeight;
    const avgVolume = Math.round(avgSqrt * avgSqrt);

    return { month, volume: avgVolume };
  });
}

// Calculate 3M and YoY growth from trend data
export function calculateGrowthFromTrend(trendData: TrendDataPoint[]): TrendGrowthMetrics {
  if (trendData.length === 0) {
    return { growth3m: 0, growthYoy: 0 };
  }

  // 3M Growth
  let growth3m = 0;
  if (trendData.length >= 4) {
    const currentVolume = trendData[trendData.length - 1].volume;
    const threeMonthsAgo = trendData[trendData.length - 4].volume;
    if (threeMonthsAgo !== 0) {
      growth3m = ((currentVolume - threeMonthsAgo) / threeMonthsAgo) * 100;
    }
  }

  // YoY Growth
  let growthYoy = 0;
  if (trendData.length >= 12) {
    const currentVolume = trendData[trendData.length - 1].volume;
    const oneYearAgo = trendData[0].volume;
    if (oneYearAgo !== 0) {
      growthYoy = ((currentVolume - oneYearAgo) / oneYearAgo) * 100;
    }
  }

  return { growth3m, growthYoy };
}
