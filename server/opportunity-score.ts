/**
 * Opportunity Score Calculator (New Formula)
 * 
 * Calculates opportunity metrics based on:
 * - Volatility: Average relative deviation from exponential trend
 * - Trend Strength: (1 + YoY growth/100) / Volatility (transforms -100% to +∞ into 0 to +∞)
 * - Bid Efficiency: Top Page Bid / CPC
 * - TAC: Total Advertiser Cost = Volume * CPC
 * - SAC: Search Advertiser Cost = TAC * (1 - Competition/100)
 * - Opportunity Score: log(SAC) * Trend Strength * Bid Efficiency
 */

export interface OpportunityScoreInputs {
  volume: number;
  competition: number;
  cpc: number;
  topPageBid: number;
  growthYoy: number;
  monthlyData: { month: string; volume: number }[];
}

export interface OpportunityScoreResult {
  volatility: number;
  trendStrength: number;
  bidEfficiency: number;
  tac: number;
  sac: number;
  opportunityScore: number;
}

/**
 * Calculate volatility as average relative deviation from exponential trend
 * Exponential fit: growth_factor = last_month / first_month
 * For each month: predicted(t) = first_month * growth_factor^(t/11)
 * Volatility = average(|actual - predicted| / predicted)
 */
function calculateVolatility(monthlyData: { month: string; volume: number }[]): number {
  if (!monthlyData || monthlyData.length < 2) {
    return 0;
  }

  const volumes = monthlyData.map(d => d.volume);
  const firstMonth = volumes[0];
  const lastMonth = volumes[volumes.length - 1];

  // Avoid division by zero
  if (firstMonth === 0) {
    return 0;
  }

  // Calculate exponential growth factor
  const growthFactor = lastMonth / firstMonth;

  // Calculate relative deviations for each month
  const deviations: number[] = [];
  for (let t = 0; t < volumes.length; t++) {
    const predicted = firstMonth * Math.pow(growthFactor, t / (volumes.length - 1));
    
    // Avoid division by zero
    if (predicted === 0) {
      continue;
    }

    const relativeDeviation = Math.abs(volumes[t] - predicted) / predicted;
    deviations.push(relativeDeviation);
  }

  // Return average relative deviation
  if (deviations.length === 0) {
    return 0;
  }

  const avgDeviation = deviations.reduce((sum, d) => sum + d, 0) / deviations.length;
  return avgDeviation;
}

/**
 * Calculate Trend Strength = (1 + YoY Growth/100) / Volatility
 * Transforms growth from -100% to +infinity into 0 to +infinity
 * Examples: -100% → 0, -50% → 0.5, 0% → 1, +100% → 2
 * Clamps at 0 for extreme negative growth (< -100%)
 */
function calculateTrendStrength(growthYoy: number, volatility: number): number {
  // Avoid division by zero
  if (volatility === 0) {
    return 0;
  }

  // Transform growth: -100% becomes 0, 0% becomes 1, +100% becomes 2
  // Clamp at 0 to handle extreme negative growth (< -100%)
  const transformedGrowth = Math.max(0, 1 + (growthYoy / 100));

  const trendStrength = transformedGrowth / volatility;
  return trendStrength;
}

/**
 * Calculate Bid Efficiency = Top Page Bid / CPC
 */
function calculateBidEfficiency(topPageBid: number, cpc: number): number {
  // Avoid division by zero
  if (cpc === 0) {
    return 0;
  }

  return topPageBid / cpc;
}

/**
 * Calculate TAC (Total Advertiser Cost) = Volume * CPC
 */
function calculateTAC(volume: number, cpc: number): number {
  return volume * cpc;
}

/**
 * Calculate SAC = TAC * (1 - Competition/100)
 */
function calculateSAC(tac: number, competition: number): number {
  const competitionFactor = 1 - (competition / 100);
  return tac * competitionFactor;
}

/**
 * Calculate Opportunity Score = log(SAC) * Trend Strength * Bid Efficiency
 */
export function calculateOpportunityScore(inputs: OpportunityScoreInputs): OpportunityScoreResult {
  // Calculate derived metrics
  const volatility = calculateVolatility(inputs.monthlyData);
  const trendStrength = calculateTrendStrength(inputs.growthYoy, volatility);
  const bidEfficiency = calculateBidEfficiency(inputs.topPageBid, inputs.cpc);
  const tac = calculateTAC(inputs.volume, inputs.cpc);
  const sac = calculateSAC(tac, inputs.competition);

  // Calculate Opportunity Score
  // Use log10 for readability, add 1 to handle SAC=0 case
  let opportunityScore = 0;
  if (sac > 0) {
    opportunityScore = Math.log10(sac) * trendStrength * bidEfficiency;
  }

  return {
    volatility: Number(volatility.toFixed(4)),
    trendStrength: Number(trendStrength.toFixed(4)),
    bidEfficiency: Number(bidEfficiency.toFixed(4)),
    tac: Number(tac.toFixed(2)),
    sac: Number(sac.toFixed(2)),
    opportunityScore: Number(opportunityScore.toFixed(4)),
  };
}
