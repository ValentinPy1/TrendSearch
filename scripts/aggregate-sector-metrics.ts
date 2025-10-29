import * as fs from 'fs';
import * as path from 'path';
import { keywordVectorService } from '../server/keyword-vector-service';
import { calculateOpportunityScore } from '../server/opportunity-score';

interface SectorData {
    sector: string;
    user_types: string[];
    product_fits: string[];
}

interface ProcessedKeyword {
    keyword: string;
    volume: number;
    competition: number;
    cpc: number;
    topPageBid: number;
    growth3m: number;
    growthYoy: number;
    similarityScore: number;
    monthlyData: Array<{ month: string; volume: number }>;
    precomputedMetrics?: {
        volatility: number;
        trendStrength: number;
        bidEfficiency: number;
        tac: number;
        sac: number;
        opportunityScore: number;
    };
}

interface AggregatedMetrics {
    avgVolume: number;
    avgGrowth3m: number;
    avgGrowthYoy: number;
    avgCompetition: number;
    avgCpc: number;
    avgTopPageBid: number;
    volatility: number;
    trendStrength: number;
    bidEfficiency: number;
    tac: number;
    sac: number;
    opportunityScore: number;
}

interface SectorMetricResult {
    keywordCount: number;
    aggregatedMetrics: AggregatedMetrics;
    monthlyTrendData: Array<{ month: string; volume: number }>;
    topKeywords: Array<{
        keyword: string;
        similarityScore: number;
        volume: number;
        growth3m: number;
        growthYoy: number;
        opportunityScore?: number;
    }>;
}

interface SectorAggregateResult {
    sector: string;
    userTypeCount: number;
    productFitCount: number;
    aggregatedMetrics: AggregatedMetrics;
    monthlyTrendData: Array<{ month: string; volume: number }>;
}

interface OutputData {
    user_types: Record<string, SectorMetricResult>;
    product_fits: Record<string, SectorMetricResult>;
    sectors: Record<string, SectorAggregateResult>;
    metadata: {
        totalUserTypes: number;
        totalProductFits: number;
        totalSectors: number;
        generatedAt: string;
    };
}

async function processKeywords(rawKeywords: any[]): Promise<ProcessedKeyword[]> {
    // Map CSV columns (2024_10 through 2025_09) to correct month labels in chronological order
    const monthMapping = [
        { key: "2024_10", label: "Oct" },
        { key: "2024_11", label: "Nov" },
        { key: "2024_12", label: "Dec" },
        { key: "2025_01", label: "Jan" },
        { key: "2025_02", label: "Feb" },
        { key: "2025_03", label: "Mar" },
        { key: "2025_04", label: "Apr" },
        { key: "2025_05", label: "May" },
        { key: "2025_06", label: "Jun" },
        { key: "2025_07", label: "Jul" },
        { key: "2025_08", label: "Aug" },
        { key: "2025_09", label: "Sep" },
    ];

    return rawKeywords.map((kw) => {
        // Convert monthly data from CSV format to app format with correct month labels
        const monthlyData = monthMapping.map(({ key, label }) => {
            return {
                month: label,
                volume: Math.floor(
                    (kw[key as keyof typeof kw] as number) || kw.search_volume || 0,
                ),
            };
        });

        // Calculate growth from chronologically ordered monthlyData
        let growth3m = 0;
        if (monthlyData.length >= 4) {
            const currentVolume = monthlyData[monthlyData.length - 1].volume;
            const threeMonthsAgo = monthlyData[monthlyData.length - 4].volume;
            if (threeMonthsAgo !== 0) {
                growth3m = ((currentVolume - threeMonthsAgo) / threeMonthsAgo) * 100;
            }
        }

        let growthYoy = 0;
        if (monthlyData.length >= 12) {
            const currentVolume = monthlyData[monthlyData.length - 1].volume;
            const oneYearAgo = monthlyData[0].volume;
            if (oneYearAgo !== 0) {
                growthYoy = ((currentVolume - oneYearAgo) / oneYearAgo) * 100;
            }
        }

        const similarityScore = typeof kw.similarityScore === 'number' 
            ? kw.similarityScore 
            : parseFloat(kw.similarityScore || "0");

        const result: ProcessedKeyword = {
            keyword: kw.keyword,
            volume: Math.floor(kw.search_volume || 0),
            competition: Math.floor(kw.competition || 0),
            cpc: parseFloat(String(kw.cpc || "0")),
            topPageBid: parseFloat(String(
                kw.high_top_of_page_bid || kw.low_top_of_page_bid || "0"
            )),
            growth3m,
            growthYoy,
            similarityScore,
            monthlyData,
        };

        // Preserve precomputed metrics if available
        if ((kw as any).precomputedMetrics) {
            result.precomputedMetrics = (kw as any).precomputedMetrics;
        }

        return result;
    });
}

function calculateWeightedAverage(
    keywords: ProcessedKeyword[],
    getValue: (k: ProcessedKeyword) => number
): number {
    if (keywords.length === 0) return 0;

    const totalWeight = keywords.reduce((sum, k) => {
        const matchPct = k.similarityScore || 0;
        const volume = k.volume || 0;
        const weight = (matchPct * matchPct) * Math.sqrt(volume);
        return sum + weight;
    }, 0);

    if (totalWeight === 0) return 0;

    const weightedSum = keywords.reduce((sum, k) => {
        const matchPct = k.similarityScore || 0;
        const volume = k.volume || 0;
        const weight = (matchPct * matchPct) * Math.sqrt(volume);
        const value = getValue(k);
        if (isNaN(weight) || isNaN(value)) return sum;
        return sum + (value * weight);
    }, 0);

    return weightedSum / totalWeight;
}

function calculateVolumeAverage(keywords: ProcessedKeyword[]): number {
    if (keywords.length === 0) return 0;

    const totalWeight = keywords.reduce((sum, k) => {
        const matchPct = k.similarityScore || 0;
        const weight = matchPct * matchPct;
        return sum + weight;
    }, 0);

    if (totalWeight === 0) return 0;

    const weightedSumOfSqrts = keywords.reduce((sum, k) => {
        const matchPct = k.similarityScore || 0;
        const volume = k.volume || 0;
        const weight = matchPct * matchPct;
        if (isNaN(weight) || isNaN(volume) || volume < 0) return sum;
        return sum + (Math.sqrt(volume) * weight);
    }, 0);

    const avgSqrt = weightedSumOfSqrts / totalWeight;
    return avgSqrt * avgSqrt;
}

function aggregateMonthlyTrend(keywords: ProcessedKeyword[]): Array<{ month: string; volume: number }> {
    if (!keywords || keywords.length === 0) return [];

    const firstKeyword = keywords.find(k => k.monthlyData && k.monthlyData.length > 0);
    if (!firstKeyword || !firstKeyword.monthlyData) return [];

    const months = firstKeyword.monthlyData.map(m => m.month);

    return months.map((month, monthIndex) => {
        const totalWeight = keywords.reduce((sum, k) => {
            const matchPct = k.similarityScore || 0;
            const weight = matchPct * matchPct;
            return sum + weight;
        }, 0);

        if (totalWeight === 0) return { month, volume: 0 };

        const weightedSumOfSqrts = keywords.reduce((sum, k) => {
            const matchPct = k.similarityScore || 0;
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

function aggregateMetricsFromResults(
    results: SectorMetricResult[]
): AggregatedMetrics {
    if (results.length === 0) {
        return {
            avgVolume: 0,
            avgGrowth3m: 0,
            avgGrowthYoy: 0,
            avgCompetition: 0,
            avgCpc: 0,
            avgTopPageBid: 0,
            volatility: 0,
            trendStrength: 0,
            bidEfficiency: 0,
            tac: 0,
            sac: 0,
            opportunityScore: 0,
        };
    }

    // Use keywordCount as weight (similar to how volume was used)
    // Since all user_types/product_fits are equally relevant to sector, use weight = √(keywordCount)
    const totalWeight = results.reduce((sum, r) => {
        const keywordCount = r.keywordCount || 0;
        const weight = Math.sqrt(keywordCount);
        return sum + weight;
    }, 0);

    if (totalWeight === 0) {
        return {
            avgVolume: 0,
            avgGrowth3m: 0,
            avgGrowthYoy: 0,
            avgCompetition: 0,
            avgCpc: 0,
            avgTopPageBid: 0,
            volatility: 0,
            trendStrength: 0,
            bidEfficiency: 0,
            tac: 0,
            sac: 0,
            opportunityScore: 0,
        };
    }

    // Weighted average for most metrics
    const getWeightedAverage = (getValue: (m: AggregatedMetrics) => number) => {
        const weightedSum = results.reduce((sum, r) => {
            const keywordCount = r.keywordCount || 0;
            const weight = Math.sqrt(keywordCount);
            const value = getValue(r.aggregatedMetrics);
            if (isNaN(weight) || isNaN(value)) return sum;
            return sum + (value * weight);
        }, 0);
        return weightedSum / totalWeight;
    };

    // Volume: use same formula - average √volumes then square
    const weightedSumOfSqrts = results.reduce((sum, r) => {
        const keywordCount = r.keywordCount || 0;
        const weight = Math.sqrt(keywordCount);
        const volume = r.aggregatedMetrics.avgVolume || 0;
        if (isNaN(weight) || isNaN(volume) || volume < 0) return sum;
        return sum + (Math.sqrt(volume) * weight);
    }, 0);
    const avgSqrt = weightedSumOfSqrts / totalWeight;
    const avgVolume = avgSqrt * avgSqrt;

    return {
        avgVolume,
        avgGrowth3m: getWeightedAverage(m => m.avgGrowth3m),
        avgGrowthYoy: getWeightedAverage(m => m.avgGrowthYoy),
        avgCompetition: getWeightedAverage(m => m.avgCompetition),
        avgCpc: getWeightedAverage(m => m.avgCpc),
        avgTopPageBid: getWeightedAverage(m => m.avgTopPageBid),
        volatility: getWeightedAverage(m => m.volatility),
        trendStrength: getWeightedAverage(m => m.trendStrength),
        bidEfficiency: getWeightedAverage(m => m.bidEfficiency),
        tac: getWeightedAverage(m => m.tac),
        sac: getWeightedAverage(m => m.sac),
        opportunityScore: getWeightedAverage(m => m.opportunityScore),
    };
}

function aggregateMonthlyTrendFromResults(
    results: SectorMetricResult[]
): Array<{ month: string; volume: number }> {
    if (!results || results.length === 0) return [];

    const firstResult = results.find(r => r.monthlyTrendData && r.monthlyTrendData.length > 0);
    if (!firstResult || !firstResult.monthlyTrendData) return [];

    const months = firstResult.monthlyTrendData.map(m => m.month);

    return months.map((month, monthIndex) => {
        // Weight by √(keywordCount)
        const totalWeight = results.reduce((sum, r) => {
            const keywordCount = r.keywordCount || 0;
            const weight = Math.sqrt(keywordCount);
            return sum + weight;
        }, 0);

        if (totalWeight === 0) return { month, volume: 0 };

        // Average √volumes then square
        const weightedSumOfSqrts = results.reduce((sum, r) => {
            const keywordCount = r.keywordCount || 0;
            const weight = Math.sqrt(keywordCount);

            if (!r.monthlyTrendData || !r.monthlyTrendData[monthIndex]) return sum;

            const volume = r.monthlyTrendData[monthIndex].volume || 0;
            return sum + (Math.sqrt(volume) * weight);
        }, 0);

        const avgSqrt = weightedSumOfSqrts / totalWeight;
        const avgVolume = Math.round(avgSqrt * avgSqrt);

        return { month, volume: avgVolume };
    });
}

async function aggregateSectorMetrics(query: string): Promise<SectorMetricResult> {
    // Find top 100 similar keywords
    const similarKeywords = await keywordVectorService.findSimilarKeywords(query, 100);
    
    // Process keywords to app format
    const processedKeywords = await processKeywords(similarKeywords);
    
    // Ensure opportunity metrics exist for each keyword
    for (const kw of processedKeywords) {
        if (!kw.precomputedMetrics) {
            // Calculate opportunity metrics on the fly
            const metrics = calculateOpportunityScore({
                volume: kw.volume,
                competition: kw.competition,
                cpc: kw.cpc,
                topPageBid: kw.topPageBid,
                growthYoy: kw.growthYoy,
                monthlyData: kw.monthlyData,
            });
            kw.precomputedMetrics = metrics;
        }
    }

    // Calculate aggregated metrics
    const aggregatedMetrics: AggregatedMetrics = {
        avgVolume: calculateVolumeAverage(processedKeywords),
        avgGrowth3m: calculateWeightedAverage(processedKeywords, k => k.growth3m),
        avgGrowthYoy: calculateWeightedAverage(processedKeywords, k => k.growthYoy),
        avgCompetition: calculateWeightedAverage(processedKeywords, k => k.competition),
        avgCpc: calculateWeightedAverage(processedKeywords, k => k.cpc),
        avgTopPageBid: calculateWeightedAverage(processedKeywords, k => k.topPageBid),
        volatility: calculateWeightedAverage(processedKeywords, k => k.precomputedMetrics?.volatility || 0),
        trendStrength: calculateWeightedAverage(processedKeywords, k => k.precomputedMetrics?.trendStrength || 0),
        bidEfficiency: calculateWeightedAverage(processedKeywords, k => k.precomputedMetrics?.bidEfficiency || 0),
        tac: calculateWeightedAverage(processedKeywords, k => k.precomputedMetrics?.tac || 0),
        sac: calculateWeightedAverage(processedKeywords, k => k.precomputedMetrics?.sac || 0),
        opportunityScore: calculateWeightedAverage(processedKeywords, k => k.precomputedMetrics?.opportunityScore || 0),
    };

    // Aggregate monthly trend data
    const monthlyTrendData = aggregateMonthlyTrend(processedKeywords);

    // Get top 10 keywords for reference
    const topKeywords = processedKeywords
        .slice(0, 10)
        .map(k => ({
            keyword: k.keyword,
            similarityScore: k.similarityScore,
            volume: k.volume,
            growth3m: k.growth3m,
            growthYoy: k.growthYoy,
            opportunityScore: k.precomputedMetrics?.opportunityScore,
        }));

    return {
        keywordCount: processedKeywords.length,
        aggregatedMetrics,
        monthlyTrendData,
        topKeywords,
    };
}

async function aggregateSectorMetricsMain() {
    console.log('=== Aggregating Sector Metrics ===\n');

    // Load sectors.json
    console.log('[1/4] Loading sectors.json...');
    const sectorsPath = path.join(process.cwd(), 'data', 'sectors.json');
    if (!fs.existsSync(sectorsPath)) {
        throw new Error(`Sectors file not found at ${sectorsPath}`);
    }

    const sectors: SectorData[] = JSON.parse(fs.readFileSync(sectorsPath, 'utf-8'));
    console.log(`✓ Loaded ${sectors.length} sectors\n`);

    // Extract unique user_types and product_fits
    console.log('[2/4] Extracting unique user_types and product_fits...');
    const userTypesSet = new Set<string>();
    const productFitsSet = new Set<string>();

    for (const sector of sectors) {
        sector.user_types.forEach(ut => userTypesSet.add(ut));
        sector.product_fits.forEach(pf => productFitsSet.add(pf));
    }

    const uniqueUserTypes = Array.from(userTypesSet);
    const uniqueProductFits = Array.from(productFitsSet);

    console.log(`✓ Found ${uniqueUserTypes.length} unique user_types`);
    console.log(`✓ Found ${uniqueProductFits.length} unique product_fits\n`);

    // Initialize KeywordVectorService
    console.log('[3/4] Initializing KeywordVectorService...');
    await keywordVectorService.initialize();
    console.log('✓ KeywordVectorService initialized\n');

    // Process user_types
    console.log(`[4/4] Processing ${uniqueUserTypes.length} user_types and ${uniqueProductFits.length} product_fits...`);
    const output: OutputData = {
        user_types: {},
        product_fits: {},
        sectors: {},
        metadata: {
            totalUserTypes: uniqueUserTypes.length,
            totalProductFits: uniqueProductFits.length,
            totalSectors: sectors.length,
            generatedAt: new Date().toISOString(),
        },
    };

    const totalItems = uniqueUserTypes.length + uniqueProductFits.length;
    let processed = 0;

    // Process user_types
    for (const userType of uniqueUserTypes) {
        try {
            output.user_types[userType] = await aggregateSectorMetrics(userType);
            processed++;
            if (processed % 10 === 0 || processed === uniqueUserTypes.length) {
                console.log(`  User types: ${processed}/${uniqueUserTypes.length} (${Math.round((processed / uniqueUserTypes.length) * 100)}%)`);
            }
        } catch (error) {
            console.error(`  Error processing user_type "${userType}":`, error);
        }
    }

    // Process product_fits
    processed = 0;
    for (const productFit of uniqueProductFits) {
        try {
            output.product_fits[productFit] = await aggregateSectorMetrics(productFit);
            processed++;
            if (processed % 10 === 0 || processed === uniqueProductFits.length) {
                console.log(`  Product fits: ${processed}/${uniqueProductFits.length} (${Math.round((processed / uniqueProductFits.length) * 100)}%)`);
            }
        } catch (error) {
            console.error(`  Error processing product_fit "${productFit}":`, error);
        }
    }

    // Aggregate sectors from their user_types and product_fits
    console.log(`\n[Aggregating] Processing ${sectors.length} sectors...`);
    for (const sector of sectors) {
        try {
            const sectorResults: SectorMetricResult[] = [];

            // Collect all user_types results for this sector
            for (const userType of sector.user_types) {
                const result = output.user_types[userType];
                if (result) {
                    sectorResults.push(result);
                }
            }

            // Collect all product_fits results for this sector
            for (const productFit of sector.product_fits) {
                const result = output.product_fits[productFit];
                if (result) {
                    sectorResults.push(result);
                }
            }

            if (sectorResults.length === 0) {
                console.warn(`  Warning: No results found for sector "${sector.sector}"`);
                continue;
            }

            // Aggregate metrics from all user_types and product_fits
            const aggregatedMetrics = aggregateMetricsFromResults(sectorResults);
            const monthlyTrendData = aggregateMonthlyTrendFromResults(sectorResults);

            output.sectors[sector.sector] = {
                sector: sector.sector,
                userTypeCount: sector.user_types.length,
                productFitCount: sector.product_fits.length,
                aggregatedMetrics,
                monthlyTrendData,
            };
        } catch (error) {
            console.error(`  Error aggregating sector "${sector.sector}":`, error);
        }
    }

    console.log(`✓ Aggregated ${Object.keys(output.sectors).length} sectors\n`);

    // Save results
    console.log('\n[Saving] Writing results to file...');
    const outputPath = path.join(process.cwd(), 'data', 'sectors_aggregated_metrics.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    const fileSizeMB = fs.statSync(outputPath).size / 1024 / 1024;
    console.log(`✓ Saved aggregated metrics to ${path.basename(outputPath)} (${fileSizeMB.toFixed(2)} MB)\n`);

    console.log('=== Aggregation Complete ===');
    console.log(`Total user_types processed: ${Object.keys(output.user_types).length}`);
    console.log(`Total product_fits processed: ${Object.keys(output.product_fits).length}`);
    console.log(`Total sectors aggregated: ${Object.keys(output.sectors).length}`);
}

aggregateSectorMetricsMain().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});

