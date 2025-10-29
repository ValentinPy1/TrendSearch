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
}

interface PrecomputedMetrics {
    [keyword: string]: {
        volatility: number;
        trendStrength: number;
        bidEfficiency: number;
        tac: number;
        sac: number;
        opportunityScore: number;
    };
}

async function precomputeOpportunityMetrics() {
    console.log('=== Precomputing Opportunity Metrics ===\n');

    // Load all keywords from CSV
    console.log('[1/4] Loading keywords from CSV...');
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
    console.log('[2/4] Processing keywords to generate monthly data...');
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

        // Calculate YoY growth
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
            growthYoy,
            monthlyData,
        };
    });

    console.log(`✓ Processed ${processedKeywords.length} keywords\n`);

    // Calculate opportunity metrics for each keyword
    console.log('[3/4] Calculating opportunity metrics...');
    const precomputedMetrics: PrecomputedMetrics = {};

    for (let i = 0; i < processedKeywords.length; i++) {
        if (i % 1000 === 0 && i > 0) {
            console.log(`  Progress: ${i}/${processedKeywords.length} (${Math.round((i / processedKeywords.length) * 100)}%)`);
        }

        const kw = processedKeywords[i];

        try {
            const metrics = calculateOpportunityScore({
                volume: kw.volume,
                competition: kw.competition,
                cpc: kw.cpc,
                topPageBid: kw.topPageBid,
                growthYoy: kw.growthYoy,
                monthlyData: kw.monthlyData,
            });

            precomputedMetrics[kw.keyword] = {
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
            precomputedMetrics[kw.keyword] = {
                volatility: 0,
                trendStrength: 0,
                bidEfficiency: 0,
                tac: 0,
                sac: 0,
                opportunityScore: 0,
            };
        }
    }

    console.log(`  Progress: ${processedKeywords.length}/${processedKeywords.length} (100%)`);
    console.log(`✓ Calculated metrics for ${Object.keys(precomputedMetrics).length} keywords\n`);

    // Save precomputed metrics to JSON file
    console.log('[4/4] Saving precomputed metrics to JSON...');
    const outputPath = path.join(process.cwd(), 'data', 'precomputed_opportunity_metrics.json');

    // Save with pretty formatting for debugging, but could be minified for production
    fs.writeFileSync(outputPath, JSON.stringify(precomputedMetrics, null, 2));

    const fileSizeMB = fs.statSync(outputPath).size / 1024 / 1024;
    console.log(`✓ Saved precomputed metrics to ${path.basename(outputPath)} (${fileSizeMB.toFixed(2)} MB)\n`);

    console.log('=== Precomputation Complete ===');
    console.log(`Total keywords with metrics: ${Object.keys(precomputedMetrics).length}`);
    console.log(`Metrics file: ${outputPath}`);
}

precomputeOpportunityMetrics().catch(error => {
    console.error('Error precomputing opportunity metrics:', error);
    process.exit(1);
});

