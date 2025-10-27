/**
 * Opportunity Score Calculator
 * 
 * Calculates a comprehensive 0-100 opportunity index based on:
 * - Market Size (volume)
 * - Growth Momentum (3m + YoY)
 * - Stability/Quality (consistency, stability, R²)
 * - Competition (inverse)
 * - CPC Attractiveness (TopBid vs CPC spread)
 * - Ad Efficiency (margin between TopBid and CPC)
 */

// Logistic function (sigmoid)
function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

interface OpportunityScoreInputs {
  volume: number;
  competition: number;
  cpc: number;
  topPageBid: number;
  growth3m: number;
  growthYoy: number;
  growthConsistency: number;
  growthStability: number;
  growthR2: number;
}

interface ComponentScores {
  marketSize: number;
  growthMomentum: number;
  stabilityQuality: number;
  competition: number;
  cpcAttractiveness: number;
  adEfficiency: number;
}

/**
 * Calculate normalized Market Size score (0-1)
 * Uses log10 transform + logistic to handle wide value ranges
 */
function calculateMarketSize(volume: number): number {
  const logVolume = Math.log10(volume + 1);
  const muMS = Math.log10(100); // Center at median reference ~100
  const alphaMS = 2; // Slope control
  const z = alphaMS * (logVolume - muMS);
  return sigmoid(z);
}

/**
 * Calculate normalized Growth Momentum score (0-1)
 * Combines 3-month and YoY growth using log1p transform
 */
function calculateGrowthMomentum(growth3m: number, growthYoy: number): number {
  // Convert percentages to decimals if needed
  const g3m = growth3m / 100;
  const gYoy = growthYoy / 100;
  
  // Average of log-transformed growths
  const g = (Math.log(1 + g3m) + Math.log(1 + gYoy)) / 2;
  
  const muG = Math.log(1 + 0.05); // Baseline 5% growth
  const alphaG = 6; // Steeper slope
  const z = alphaG * (g - muG);
  return sigmoid(z);
}

/**
 * Calculate normalized Stability/Quality score (0-1)
 * Weighted combination of consistency, stability, and R²
 */
function calculateStabilityQuality(
  consistency: number,
  stability: number,
  r2: number
): number {
  const wC = 0.3; // Consistency weight
  const wS = 0.5; // Stability weight
  const wR = 0.2; // R² weight
  
  return wC * consistency + wS * stability + wR * r2;
}

/**
 * Calculate normalized Competition score (0-1)
 * Lower competition = higher score (inverted)
 */
function calculateCompetition(competition: number): number {
  return 1 - (competition / 100);
}

/**
 * Calculate normalized CPC Attractiveness score (0-1)
 * Positive spread (TopBid > CPC) indicates stronger advertiser value
 */
function calculateCPCAttractiveness(cpc: number, topPageBid: number): number {
  const d = Math.log10(1 + topPageBid) - Math.log10(1 + cpc);
  const muC = 0; // Center at 0
  const alphaC = 8; // Slope
  const z = alphaC * (d - muC);
  return sigmoid(z);
}

/**
 * Calculate normalized Ad Efficiency score (0-1)
 * Fraction of top-bid not consumed by CPC
 */
function calculateAdEfficiency(cpc: number, topPageBid: number): number {
  const epsilon = 1e-6; // Prevent division by zero
  const rawRatio = (topPageBid - cpc) / (topPageBid + epsilon);
  
  // Map to 0-1 using logistic
  const alpha = 8;
  const mu = 0;
  const z = alpha * (rawRatio - mu);
  return sigmoid(z);
}

/**
 * Calculate comprehensive Opportunity Index (0-100)
 */
export function calculateOpportunityScore(inputs: OpportunityScoreInputs): {
  opportunityScore: number;
  components: ComponentScores;
} {
  // Calculate individual component scores (0-1)
  const sMS = calculateMarketSize(inputs.volume);
  const sGM = calculateGrowthMomentum(inputs.growth3m, inputs.growthYoy);
  const sSQ = calculateStabilityQuality(
    inputs.growthConsistency,
    inputs.growthStability,
    inputs.growthR2
  );
  const sCMP = calculateCompetition(inputs.competition);
  const sCPCa = calculateCPCAttractiveness(inputs.cpc, inputs.topPageBid);
  const sAE = calculateAdEfficiency(inputs.cpc, inputs.topPageBid);

  // Component scores for debugging/display
  const components: ComponentScores = {
    marketSize: sMS,
    growthMomentum: sGM,
    stabilityQuality: sSQ,
    competition: sCMP,
    cpcAttractiveness: sCPCa,
    adEfficiency: sAE,
  };

  // Suggested weights (balanced for idea evaluation)
  const weights = {
    marketSize: 0.25,
    growthMomentum: 0.20,
    stabilityQuality: 0.15,
    competition: 0.15,
    cpcAttractiveness: 0.15,
    adEfficiency: 0.10,
  };

  // Weighted sum (0-1)
  const opportunityRaw =
    weights.marketSize * sMS +
    weights.growthMomentum * sGM +
    weights.stabilityQuality * sSQ +
    weights.competition * sCMP +
    weights.cpcAttractiveness * sCPCa +
    weights.adEfficiency * sAE;

  // Scale to 0-100
  const opportunityScore = Math.round(opportunityRaw * 100);

  return {
    opportunityScore,
    components,
  };
}
