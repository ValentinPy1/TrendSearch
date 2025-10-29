import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { calculateOpportunityScore } from '../server/opportunity-score';

interface KeywordData {
    keyword: string;
    search_volume?: number;
    competition?: number;
    low_top_of_page_bid?: number;
    high_top_of_page_bid?: number;
    cpc?: number;
    '2025_09'?: number;
    '2025_08'?: number;
    '2025_07'?: number;
    '2025_06'?: number;
    '2025_05'?: number;
    '2025_04'?: number;
    '2025_03'?: number;
    '2025_02'?: number;
    '2025_01'?: number;
    '2024_12'?: number;
    '2024_11'?: number;
    '2024_10'?: number;
    'yoy_trend_%'?: number;
    '3month_trend_%'?: number;
    growth_slope?: number;
    growth_r2?: number;
    growth_consistency?: number;
    growth_stability?: number;
    sustained_growth_score?: number;
}

interface ProcessedKeywordData {
    monthlyData: Array<{ month: string; volume: number }>;
    volume: number;
    competition: number;
    cpc: string;
    topPageBid: string;
    growth3m: string;
    growthYoy: string;
    growthSlope: string;
    growthR2: string;
    growthConsistency: string;
    growthStability: string;
    sustainedGrowthScore: string;
}

interface OpportunityMetrics {
    volatility: number;
    trendStrength: number;
    bidEfficiency: number;
    tac: number;
    sac: number;
    opportunityScore: number;
}

interface PrecomputedData {
    [keyword: string]: {
        opportunityMetrics: OpportunityMetrics;
        processed: ProcessedKeywordData;
    };
}

async function precomputeOpportunityMetrics() {
    console.log('=== Precomputing Opportunity Metrics and Processed Keywords ===\n');

    // Load all keywords from CSV
    console.log('[1/5] Loading keywords from CSV...');
    const csvPath = path.join(process.cwd(), 'data', 'keywords_all.csv');

    if (!fs.existsSync(csvPath)) {
        throw new Error(`Keywords CSV file not found at ${csvPath}`);
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    const keywords = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        cast: (value, context) => {
            if (context.column && value === '') return null;
            if (!isNaN(Number(value))) return Number(value);
            return value;
        },
    }) as KeywordData[];

    console.log(`✓ Loaded ${keywords.length} keywords\n`);

    // Process keywords to get monthly data (same logic as processKeywords)
    console.log('[2/5] Processing keywords to generate processed data...');
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

    const processedKeywords = keywords.map((kw) => {
        const monthlyData = monthMapping.map(({ key, label }) => {
            return {
                month: label,
                volume: Math.floor(
                    (kw[key as keyof typeof kw] as number) || kw.search_volume || 0,
                ),
            };
        });

        // Calculate 3M growth: Compare last month (Sep) to 3 months ago (Jun)
        let growth3m = 0;
        if (monthlyData.length >= 4) {
            const currentVolume = monthlyData[monthlyData.length - 1].volume; // Sep (index 11)
            const threeMonthsAgo = monthlyData[monthlyData.length - 4].volume; // Jun (index 8)
            if (threeMonthsAgo !== 0) {
                growth3m = ((currentVolume - threeMonthsAgo) / threeMonthsAgo) * 100;
            }
        }

        // Calculate YoY growth: Compare last month (Sep) to first month (Oct)
        let growthYoy = 0;
        if (monthlyData.length >= 12) {
            const currentVolume = monthlyData[monthlyData.length - 1].volume;
            const oneYearAgo = monthlyData[0].volume;
            if (oneYearAgo !== 0) {
                growthYoy = ((currentVolume - oneYearAgo) / oneYearAgo) * 100;
            }
        }

        return {
            keyword: kw.keyword,
            volume: Math.floor(kw.search_volume || 0),
            competition: Math.floor(kw.competition || 0),
            cpc: parseFloat(String(kw.cpc || "0")),
            topPageBid: parseFloat(String(kw.high_top_of_page_bid || kw.low_top_of_page_bid || "0")),
            growth3m,
            growthYoy,
            monthlyData,
            growthSlope: kw.growth_slope || 0,
            growthR2: kw.growth_r2 || 0,
            growthConsistency: kw.growth_consistency || 0,
            growthStability: kw.growth_stability || 0,
            sustainedGrowthScore: kw.sustained_growth_score || 0,
        };
    });

    console.log(`✓ Processed ${processedKeywords.length} keywords\n`);

    // Calculate opportunity metrics for each keyword
    console.log('[3/5] Calculating opportunity metrics...');
    const precomputedData: PrecomputedData = {};

    for (let i = 0; i < processedKeywords.length; i++) {
        if (i % 1000 === 0 && i > 0) {
            console.log(`  Progress: ${i}/${processedKeywords.length} (${Math.round((i / processedKeywords.length) * 100)}%)`);
        }

        const kw = processedKeywords[i];

        // Calculate opportunity metrics
        let opportunityMetrics: OpportunityMetrics;
        try {
            const metrics = calculateOpportunityScore({
                volume: kw.volume,
                competition: kw.competition,
                cpc: kw.cpc,
                topPageBid: kw.topPageBid,
                growthYoy: kw.growthYoy,
                monthlyData: kw.monthlyData,
            });

            opportunityMetrics = {
                volatility: metrics.volatility,
                trendStrength: metrics.trendStrength,
                bidEfficiency: metrics.bidEfficiency,
                tac: metrics.tac,
                sac: metrics.sac,
                opportunityScore: metrics.opportunityScore,
            };
        } catch (error) {
            console.error(`Error calculating metrics for keyword "${kw.keyword}":`, error);
            // Store zero values if calculation fails
            opportunityMetrics = {
                volatility: 0,
                trendStrength: 0,
                bidEfficiency: 0,
                tac: 0,
                sac: 0,
                opportunityScore: 0,
            };
        }

        // Format processed data as strings (matching processKeywords output)
        const processed: ProcessedKeywordData = {
            monthlyData: kw.monthlyData,
            volume: kw.volume,
            competition: kw.competition,
            cpc: kw.cpc.toFixed(2),
            topPageBid: kw.topPageBid.toFixed(2),
            growth3m: kw.growth3m.toFixed(2),
            growthYoy: kw.growthYoy.toFixed(2),
            growthSlope: kw.growthSlope.toFixed(2),
            growthR2: kw.growthR2.toFixed(4),
            growthConsistency: kw.growthConsistency.toFixed(4),
            growthStability: kw.growthStability.toFixed(4),
            sustainedGrowthScore: kw.sustainedGrowthScore.toFixed(4),
        };

        precomputedData[kw.keyword] = {
            opportunityMetrics,
            processed,
        };
    }

    console.log(`  Progress: ${processedKeywords.length}/${processedKeywords.length} (100%)`);
    console.log(`✓ Calculated metrics and processed data for ${Object.keys(precomputedData).length} keywords\n`);

    // Save precomputed data to JSON file
    console.log('[4/5] Saving precomputed data to JSON...');
    const outputPath = path.join(process.cwd(), 'data', 'precomputed_opportunity_metrics.json');

    // Save with pretty formatting for debugging, but could be minified for production
    fs.writeFileSync(outputPath, JSON.stringify(precomputedData, null, 2));

    const fileSizeMB = fs.statSync(outputPath).size / 1024 / 1024;
    console.log(`✓ Saved precomputed data to ${path.basename(outputPath)} (${fileSizeMB.toFixed(2)} MB)\n`);

    console.log('[5/5] Summary');
    console.log('=== Precomputation Complete ===');
    console.log(`Total keywords: ${Object.keys(precomputedData).length}`);
    console.log(`Data file: ${outputPath}`);
}

precomputeOpportunityMetrics().catch(error => {
    console.error('Error precomputing opportunity metrics:', error);
    process.exit(1);
});

