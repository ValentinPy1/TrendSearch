/**
 * Opportunity Score Calculator (New Formula)
 * 
 * Calculates opportunity metrics based on:
 * - Volatility: Average relative deviation from exponential trend
 * - Trend Strength: (1 + YoY Growth/100) / (1 + Volatility) - transforms growth to 0-∞ range, prevents low-volatility explosion
 * - Bid Efficiency: Top Page Bid / CPC
 * - TAC: Total Advertiser Cost = Volume * CPC
 * - SAC: Search Advertiser Cost = TAC * (101 - Competition)/100
 * - Opportunity Score: log(SAC) * Trend Strength * sqrt(Bid Efficiency)
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
 * Calculate Trend Strength = (1 + YoY Growth/100) / (1 + Volatility)
 * Transforms growth from -100% to +∞ into 0 to +∞, then divides by (1 + volatility)
 * This prevents explosion at low volatility while maintaining meaningful scale
 * Examples with volatility 0.1:
 *   -100% growth → 0 / 1.1 = 0
 *   -50% growth → 0.5 / 1.1 = 0.45
 *   0% growth → 1 / 1.1 = 0.91
 *   +100% growth → 2 / 1.1 = 1.82
 */
function calculateTrendStrength(growthYoy: number, volatility: number): number {
    const transformedGrowth = Math.max(0, 1 + (growthYoy / 100));
    const trendStrength = transformedGrowth / (1 + volatility);
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
 * Calculate SAC = TAC * (101 - Competition)/100
 */
function calculateSAC(tac: number, competition: number): number {
    const competitionFactor = (101 - competition) / 100;
    return tac * competitionFactor;
}

/**
 * Calculate Opportunity Score = log(SAC) * Trend Strength * sqrt(Bid Efficiency)
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
        const sac_factor = Math.pow(Math.log10(sac), 2);
        const trend_factor = Math.sqrt(trendStrength);
        const bid_factor = Math.sqrt(bidEfficiency);
        opportunityScore = sac_factor * trend_factor * bid_factor;
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
