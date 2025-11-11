import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { keywordVectorService } from '../server/keyword-vector-service';
import { calculateOpportunityScore } from '../server/opportunity-score';

interface CompanyData {
    name: string;
    description: string;
    main_industry: string;
    sub_industry: string;
    batch: string;
    url: string;
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

interface CompanyMetricResult {
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
    description?: string;
    url?: string;
}

interface IndustryAggregateResult {
    industry: string; // Can be either main_industry or sub_industry
    industryType: 'main' | 'sub'; // Indicates if it's a main or sub industry
    companyCount: number;
    aggregatedMetrics: AggregatedMetrics;
    monthlyTrendData: Array<{ month: string; volume: number }>;
}

interface OutputData {
    companies: Record<string, CompanyMetricResult>;
    industries: Record<string, IndustryAggregateResult>; // Flattened: both main and sub industries at same level
    metadata: {
        totalCompanies: number;
        totalIndustries: number;
        generatedAt: string;
    };
}

async function processKeywords(rawKeywords: any[]): Promise<ProcessedKeyword[]> {
    // Map CSV columns (2021_11 through 2025_09) to correct month labels in chronological order
    // All 48 months of data
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

    return rawKeywords.map((kw) => {
        // Convert monthly data from CSV format to app format with correct month labels
        // Keywords from findSimilarKeywords have monthly_data JSONB converted to month columns (e.g., "2024_09")
        const monthlyData = allMonths.map(({ key, label }) => {
            // Try to get volume from month column (e.g., kw["2024_09"])
            // If not found, try to get from monthly_data JSONB array if present
            let volume = (kw[key as keyof typeof kw] as number);
            
            // If month column not found, try to extract from monthly_data JSONB array
            if (volume === undefined || volume === null) {
                if (kw.monthly_data && Array.isArray(kw.monthly_data)) {
                    const monthData = kw.monthly_data.find((item: any) => 
                        item.month === key || item.month === label
                    );
                    if (monthData) {
                        volume = monthData.volume;
                    }
                }
            }
            
            // Fallback to search_volume if still not found
            if (volume === undefined || volume === null) {
                volume = kw.search_volume || 0;
            }
            
            return {
                month: label,
                volume: Math.floor(volume),
            };
        });

        // Calculate growth from chronologically ordered monthlyData
        let growth3m = 0;
        if (monthlyData.length >= 4) {
            const currentVolume = monthlyData[monthlyData.length - 1].volume; // Sep 2025
            const threeMonthsAgo = monthlyData[monthlyData.length - 4].volume; // Jun 2025
            if (threeMonthsAgo !== 0) {
                growth3m = ((currentVolume - threeMonthsAgo) / threeMonthsAgo) * 100;
            }
        }

        let growthYoy = 0;
        if (monthlyData.length >= 12) {
            const currentVolume = monthlyData[monthlyData.length - 1].volume; // Sep 2025 (index 47)
            // For YoY: compare Sep 2025 to Sep 2024 (12 months ago, which is index 35 for 48 months)
            // With 48 months: length=48, last index=47, 12 months ago = 47-12+1 = 36... wait, that's Oct
            // Actually: Sep 2025 is at index 47, Sep 2024 is at index 35 (12 months earlier)
            // So: 47 - 12 = 35, which means we need length - 13
            const oneYearAgoIndex = monthlyData.length - 13; // Sep 2024 (12 months before Sep 2025)
            if (oneYearAgoIndex >= 0 && monthlyData[oneYearAgoIndex]) {
                const oneYearAgo = monthlyData[oneYearAgoIndex].volume;
                if (oneYearAgo !== 0) {
                    growthYoy = ((currentVolume - oneYearAgo) / oneYearAgo) * 100;
                }
            }
        }

        const similarityScore = typeof kw.similarityScore === 'number'
            ? kw.similarityScore
            : parseFloat(kw.similarityScore || "0");

        // Use precomputed growth_yoy from database if available, otherwise use calculated value
        let finalGrowthYoy = growthYoy;
        if (kw.growth_YoY !== undefined && kw.growth_YoY !== null) {
            finalGrowthYoy = parseFloat(String(kw.growth_YoY));
        } else if (kw.growth_yoy !== undefined && kw.growth_yoy !== null) {
            finalGrowthYoy = parseFloat(String(kw.growth_yoy));
        }

        // Use precomputed growth_3m from database if available
        let finalGrowth3m = growth3m;
        if (kw.growth_3m !== undefined && kw.growth_3m !== null) {
            finalGrowth3m = parseFloat(String(kw.growth_3m));
        }

        const result: ProcessedKeyword = {
            keyword: kw.keyword,
            volume: Math.floor(kw.search_volume || 0),
            competition: Math.floor(kw.competition || 0),
            cpc: parseFloat(String(kw.cpc || "0")),
            topPageBid: parseFloat(String(
                kw.high_top_of_page_bid || kw.low_top_of_page_bid || "0"
            )),
            growth3m: finalGrowth3m,
            growthYoy: finalGrowthYoy,
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
    results: CompanyMetricResult[]
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

    // Use keywordCount as weight
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
    results: CompanyMetricResult[]
): Array<{ month: string; volume: number }> {
    if (!results || results.length === 0) return [];

    const firstResult = results.find(r => r.monthlyTrendData && r.monthlyTrendData.length > 0);
    if (!firstResult || !firstResult.monthlyTrendData) return [];

    const months = firstResult.monthlyTrendData.map(m => m.month);

    return months.map((month, monthIndex) => {
        const totalWeight = results.reduce((sum, r) => {
            const keywordCount = r.keywordCount || 0;
            const weight = Math.sqrt(keywordCount);
            return sum + weight;
        }, 0);

        if (totalWeight === 0) return { month, volume: 0 };

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

async function aggregateCompanyMetrics(company: CompanyData): Promise<CompanyMetricResult> {
    // Create search query from company name and description
    const query = `${company.name} ${company.description}`;

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
        description: company.description,
        url: company.url,
    };
}

async function aggregateSectorMetricsMain() {
    console.log('=== Aggregating Sector Metrics (Main + Sub-Industries + YC Startups) ===\n');

    // Load companies.csv
    console.log('[1/5] Loading companies.csv...');
    const companiesPath = path.join(process.cwd(), 'new_keywords', 'companies.csv');
    if (!fs.existsSync(companiesPath)) {
        throw new Error(`Companies file not found at ${companiesPath}`);
    }

    const csvContent = fs.readFileSync(companiesPath, 'utf-8');
    const companies: CompanyData[] = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
    }) as CompanyData[];

    // Filter companies: 
    // - For sub-industries: only include companies with valid sub_industry (not N/A)
    // - For main industries: include ALL companies with valid main_industry (even if sub_industry is N/A)
    const validCompaniesForSubIndustry = companies.filter(c => 
        c.sub_industry && c.sub_industry !== 'N/A' &&
        c.main_industry && c.main_industry !== 'N/A'
    );
    
    const validCompaniesForMainIndustry = companies.filter(c => 
        c.main_industry && c.main_industry !== 'N/A'
    );
    
    console.log(`✓ Loaded ${validCompaniesForSubIndustry.length} companies for sub-industries (${companies.length - validCompaniesForSubIndustry.length} excluded with N/A sub-industry)`);
    console.log(`✓ Loaded ${validCompaniesForMainIndustry.length} companies for main-industries (${companies.length - validCompaniesForMainIndustry.length} excluded with N/A main-industry)\n`);

    // Group companies by sub_industry (only those with valid sub_industry)
    console.log('[2/5] Grouping companies by sub-industry...');
    const companiesBySubIndustry = new Map<string, CompanyData[]>();
    for (const company of validCompaniesForSubIndustry) {
        const subIndustry = company.sub_industry;
        if (!companiesBySubIndustry.has(subIndustry)) {
            companiesBySubIndustry.set(subIndustry, []);
        }
        companiesBySubIndustry.get(subIndustry)!.push(company);
    }
    const subIndustries = Array.from(companiesBySubIndustry.keys());
    console.log(`✓ Found ${subIndustries.length} unique sub-industries\n`);

    // Group companies by main_industry (include ALL companies with valid main_industry, even if sub_industry is N/A)
    console.log('[3/5] Grouping companies by main-industry...');
    const companiesByMainIndustry = new Map<string, CompanyData[]>();
    for (const company of validCompaniesForMainIndustry) {
        const mainIndustry = company.main_industry;
        if (!companiesByMainIndustry.has(mainIndustry)) {
            companiesByMainIndustry.set(mainIndustry, []);
        }
        companiesByMainIndustry.get(mainIndustry)!.push(company);
    }
    const mainIndustries = Array.from(companiesByMainIndustry.keys());
    console.log(`✓ Found ${mainIndustries.length} unique main-industries\n`);

    // Initialize KeywordVectorService
    console.log('[4/5] Initializing KeywordVectorService...');
    await keywordVectorService.initialize();
    console.log('✓ KeywordVectorService initialized\n');

    // Process companies (process all companies that will be used in either sub or main industry aggregation)
    const allCompaniesToProcess = new Set([...validCompaniesForSubIndustry, ...validCompaniesForMainIndustry]);
    const uniqueCompaniesToProcess = Array.from(allCompaniesToProcess);
    
    console.log(`[5/5] Processing ${uniqueCompaniesToProcess.length} companies...`);
    const output: OutputData = {
        companies: {},
        industries: {}, // Flattened: both main and sub industries
        metadata: {
            totalCompanies: uniqueCompaniesToProcess.length,
            totalIndustries: mainIndustries.length + subIndustries.length,
            generatedAt: new Date().toISOString(),
        },
    };

    let processed = 0;
    const totalCompanies = uniqueCompaniesToProcess.length;

    // Process each company
    for (const company of uniqueCompaniesToProcess) {
        try {
            // Use sub_industry for key, or main_industry if sub_industry is N/A
            const industryKey = company.sub_industry && company.sub_industry !== 'N/A' 
                ? company.sub_industry 
                : company.main_industry;
            const companyKey = `${company.name} (${industryKey})`;
            const companyMetrics = await aggregateCompanyMetrics(company);
            // Store company info alongside metrics
            output.companies[companyKey] = {
                ...companyMetrics,
                description: company.description,
                url: company.url,
            };
            processed++;

            if (processed % 50 === 0 || processed === totalCompanies) {
                console.log(`  Companies: ${processed}/${totalCompanies} (${Math.round((processed / totalCompanies) * 100)}%)`);
            }
        } catch (error) {
            console.error(`  Error processing company "${company.name}":`, error);
        }
    }

    // Aggregate sub-industries from their companies
    console.log(`\n[Aggregating] Processing ${subIndustries.length} sub-industries...`);
    for (const subIndustry of subIndustries) {
        try {
            const companiesInSubIndustry = companiesBySubIndustry.get(subIndustry)!;
            const companyResults: CompanyMetricResult[] = [];

            // Collect all company results for this sub-industry
            for (const company of companiesInSubIndustry) {
                const companyKey = `${company.name} (${company.sub_industry})`;
                const result = output.companies[companyKey];
                if (result) {
                    companyResults.push(result);
                }
            }

            if (companyResults.length === 0) {
                console.warn(`  Warning: No results found for sub-industry "${subIndustry}"`);
                continue;
            }

            // Aggregate metrics from all companies
            const aggregatedMetrics = aggregateMetricsFromResults(companyResults);
            const monthlyTrendData = aggregateMonthlyTrendFromResults(companyResults);

            // Store in flattened industries structure
            output.industries[subIndustry] = {
                industry: subIndustry,
                industryType: 'sub',
                companyCount: companiesInSubIndustry.length,
                aggregatedMetrics,
                monthlyTrendData,
            };
        } catch (error) {
            console.error(`  Error aggregating sub-industry "${subIndustry}":`, error);
        }
    }

    console.log(`✓ Aggregated ${subIndustries.length} sub-industries\n`);

    // Aggregate main industries from their companies
    console.log(`[Aggregating] Processing ${mainIndustries.length} main-industries...`);
    for (const mainIndustry of mainIndustries) {
        try {
            const companiesInMainIndustry = companiesByMainIndustry.get(mainIndustry)!;
            const companyResults: CompanyMetricResult[] = [];

            // Collect all company results for this main industry
            for (const company of companiesInMainIndustry) {
                // Use sub_industry for key, or main_industry if sub_industry is N/A
                const industryKey = company.sub_industry && company.sub_industry !== 'N/A' 
                    ? company.sub_industry 
                    : company.main_industry;
                const companyKey = `${company.name} (${industryKey})`;
                const result = output.companies[companyKey];
                if (result) {
                    companyResults.push(result);
                }
            }

            if (companyResults.length === 0) {
                console.warn(`  Warning: No results found for main-industry "${mainIndustry}"`);
                continue;
            }

            // Aggregate metrics from all companies
            const aggregatedMetrics = aggregateMetricsFromResults(companyResults);
            const monthlyTrendData = aggregateMonthlyTrendFromResults(companyResults);

            // Store in flattened industries structure (same level as sub-industries)
            // Use a prefix to distinguish main industries if there's a naming conflict
            const industryKey = mainIndustry;
            output.industries[industryKey] = {
                industry: mainIndustry,
                industryType: 'main',
                companyCount: companiesInMainIndustry.length,
                aggregatedMetrics,
                monthlyTrendData,
            };
        } catch (error) {
            console.error(`  Error aggregating main-industry "${mainIndustry}":`, error);
        }
    }

    console.log(`✓ Aggregated ${mainIndustries.length} main-industries\n`);
    console.log(`✓ Total industries aggregated: ${Object.keys(output.industries).length} (${subIndustries.length} sub + ${mainIndustries.length} main)\n`);

    // Save results
    console.log('\n[Saving] Writing results to file...');
    const outputPath = path.join(process.cwd(), 'data', 'sectors_aggregated_metrics.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    const fileSizeMB = fs.statSync(outputPath).size / 1024 / 1024;
    console.log(`✓ Saved aggregated metrics to ${path.basename(outputPath)} (${fileSizeMB.toFixed(2)} MB)\n`);

    console.log('=== Aggregation Complete ===');
    console.log(`Total companies processed: ${Object.keys(output.companies).length}`);
    console.log(`Total industries aggregated: ${Object.keys(output.industries).length} (${subIndustries.length} sub + ${mainIndustries.length} main)`);
}

aggregateSectorMetricsMain().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
