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
    const csvPath = path.join(process.cwd(), 'new_keywords', 'keywords_data.csv');

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
    // All 48 months of data (2021_11 to 2025_09)
    const allMonths = [
        { key: "2021_11", label: "Nov 2021" },
        { key: "2021_12", label: "Dec 2021" },
        { key: "2022_01", label: "Jan 2022" },
        { key: "2022_02", label: "Feb 2022" },
        { key: "2022_03", label: "Mar 2022" },
        { key: "2022_04", label: "Apr 2022" },
        { key: "2022_05", label: "May 2022" },
        { key: "2022_06", label: "Jun 2022" },
        { key: "2022_07", label: "Jul 2022" },
        { key: "2022_08", label: "Aug 2022" },
        { key: "2022_09", label: "Sep 2022" },
        { key: "2022_10", label: "Oct 2022" },
        { key: "2022_11", label: "Nov 2022" },
        { key: "2022_12", label: "Dec 2022" },
        { key: "2023_01", label: "Jan 2023" },
        { key: "2023_02", label: "Feb 2023" },
        { key: "2023_03", label: "Mar 2023" },
        { key: "2023_04", label: "Apr 2023" },
        { key: "2023_05", label: "May 2023" },
        { key: "2023_06", label: "Jun 2023" },
        { key: "2023_07", label: "Jul 2023" },
        { key: "2023_08", label: "Aug 2023" },
        { key: "2023_09", label: "Sep 2023" },
        { key: "2023_10", label: "Oct 2023" },
        { key: "2023_11", label: "Nov 2023" },
        { key: "2023_12", label: "Dec 2023" },
        { key: "2024_01", label: "Jan 2024" },
        { key: "2024_02", label: "Feb 2024" },
        { key: "2024_03", label: "Mar 2024" },
        { key: "2024_04", label: "Apr 2024" },
        { key: "2024_05", label: "May 2024" },
        { key: "2024_06", label: "Jun 2024" },
        { key: "2024_07", label: "Jul 2024" },
        { key: "2024_08", label: "Aug 2024" },
        { key: "2024_09", label: "Sep 2024" },
        { key: "2024_10", label: "Oct 2024" },
        { key: "2024_11", label: "Nov 2024" },
        { key: "2024_12", label: "Dec 2024" },
        { key: "2025_01", label: "Jan 2025" },
        { key: "2025_02", label: "Feb 2025" },
        { key: "2025_03", label: "Mar 2025" },
        { key: "2025_04", label: "Apr 2025" },
        { key: "2025_05", label: "May 2025" },
        { key: "2025_06", label: "Jun 2025" },
        { key: "2025_07", label: "Jul 2025" },
        { key: "2025_08", label: "Aug 2025" },
        { key: "2025_09", label: "Sep 2025" },
    ];

    const processedKeywords = keywords.map((kw) => {
        const monthlyData = allMonths.map(({ key, label }) => {
            return {
                month: label,
                volume: Math.floor(
                    (kw[key as keyof typeof kw] as number) || kw.search_volume || 0,
                ),
            };
        });

        // Calculate 3M growth: Compare last month (Sep 2025) to 3 months ago (Jun 2025)
        let growth3m = 0;
        if (monthlyData.length >= 4) {
            const currentVolume = monthlyData[monthlyData.length - 1].volume; // Sep 2025
            const threeMonthsAgo = monthlyData[monthlyData.length - 4].volume; // Jun 2025
            if (threeMonthsAgo !== 0) {
                growth3m = ((currentVolume - threeMonthsAgo) / threeMonthsAgo) * 100;
            }
        }

        // Calculate YoY growth: Compare last month (Sep 2025) to same month last year (Sep 2024)
        let growthYoy = 0;
        if (monthlyData.length >= 12) {
            const currentVolume = monthlyData[monthlyData.length - 1].volume; // Sep 2025
            const oneYearAgo = monthlyData[monthlyData.length - 13].volume; // Sep 2024 (12 months ago)
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

