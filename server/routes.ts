import express from "express";
import type { Express } from "express";
import { createServer } from "http";
import type { Server } from "http";
import { storage } from "./storage";
import { supabaseAdmin } from "./supabase";
import { stripe } from "./stripe";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { users, customSearchProjectKeywords } from "@shared/schema";
import { db } from "./db";
import { keywordVectorService } from "./keyword-vector-service";
import { microSaaSIdeaGenerator } from "./microsaas-idea-generator";
import { calculateOpportunityScore } from "./opportunity-score";
import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import { logger } from "./utils/logger";
import { validateCompetitorUrl } from "./utils/url-validator";
import {
    isGoogleSearchConfigured,
    generateSearchQueries,
    searchGoogleMultiple,
    extractCompetitorsFromSearchResults,
} from "./search-service";
import {
    SAVE_INTERVAL_MS,
    SAVE_KEYWORD_INTERVAL,
    PROGRESS_CHECKPOINT_INTERVAL_MS,
    PROGRESS_CHECKPOINT_KEYWORD_INTERVAL,
} from "./config/keyword-generation";
import type { ProgressUpdate } from "./keyword-collector";

type FilterOperator = ">" | ">=" | "<" | "<=" | "=";

interface KeywordFilter {
    metric: string;
    operator: FilterOperator;
    value: number;
}

// Constants for optimization
const SIMILARITY_CANDIDATE_POOL_SIZE = 2000; // Number of similar keywords to fetch before filtering

// In-memory cache for computed metrics (keyed by projectId -> keywordId -> metrics)
// This allows clients to fetch metrics immediately after computation, before they're saved to DB
const computedMetricsCache = new Map<string, Map<string, {
    volatility: string | null;
    trendStrength: string | null;
    growth3m: string | null;
    growthYoy: string | null;
}>>();

/**
 * Parse month string in "Jan 2024" format to a sortable number
 * @param monthStr - Month string in format "Jan 2024"
 * @returns Sortable number (year * 100 + month), e.g., 202401 for "Jan 2024"
 */
function parseMonthString(monthStr: string): number {
    const monthNames: { [key: string]: number } = {
        'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
        'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
    };
    const parts = monthStr.split(' ');
    if (parts.length === 2) {
        const monthName = parts[0];
        const year = parseInt(parts[1], 10);
        const month = monthNames[monthName] || 0;
        return year * 100 + month; // e.g., 2024 * 100 + 1 = 202401
    }
    return 0;
}

/**
 * Categorize filters into raw (can filter on raw data) vs processed (need computed metrics)
 */
function categorizeFilters(filters: KeywordFilter[]): {
    rawFilters: KeywordFilter[];
    processedFilters: KeywordFilter[];
} {
    const rawFilterMetrics = new Set([
        "volume",
        "competition",
        "cpc",
        "topPageBid",
        "growth3m",
        "growthYoy",
        "similarityScore",
    ]);

    const rawFilters: KeywordFilter[] = [];
    const processedFilters: KeywordFilter[] = [];

    for (const filter of filters) {
        if (rawFilterMetrics.has(filter.metric)) {
            rawFilters.push(filter);
        } else {
            processedFilters.push(filter);
        }
    }

    return { rawFilters, processedFilters };
}

/**
 * Apply filters on raw KeywordData without processing (fast filtering)
 * This filters on fields that are directly available in raw keyword data
 */
function applyRawFilters(
    rawKeywords: any[],
    filters: KeywordFilter[],
): any[] {
    if (!filters || filters.length === 0) {
        return rawKeywords;
    }

    return rawKeywords.filter((kw) => {
        // Check all filters (AND logic)
        return filters.every((filter) => {
            let valueToCompare: number;

            // Map raw keyword fields to filter metrics
            switch (filter.metric) {
                case "volume":
                    valueToCompare = typeof kw.search_volume === "number"
                        ? kw.search_volume
                        : parseFloat(String(kw.search_volume || "0")) || 0;
                    break;
                case "competition":
                    valueToCompare = typeof kw.competition === "number"
                        ? kw.competition
                        : parseFloat(String(kw.competition || "0")) || 0;
                    break;
                case "cpc":
                    valueToCompare = parseFloat(String(kw.cpc || "0")) || 0;
                    break;
                case "topPageBid":
                    // Use high_top_of_page_bid or fallback to low_top_of_page_bid
                    const topBid = kw.high_top_of_page_bid || kw.low_top_of_page_bid || 0;
                    valueToCompare = parseFloat(String(topBid)) || 0;
                    break;
                case "growth3m":
                    // Map from raw CSV field name
                    valueToCompare = parseFloat(String(kw["3month_trend_%"] || "0")) || 0;
                    break;
                case "growthYoy":
                    // Map from raw CSV field name
                    valueToCompare = parseFloat(String(kw["yoy_trend_%"] || "0")) || 0;
                    break;
                case "similarityScore":
                    valueToCompare = parseFloat(String(kw.similarityScore || "0")) || 0;
                    break;
                default:
                    return true; // Unknown metric, don't filter
            }

            // Ensure filter.value is also a number
            const filterValue = typeof filter.value === "number"
                ? filter.value
                : parseFloat(String(filter.value)) || 0;

            // Apply operator with robust numeric comparison
            switch (filter.operator) {
                case ">":
                    return valueToCompare > filterValue;
                case ">=":
                    return valueToCompare >= filterValue;
                case "<":
                    return valueToCompare < filterValue;
                case "<=":
                    return valueToCompare <= filterValue;
                case "=":
                    // Floating point comparison with small epsilon
                    return Math.abs(valueToCompare - filterValue) < 0.0001;
                default:
                    return true;
            }
        });
    });
}

function applyFilters(
    keywords: any[],
    filters: KeywordFilter[],
    calculateOpportunityMetrics: (kw: any) => any,
): any[] {
    if (!filters || filters.length === 0) {
        return keywords;
    }

    // Check if any filters require expensive opportunity metrics
    const needsOpportunityMetrics = filters.some((filter) =>
        ["volatility", "trendStrength", "bidEfficiency", "tac", "sac", "opportunityScore"].includes(filter.metric)
    );

    return keywords.filter((kw) => {
        // Use precomputed metrics if available, otherwise calculate on-the-fly
        let metrics: any = null;
        if (needsOpportunityMetrics) {
            // Check if keyword has precomputed metrics
            if ((kw as any).precomputedMetrics) {
                metrics = (kw as any).precomputedMetrics;
            } else {
                // Fallback to calculating on-the-fly (backwards compatibility)
                metrics = calculateOpportunityMetrics(kw);
            }
        }

        // Check all filters (AND logic)
        return filters.every((filter) => {
            let valueToCompare: number;

            // Get the value based on metric field
            // Ensure all values are properly converted to numbers for consistent comparison
            switch (filter.metric) {
                case "volume":
                    valueToCompare = typeof kw.volume === "number" ? kw.volume : parseFloat(String(kw.volume || "0")) || 0;
                    break;
                case "competition":
                    valueToCompare = typeof kw.competition === "number" ? kw.competition : parseFloat(String(kw.competition || "0")) || 0;
                    break;
                case "cpc":
                    valueToCompare = parseFloat(String(kw.cpc || "0")) || 0;
                    break;
                case "topPageBid":
                    valueToCompare = parseFloat(String(kw.topPageBid || "0")) || 0;
                    break;
                case "growth3m":
                    valueToCompare = parseFloat(String(kw.growth3m || "0")) || 0;
                    break;
                case "growthYoy":
                    valueToCompare = parseFloat(String(kw.growthYoy || "0")) || 0;
                    break;
                case "similarityScore":
                    valueToCompare = parseFloat(String(kw.similarityScore || "0")) || 0;
                    break;
                case "volatility":
                    valueToCompare = parseFloat(String(metrics.volatility || "0")) || 0;
                    break;
                case "trendStrength":
                    valueToCompare = parseFloat(String(metrics.trendStrength || "0")) || 0;
                    break;
                case "bidEfficiency":
                    valueToCompare = parseFloat(String(metrics.bidEfficiency || "0")) || 0;
                    break;
                case "tac":
                    valueToCompare = parseFloat(String(metrics.tac || "0")) || 0;
                    break;
                case "sac":
                    valueToCompare = parseFloat(String(metrics.sac || "0")) || 0;
                    break;
                case "opportunityScore":
                    valueToCompare = parseFloat(String(metrics.opportunityScore || "0")) || 0;
                    break;
                default:
                    return true; // Unknown metric, don't filter
            }

            // Ensure filter.value is also a number
            const filterValue = typeof filter.value === "number" ? filter.value : parseFloat(String(filter.value)) || 0;

            // Apply operator with robust numeric comparison
            switch (filter.operator) {
                case ">":
                    return valueToCompare > filterValue;
                case ">=":
                    return valueToCompare >= filterValue;
                case "<":
                    return valueToCompare < filterValue;
                case "<=":
                    return valueToCompare <= filterValue;
                case "=":
                    // Floating point comparison with small epsilon
                    return Math.abs(valueToCompare - filterValue) < 0.0001;
                default:
                    return true;
            }
        });
    });
}

/**
 * Lookup preprocessed keyword data and merge with raw keyword, falling back to processing if not available
 */
function lookupOrProcessKeyword(rawKeyword: any): any {
    // Try to lookup preprocessed data
    const preprocessed = keywordVectorService.getPreprocessedKeyword(rawKeyword.keyword);

    if (preprocessed) {
        // Merge raw keyword data with preprocessed data
        return {
            ...preprocessed,
            keyword: rawKeyword.keyword,
            similarityScore: rawKeyword.similarityScore?.toFixed(4) || "0.0000",
            // Preserve precomputed metrics if available
            precomputedMetrics: rawKeyword.precomputedMetrics,
        };
    }

    // Fallback: process on-the-fly (backward compatibility)
    return processKeywords([rawKeyword])[0];
}

function processKeywords(rawKeywords: any[]) {
    // Map CSV columns (2021_11 through 2025_09) to correct month labels in chronological order
    // This is all 48 months of data
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

    // Last 12 months for non-premium users
    const last12Months = allMonths.slice(-12);

    return rawKeywords.map((kw) => {
        // Convert monthly data from CSV format to our format with correct month labels
        // Recharts displays data in the order provided, so keep chronological order
        // Store all 48 months - client will filter based on premium status
        const monthlyData = allMonths.map(({ key, label }) => {
            return {
                month: label,
                volume: Math.floor(
                    (kw[key as keyof typeof kw] as number) || kw.search_volume || 0,
                ),
            };
        });

        // Calculate growth from chronologically ordered monthlyData
        // 3M Growth: Compare last month (Sep 2025) to 3 months ago (Jun 2025)
        let growth3m = 0;
        if (monthlyData.length >= 4) {
            const currentVolume = monthlyData[monthlyData.length - 1].volume; // Sep 2025 (last index)
            const threeMonthsAgo = monthlyData[monthlyData.length - 4].volume; // Jun 2025 (3 months ago)
            if (threeMonthsAgo !== 0) {
                growth3m = ((currentVolume - threeMonthsAgo) / threeMonthsAgo) * 100;
            }
        }

        // YoY Growth: Compare last month (Sep 2025) to same month last year (Sep 2024)
        let growthYoy = 0;
        if (monthlyData.length >= 12) {
            const currentVolume = monthlyData[monthlyData.length - 1].volume; // Sep 2025
            const oneYearAgo = monthlyData[monthlyData.length - 13].volume; // Sep 2024 (12 months ago)
            if (oneYearAgo !== 0) {
                growthYoy = ((currentVolume - oneYearAgo) / oneYearAgo) * 100;
            }
        }

        const result: any = {
            keyword: kw.keyword,
            volume: Math.floor(kw.search_volume || 0),
            competition: Math.floor(kw.competition || 0),
            cpc: (kw.cpc || 0).toFixed(2),
            topPageBid: (
                kw.high_top_of_page_bid ||
                kw.low_top_of_page_bid ||
                0
            ).toFixed(2),
            growth3m: growth3m.toFixed(2),
            growthYoy: growthYoy.toFixed(2),
            similarityScore: kw.similarityScore.toFixed(4),
            growthSlope: (kw.growth_slope || 0).toFixed(2),
            growthR2: (kw.growth_r2 || 0).toFixed(4),
            growthConsistency: (kw.growth_consistency || 0).toFixed(4),
            growthStability: (kw.growth_stability || 0).toFixed(4),
            sustainedGrowthScore: (kw.sustained_growth_score || 0).toFixed(4),
            monthlyData,
        };

        // Preserve precomputed metrics if available
        if ((kw as any).precomputedMetrics) {
            result.precomputedMetrics = (kw as any).precomputedMetrics;
        }

        return result;
    });
}

async function getKeywordsFromVectorDB(
    idea: string,
    topN: number = 10,
    filters?: KeywordFilter[],
    excludeKeywords?: Set<string>, // For load-more: exclude already loaded keywords
    candidatePoolSize?: number, // Optional: override default candidate pool size
) {
    let keywords: any[];

    if (filters && filters.length > 0) {
        // OPTIMIZED ALGORITHM: Similarity first, then two-phase filtering
        // Step 1: Get top-N similar keywords (candidate pool) - much faster than processing all
        const poolSize = candidatePoolSize || SIMILARITY_CANDIDATE_POOL_SIZE;
        const candidatePool = await keywordVectorService.findSimilarKeywords(
            idea,
            poolSize,
        );

        // Step 2: Categorize filters into raw vs processed
        const { rawFilters, processedFilters } = categorizeFilters(filters);

        // Step 3: Phase 1 - Apply raw filters on raw data (fast, no processing needed)
        // Apply filters BEFORE excluding keywords to maximize candidate pool
        let filteredRawKeywords = candidatePool;
        if (rawFilters.length > 0) {
            filteredRawKeywords = applyRawFilters(candidatePool, rawFilters);
        }

        // Step 4: If no candidates after raw filtering, return empty result
        if (filteredRawKeywords.length === 0) {
            return {
                keywords: [],
                aggregates: {
                    avgVolume: 0,
                    growth3m: "0",
                    growthYoy: "0",
                    competition: "medium",
                    avgTopPageBid: "0",
                    avgCpc: "0",
                },
                hasMore: false,
                exhausted: true, // Indicate that candidate pool was exhausted
            };
        }

        // Step 5: Phase 2 - Process only remaining candidates and apply processed filters
        // Only process keywords that passed raw filters (much smaller set)
        const processedKeywords = filteredRawKeywords.map((kw) => lookupOrProcessKeyword(kw));

        let filteredKeywords = processedKeywords;
        if (processedFilters.length > 0) {
            // Apply filters that require processed/computed metrics
            filteredKeywords = applyFilters(processedKeywords, processedFilters, (kw) => {
                // Use precomputed metrics if available, otherwise calculate on-the-fly
                if ((kw as any).precomputedMetrics) {
                    return (kw as any).precomputedMetrics;
                }
                // Calculate on-the-fly (backwards compatibility when precomputed metrics not available)
                return calculateOpportunityScore({
                    volume: kw.volume || 0,
                    competition: kw.competition || 0,
                    cpc: parseFloat(kw.cpc?.toString() || "0"),
                    topPageBid: parseFloat(kw.topPageBid?.toString() || "0"),
                    growthYoy: parseFloat(kw.growthYoy?.toString() || "0"),
                    monthlyData: kw.monthlyData || [],
                });
            });
        }

        // Step 6: Exclude already loaded keywords AFTER filtering (for load-more)
        // This ensures we have maximum pool size for filtering
        if (excludeKeywords && excludeKeywords.size > 0) {
            filteredKeywords = filteredKeywords.filter(
                (kw) => !excludeKeywords.has(kw.keyword),
            );
        }

        // Step 7: If no filtered keywords after both phases and exclusion, return empty result
        if (filteredKeywords.length === 0) {
            return {
                keywords: [],
                aggregates: {
                    avgVolume: 0,
                    growth3m: "0",
                    growthYoy: "0",
                    competition: "medium",
                    avgTopPageBid: "0",
                    avgCpc: "0",
                },
                hasMore: false,
                exhausted: true, // Indicate that candidate pool was exhausted
            };
        }

        // Step 8: Map similarity scores (already calculated in findSimilarKeywords)
        const similarityMap = new Map(
            candidatePool.map((kw) => [kw.keyword, kw.similarityScore]),
        );

        filteredKeywords.forEach((kw) => {
            kw.similarityScore = similarityMap.get(kw.keyword)?.toFixed(4) || "0.0000";
        });

        // Step 9: Sort by similarity score (highest first)
        filteredKeywords.sort((a, b) => {
            const scoreA = parseFloat(a.similarityScore || "0");
            const scoreB = parseFloat(b.similarityScore || "0");
            return scoreB - scoreA;
        });

        // Step 10: Limit to requested count
        keywords = filteredKeywords.slice(0, topN);
    } else {
        // NO FILTERS: Use original algorithm (similarity first)
        const similarKeywords = await keywordVectorService.findSimilarKeywords(idea, topN);

        // Exclude already loaded keywords (for load-more)
        if (excludeKeywords && excludeKeywords.size > 0) {
            const excluded = similarKeywords.filter(
                (kw) => !excludeKeywords.has(kw.keyword),
            );
            // If we excluded some, fetch more to compensate
            if (excluded.length < topN) {
                const additional = await keywordVectorService.findSimilarKeywords(
                    idea,
                    topN + excludeKeywords.size,
                );
                const unique = additional.filter(
                    (kw) => !excludeKeywords.has(kw.keyword) && !excluded.some((e) => e.keyword === kw.keyword),
                );
                keywords = [...excluded, ...unique].slice(0, topN).map((kw) => lookupOrProcessKeyword(kw));
            } else {
                keywords = excluded.slice(0, topN).map((kw) => lookupOrProcessKeyword(kw));
            }
        } else {
            keywords = similarKeywords.map((kw) => lookupOrProcessKeyword(kw));
        }
    }

    // Calculate aggregate metrics from keywords
    if (keywords.length === 0) {
        return {
            keywords: [],
            aggregates: {
                avgVolume: 0,
                growth3m: "0",
                growthYoy: "0",
                competition: "medium",
                avgTopPageBid: "0",
                avgCpc: "0",
            },
            hasMore: false,
        };
    }

    const avgVolume = Math.floor(
        keywords.reduce((sum: number, k: any) => sum + k.volume, 0) / keywords.length,
    );
    const growth3m = (
        keywords.reduce((sum: number, k: any) => sum + parseFloat(k.growth3m), 0) /
        keywords.length
    ).toFixed(2);
    const growthYoy = (
        keywords.reduce((sum: number, k: any) => sum + parseFloat(k.growthYoy), 0) /
        keywords.length
    ).toFixed(2);
    const avgCompetition = Math.floor(
        keywords.reduce((sum: number, k: any) => sum + k.competition, 0) / keywords.length,
    );
    const avgTopPageBid = (
        keywords.reduce((sum: number, k: any) => sum + parseFloat(k.topPageBid), 0) /
        keywords.length
    ).toFixed(2);
    const avgCpc = (
        keywords.reduce((sum: number, k: any) => sum + parseFloat(k.cpc), 0) / keywords.length
    ).toFixed(2);

    // Map competition to text for compatibility
    let competitionText = "medium";
    if (avgCompetition < 33) competitionText = "low";
    if (avgCompetition >= 66) competitionText = "high";

    // Calculate hasMore accurately
    let hasMore: boolean | undefined = undefined;
    if (filters && filters.length > 0) {
        // For filtered results:
        // - If we got the full requested count, there might be more available
        // - If we got less than requested, check if candidate pool was exhausted
        // - Track if we processed full candidate pool to determine if more exist
        const gotFullCount = keywords.length >= topN;
        const candidatePoolExhausted = keywords.length < topN && keywords.length > 0;
        // If we got full count, assume more might be available
        // If we got partial count, we've exhausted the filtered results
        hasMore = gotFullCount;
    }

    return {
        keywords,
        aggregates: {
            avgVolume,
            growth3m,
            growthYoy,
            competition: competitionText,
            avgTopPageBid,
            avgCpc,
        },
        hasMore, // Indicate if more filtered keywords available
    };
}

/**
 * Safe setTimeout wrapper that prevents negative timeout values
 * Node.js will default negative timeouts to 1ms, which can cause issues
 */
function safeSetTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    const safeDelay = Math.max(1, Math.floor(delay));
    if (delay < 0) {
        logger.warn("Negative timeout detected, using 1ms", {
            originalDelay: delay,
            safeDelay,
        });
    }
    return setTimeout(callback, safeDelay);
}

/**
 * Convert processed keywords (from processDataForSEOResults) to format needed for report generation
 * Creates temporary IDs and sets up keyword objects with all required fields
 * Note: Similarity scores will be calculated in generateReportData based on keyword text
 */
function convertProcessedKeywordsToReportFormat(
    keywordsToInsert: Array<{
        keyword: string;
        volume: number | null;
        competition: number | null;
        cpc: number | null;
        topPageBid: number | null;
        monthlyData: Array<{ month: string; volume: number }>;
        source: string;
    }>,
    projectId: string
): any[] {
    // Filter keywords with data
    const keywordsWithData = keywordsToInsert.filter(kw =>
        (kw.volume !== null && kw.volume !== undefined) ||
        (kw.competition !== null && kw.competition !== undefined) ||
        (kw.cpc !== null && kw.cpc !== undefined) ||
        (kw.topPageBid !== null && kw.topPageBid !== undefined)
    );

    // Convert to report format with temporary IDs
    // Note: IDs are temporary and won't match database IDs, but similarity scores
    // will be calculated based on keyword text in generateReportData
    return keywordsWithData.map((kw, index) => ({
        id: `temp-${projectId}-${index}`, // Temporary ID for report generation
        keyword: kw.keyword,
        volume: kw.volume,
        competition: kw.competition,
        cpc: kw.cpc ? kw.cpc.toString() : null,
        topPageBid: kw.topPageBid ? kw.topPageBid.toString() : null,
        monthlyData: kw.monthlyData || [],
        growthYoy: null, // Will be calculated later in background
        growth3m: null, // Will be calculated later in background
        volatility: null, // Will be calculated later in background
        trendStrength: null, // Will be calculated later in background
    }));
}

/**
 * Generate report data from keywords
 * Extracted to reduce code duplication between new report generation and already-generated report paths
 */
async function generateReportData(
    projectId: string,
    project: any,
    keywordsWithData: any[],
    keywordVectorService: any,
    db: any,
    customSearchProjectKeywords: any
): Promise<{
    aggregated: any;
    keywords: any[];
    totalKeywords: number;
    similarityCalculation: { calculated: number; cached: number; errors: number; duration: string };
    opportunityScoreCalculation: { calculated: number; skipped: number; errors: number; duration: string };
}> {
    const reportStartTime = Date.now();

    // Calculate aggregated metrics
    const totalVolume = keywordsWithData.reduce((sum, kw) => sum + (kw.volume || 0), 0);
    const avgVolume = Math.round(totalVolume / keywordsWithData.length);

    const validCpc = keywordsWithData
        .map(kw => kw.cpc ? parseFloat(kw.cpc) : null)
        .filter((c): c is number => c !== null && !isNaN(c)); // Filter out NaN values
    const avgCpc = validCpc.length > 0
        ? validCpc.reduce((sum, c) => sum + c, 0) / validCpc.length
        : null;

    const validTopPageBid = keywordsWithData
        .map(kw => kw.topPageBid ? parseFloat(kw.topPageBid) : null)
        .filter((b): b is number => b !== null && !isNaN(b)); // Filter out NaN values
    const avgTopPageBid = validTopPageBid.length > 0
        ? validTopPageBid.reduce((sum, b) => sum + b, 0) / validTopPageBid.length
        : null;

    const competitionLevels = keywordsWithData
        .map(kw => {
            if (!kw.competition) return null;
            const comp = kw.competition;
            if (comp >= 75) return "high";
            if (comp >= 25) return "medium";
            return "low";
        })
        .filter((c): c is string => c !== null);

    const competitionCounts = competitionLevels.reduce((acc, level) => {
        acc[level] = (acc[level] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const competition = Object.keys(competitionCounts).length > 0
        ? Object.entries(competitionCounts).sort((a, b) => b[1] - a[1])[0][0]
        : null;

    const competitionNumber = competition === "high" ? 100 : competition === "medium" ? 50 : 0;

    const monthlyDataMap = new Map<string, { sum: number; count: number }>();
    keywordsWithData.forEach(kw => {
        if (kw.monthlyData && Array.isArray(kw.monthlyData)) {
            kw.monthlyData.forEach((md: any) => {
                if (md.month && md.volume !== null && md.volume !== undefined) {
                    const existing = monthlyDataMap.get(md.month) || { sum: 0, count: 0 };
                    monthlyDataMap.set(md.month, {
                        sum: existing.sum + md.volume,
                        count: existing.count + 1
                    });
                }
            });
        }
    });

    const aggregatedMonthlyData = Array.from(monthlyDataMap.entries())
        .map(([month, data]) => ({
            month,
            volume: Math.round(data.sum / data.count),
            sortKey: month
        }))
        .sort((a, b) => {
            return parseMonthString(a.month) - parseMonthString(b.month);
        })
        .map(({ sortKey, ...rest }) => rest);

    const { calculateVolatility, calculateTrendStrength, calculateOpportunityScore } = await import("./opportunity-score");

    let aggregatedGrowthYoy: number | null = null;
    if (aggregatedMonthlyData.length >= 12) {
        const lastMonth = aggregatedMonthlyData[aggregatedMonthlyData.length - 1];
        const sameMonthLastYear = aggregatedMonthlyData[aggregatedMonthlyData.length - 12];
        aggregatedGrowthYoy = ((lastMonth.volume - sameMonthLastYear.volume) / (sameMonthLastYear.volume + 1)) * 100;
    }

    let aggregatedGrowth3m: number | null = null;
    if (aggregatedMonthlyData.length >= 3) {
        const lastMonth = aggregatedMonthlyData[aggregatedMonthlyData.length - 1];
        const threeMonthsAgo = aggregatedMonthlyData[aggregatedMonthlyData.length - 3];
        aggregatedGrowth3m = ((lastMonth.volume - threeMonthsAgo.volume) / (threeMonthsAgo.volume + 1)) * 100;
    }

    const aggregatedVolatility = calculateVolatility(aggregatedMonthlyData);
    const aggregatedTrendStrength = aggregatedGrowthYoy !== null
        ? calculateTrendStrength(aggregatedGrowthYoy, aggregatedVolatility)
        : 0;

    let aggregatedOpportunityScore = null;
    let aggregatedBidEfficiency = null;
    let aggregatedTac = null;
    let aggregatedSac = null;

    if (avgVolume && avgCpc !== null && avgTopPageBid !== null && aggregatedGrowthYoy !== null && aggregatedMonthlyData.length > 0) {
        const oppResult = calculateOpportunityScore({
            volume: avgVolume,
            competition: competitionNumber,
            cpc: avgCpc,
            topPageBid: avgTopPageBid,
            growthYoy: aggregatedGrowthYoy,
            monthlyData: aggregatedMonthlyData
        });
        aggregatedOpportunityScore = oppResult.opportunityScore;
        aggregatedBidEfficiency = oppResult.bidEfficiency;
        aggregatedTac = oppResult.tac;
        aggregatedSac = oppResult.sac;
    }

    const keywordIds = keywordsWithData.map(kw => kw.id);
    const projectLinks = keywordIds.length > 0
        ? await db
            .select({
                id: customSearchProjectKeywords.id,
                globalKeywordId: customSearchProjectKeywords.globalKeywordId,
                similarityScore: customSearchProjectKeywords.similarityScore,
                sourceWebsites: customSearchProjectKeywords.sourceWebsites,
            })
            .from(customSearchProjectKeywords)
            .where(
                eq(customSearchProjectKeywords.customSearchProjectId, projectId)
            )
        : [];

    // Create a map of keyword ID to sourceWebsites for easy lookup
    const keywordIdToSourceWebsitesMap = new Map<string, string[]>();
    projectLinks.forEach((link: any) => {
        keywordIdToSourceWebsitesMap.set(link.globalKeywordId, (link.sourceWebsites as string[]) || []);
    });

    logger.debug("Calculating similarity scores for keywords", {
        projectLinksCount: projectLinks.length,
        keywordsWithDataCount: keywordsWithData.length,
    });

    const similarityStartTime = Date.now();
    const similarityScoreMap = new Map<string, string>();
    const pitch = project.pitch || "";
    let similarityCalculated = 0;
    let similarityCached = 0;
    let similarityErrors = 0;

    const keywordIdToTextMap = new Map<string, string>();
    keywordsWithData.forEach(kw => {
        keywordIdToTextMap.set(kw.id, kw.keyword);
        // If sourceWebsites not already set, get from map
        if (!kw.sourceWebsites) {
            kw.sourceWebsites = keywordIdToSourceWebsitesMap.get(kw.id) || [];
        }
    });

    // If we have project links (keywords already saved to database), use them
    if (projectLinks.length > 0) {
        for (const link of projectLinks) {
            let similarity = link.similarityScore ? parseFloat(link.similarityScore) : null;
            // Recalculate if similarity is null, 0.8 (old default), or 0.5 (current default when pitch was empty)
            if (similarity === null || similarity === 0.8 || similarity === 0.5) {
                const keywordText = keywordIdToTextMap.get(link.globalKeywordId);
                if (keywordText && pitch.trim()) {
                    try {
                        similarity = await keywordVectorService.calculateTextSimilarity(pitch, keywordText);
                        await db
                            .update(customSearchProjectKeywords)
                            .set({ similarityScore: similarity.toString() })
                            .where(eq(customSearchProjectKeywords.id, link.id));
                        similarityCalculated++;
                    } catch (error) {
                        logger.warn("Failed to calculate similarity for keyword", {
                            keyword: keywordText,
                            error: error instanceof Error ? error.message : String(error),
                        });
                        similarity = similarity || 0.5;
                        similarityErrors++;
                    }
                } else {
                    similarity = similarity || 0.5;
                }
            } else {
                similarityCached++;
            }
            similarityScoreMap.set(link.globalKeywordId, similarity.toString());
        }
    } else {
        // No project links yet (generating from in-memory data) - calculate similarity directly from keyword text
        logger.debug("No project links found, calculating similarity scores directly from keyword text");
        for (const kw of keywordsWithData) {
            // Check if this is a temporary ID (from in-memory processing)
            const isTemporaryId = kw.id.startsWith('temp-');
            if (isTemporaryId && pitch.trim()) {
                try {
                    const similarity = await keywordVectorService.calculateTextSimilarity(pitch, kw.keyword);
                    similarityScoreMap.set(kw.id, similarity.toString());
                    similarityCalculated++;
                } catch (error) {
                    logger.warn("Failed to calculate similarity for keyword", {
                        keyword: kw.keyword,
                        error: error instanceof Error ? error.message : String(error),
                    });
                    similarityScoreMap.set(kw.id, '0.5');
                    similarityErrors++;
                }
            } else {
                similarityScoreMap.set(kw.id, '0.5');
            }
        }
    }

    const similarityDuration = Date.now() - similarityStartTime;
    const totalSimilarities = projectLinks.length > 0 ? projectLinks.length : keywordsWithData.length;
    logger.info("Similarity calculation complete", {
        duration: `${similarityDuration}ms (${(similarityDuration / 1000).toFixed(2)}s)`,
        calculated: similarityCalculated,
        cached: similarityCached,
        errors: similarityErrors,
        total: totalSimilarities,
    });

    logger.debug("Calculating opportunity scores for keywords", {
        keywordsCount: keywordsWithData.length,
    });

    const opportunityScoreStartTime = Date.now();
    let opportunityScoresCalculated = 0;
    let opportunityScoresSkipped = 0;
    let opportunityScoreErrors = 0;

    const formattedKeywords = keywordsWithData.map(kw => {
        let opportunityScore = null;
        let bidEfficiency = null;
        let tac = null;
        let sac = null;

        if (kw.volume && kw.competition !== null && kw.cpc && kw.topPageBid && kw.growthYoy !== null && kw.monthlyData) {
            try {
                const oppResult = calculateOpportunityScore({
                    volume: kw.volume,
                    competition: kw.competition,
                    cpc: parseFloat(kw.cpc),
                    topPageBid: parseFloat(kw.topPageBid),
                    growthYoy: parseFloat(kw.growthYoy),
                    monthlyData: kw.monthlyData
                });
                opportunityScore = oppResult.opportunityScore;
                bidEfficiency = oppResult.bidEfficiency;
                tac = oppResult.tac;
                sac = oppResult.sac;
                opportunityScoresCalculated++;
            } catch (error) {
                logger.error("Error calculating opportunity score for keyword", error, {
                    keyword: kw.keyword,
                    keywordId: kw.id,
                });
                opportunityScoreErrors++;
            }
        } else {
            opportunityScoresSkipped++;
        }

        const similarityScore = similarityScoreMap.get(kw.id) || null;

        let formattedMonthlyData = kw.monthlyData || [];
        if (Array.isArray(formattedMonthlyData) && formattedMonthlyData.length > 0) {
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const needsConversion = formattedMonthlyData.some((item: any) =>
                typeof item.month === 'string' && /^\d{4}-\d{2}$/.test(item.month)
            );

            if (needsConversion) {
                formattedMonthlyData = formattedMonthlyData.map((item: any) => {
                    if (/^\d{4}-\d{2}$/.test(item.month)) {
                        const [year, month] = item.month.split('-');
                        const monthIndex = parseInt(month, 10) - 1;
                        const monthName = monthNames[monthIndex];
                        return {
                            month: `${monthName} ${year}`,
                            volume: item.volume,
                            sortKey: item.month
                        };
                    }
                    return { ...item, sortKey: item.month };
                }).sort((a: any, b: any) => {
                    if (a.sortKey && b.sortKey) {
                        return a.sortKey.localeCompare(b.sortKey);
                    }
                    const dateA = new Date(a.month);
                    const dateB = new Date(b.month);
                    return dateA.getTime() - dateB.getTime();
                }).map(({ sortKey, ...rest }: any) => rest);
            } else {
                formattedMonthlyData = [...formattedMonthlyData].sort((a: any, b: any) => {
                    const dateA = new Date(a.month);
                    const dateB = new Date(b.month);
                    return dateA.getTime() - dateB.getTime();
                });
            }
        }

        return {
            id: kw.id,
            reportId: projectId,
            keyword: kw.keyword,
            volume: kw.volume,
            competition: kw.competition,
            cpc: kw.cpc ? parseFloat(kw.cpc).toString() : null,
            topPageBid: kw.topPageBid ? parseFloat(kw.topPageBid).toString() : null,
            growth3m: kw.growth3m ? parseFloat(kw.growth3m).toString() : null,
            growthYoy: kw.growthYoy ? parseFloat(kw.growthYoy).toString() : null,
            similarityScore: similarityScore ? parseFloat(similarityScore).toString() : null,
            growthSlope: null,
            growthR2: null,
            growthConsistency: null,
            growthStability: null,
            sustainedGrowthScore: null,
            volatility: kw.volatility ? parseFloat(kw.volatility).toString() : null,
            trendStrength: kw.trendStrength ? parseFloat(kw.trendStrength).toString() : null,
            bidEfficiency: bidEfficiency ? bidEfficiency.toString() : null,
            tac: tac ? tac.toString() : null,
            sac: sac ? sac.toString() : null,
            opportunityScore: opportunityScore ? opportunityScore.toString() : null,
            monthlyData: formattedMonthlyData,
            sourceWebsites: kw.sourceWebsites || []
        };
    });

    const opportunityScoreDuration = Date.now() - opportunityScoreStartTime;
    logger.info("Opportunity score calculation complete", {
        duration: `${opportunityScoreDuration}ms (${(opportunityScoreDuration / 1000).toFixed(2)}s)`,
        calculated: opportunityScoresCalculated,
        skipped: opportunityScoresSkipped,
        errors: opportunityScoreErrors,
        total: keywordsWithData.length,
    });

    const reportDuration = Date.now() - reportStartTime;
    logger.info("=== GENERATE REPORT PIPELINE COMPLETE ===", {
        duration: `${reportDuration}ms (${(reportDuration / 1000).toFixed(2)}s)`,
        keywordsWithData: keywordsWithData.length,
        totalKeywords: keywordsWithData.length,
        aggregatedMetrics: {
            avgVolume,
            avgCpc: avgCpc !== null ? avgCpc.toFixed(2) : null,
            avgTopPageBid: avgTopPageBid !== null ? avgTopPageBid.toFixed(2) : null,
            competition,
            aggregatedGrowthYoy: aggregatedGrowthYoy !== null ? aggregatedGrowthYoy.toFixed(2) : null,
            aggregatedGrowth3m: aggregatedGrowth3m !== null ? aggregatedGrowth3m.toFixed(2) : null,
            aggregatedVolatility: aggregatedVolatility.toFixed(2),
            aggregatedTrendStrength: aggregatedTrendStrength.toFixed(2),
            aggregatedOpportunityScore: aggregatedOpportunityScore !== null ? aggregatedOpportunityScore.toFixed(2) : null,
        },
        similarityCalculation: {
            calculated: similarityCalculated,
            cached: similarityCached,
            errors: similarityErrors,
            duration: `${similarityDuration}ms`,
        },
        opportunityScoreCalculation: {
            calculated: opportunityScoresCalculated,
            skipped: opportunityScoresSkipped,
            errors: opportunityScoreErrors,
            duration: `${opportunityScoreDuration}ms`,
        },
        timestamp: new Date().toISOString(),
    });

    return {
        aggregated: {
            avgVolume,
            growth3m: aggregatedGrowth3m !== null ? aggregatedGrowth3m.toString() : null,
            growthYoy: aggregatedGrowthYoy !== null ? aggregatedGrowthYoy.toString() : null,
            competition,
            avgTopPageBid: avgTopPageBid !== null ? avgTopPageBid.toString() : null,
            avgCpc: avgCpc !== null ? avgCpc.toString() : null,
            volatility: aggregatedVolatility.toString(),
            trendStrength: aggregatedTrendStrength.toString(),
            bidEfficiency: aggregatedBidEfficiency !== null ? aggregatedBidEfficiency.toString() : null,
            tac: aggregatedTac !== null ? aggregatedTac.toString() : null,
            sac: aggregatedSac !== null ? aggregatedSac.toString() : null,
            opportunityScore: aggregatedOpportunityScore !== null ? aggregatedOpportunityScore.toString() : null
        },
        keywords: formattedKeywords,
        totalKeywords: keywordsWithData.length,
        similarityCalculation: {
            calculated: similarityCalculated,
            cached: similarityCached,
            errors: similarityErrors,
            duration: `${similarityDuration}ms`,
        },
        opportunityScoreCalculation: {
            calculated: opportunityScoresCalculated,
            skipped: opportunityScoresSkipped,
            errors: opportunityScoreErrors,
            duration: `${opportunityScoreDuration}ms`,
        },
    };
}

export async function registerRoutes(app: Express): Promise<Server> {
    // Location API endpoint (public, no auth required)
    app.get("/api/locations", async (req, res) => {
        try {
            const { search, parentCode } = req.query;
            const { getAllLocations, getLocationChildren, searchLocations, getLocationByCode } = await import("./locations-service");

            if (search && typeof search === 'string') {
                // Search locations
                const results = searchLocations(search, 50);
                res.json({ locations: results });
            } else if (parentCode) {
                // Get children of a parent location
                const parentCodeNum = parseInt(parentCode as string, 10);
                if (isNaN(parentCodeNum)) {
                    return res.status(400).json({ error: "Invalid parentCode" });
                }
                const children = getLocationChildren(parentCodeNum);
                res.json({ locations: children });
            } else {
                // Get root locations (countries)
                const rootLocations = getLocationChildren(null);
                res.json({ locations: rootLocations });
            }
        } catch (error) {
            console.error("Error fetching locations:", error);
            res.status(500).json({ error: "Failed to fetch locations" });
        }
    });

    // Auth middleware - verify Supabase JWT token
    const requireAuth = async (req: any, res: any, next: any) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const token = authHeader.substring(7);
            const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

            if (error || !user) {
                console.error("JWT verification error:", error);
                return res.status(401).json({ message: "Unauthorized" });
            }

            // Get local user by Supabase user ID, or create if doesn't exist
            let localUser;
            try {
                localUser = await storage.getUserBySupabaseUserId(user.id);
            } catch (dbError) {
                console.error("Database error when fetching user:", dbError);
                // If database connection fails, still allow auth but without local profile
                // This is a fallback for when database is temporarily unavailable
                return res.status(503).json({
                    message: "Database temporarily unavailable. Please try again."
                });
            }

            if (!localUser) {
                // Auto-create profile if it doesn't exist (first login after email confirmation)
                const firstName = user.user_metadata?.first_name;
                const lastName = user.user_metadata?.last_name;
                if (!firstName || !lastName || firstName.trim().length < 1 || lastName.trim().length < 1) {
                    return res.status(400).json({
                        message: "Missing required profile information: first name and last name must be provided."
                    });
                }
                try {
                    localUser = await storage.createUser({
                        supabaseUserId: user.id,
                        firstName,
                        lastName,
                        email: user.email || "",
                    });
                    console.log("Auto-created user profile for:", user.email);
                } catch (createError: any) {
                    // Handle duplicate key error (user already exists - race condition)
                    if (createError?.code === '23505' || createError?.message?.includes('duplicate key')) {
                        // User was created by another request, fetch it instead
                        console.log("User already exists (race condition), fetching existing user:", user.email);
                        localUser = await storage.getUserBySupabaseUserId(user.id);
                        if (!localUser) {
                            return res.status(500).json({
                                message: "Failed to retrieve user profile after creation conflict."
                            });
                        }
                    } else {
                        console.error("Failed to auto-create user profile:", createError);
                        return res.status(500).json({
                            message: "Failed to create user profile. Database connection issue."
                        });
                    }
                }
            }

            req.user = localUser;
            req.supabaseUser = user;
            next();
        } catch (error) {
            console.error("Auth middleware error:", error);
            return res.status(401).json({ message: "Unauthorized" });
        }
    };

    // Payment middleware - check if user has paid
    const requirePayment = async (req: any, res: any, next: any) => {
        if (!req.user) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        // Refetch user from database to get latest payment status (req.user might be stale)
        const freshUser = await storage.getUser(req.user.id);

        if (!freshUser) {
            return res.status(404).json({ message: "User not found" });
        }

        // Update req.user with fresh data
        req.user = freshUser;

        if (!freshUser.hasPaid) {
            return res.status(402).json({
                message: "Payment required",
                requiresPayment: true
            });
        }

        next();
    };

    // Auth routes
    // Note: Signup and login are handled by Supabase Auth on the client side
    // This endpoint is called after Supabase creates the user to create the local profile

    app.post("/api/auth/create-profile", requireAuth, async (req, res) => {
        try {
            const { firstName, lastName } = req.body;
            const supabaseUser = req.supabaseUser;

            // Check if profile already exists
            const existingUser = await storage.getUserBySupabaseUserId(supabaseUser.id);
            if (existingUser) {
                return res.json({ user: { id: existingUser.id, email: existingUser.email } });
            }

            // Create user profile
            const user = await storage.createUser({
                supabaseUserId: supabaseUser.id,
                firstName: firstName || supabaseUser.user_metadata?.first_name || "",
                lastName: lastName || supabaseUser.user_metadata?.last_name || "",
                email: supabaseUser.email || "",
            });

            res.json({ user: { id: user.id, email: user.email } });
        } catch (error) {
            console.error("Create profile error:", error);
            res.status(500).json({
                message: error instanceof Error ? error.message : "Failed to create profile",
            });
        }
    });

    app.get("/api/auth/me", requireAuth, async (req, res) => {
        const user = req.user;
        res.json({ user: { id: user.id, email: user.email } });
    });

    app.post("/api/auth/logout", (req, res) => {
        // Logout is handled by Supabase client on frontend
        res.json({ success: true });
    });

    // Payment status endpoint
    app.get("/api/payment/status", requireAuth, async (req, res) => {
        // Refetch user from database to get latest payment status (req.user might be stale)
        const freshUser = await storage.getUser(req.user.id);

        if (!freshUser) {
            return res.status(404).json({ message: "User not found" });
        }

        // Disable caching to ensure fresh payment status
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        res.json({
            hasPaid: freshUser.hasPaid,
            paymentDate: freshUser.paymentDate
        });
    });

    // Manual payment verification endpoint (for testing when webhook fails)
    app.post("/api/payment/verify-session", requireAuth, async (req, res) => {
        try {
            const { sessionId } = req.body;

            console.log(`[Verify Payment] Starting verification for session: ${sessionId}`);

            if (!sessionId) {
                return res.status(400).json({ message: "Session ID is required" });
            }

            // Retrieve the checkout session from Stripe
            const session = await stripe.checkout.sessions.retrieve(sessionId);

            console.log(`[Verify Payment] Session retrieved. Payment status: ${session.payment_status}, Metadata:`, session.metadata);

            if (session.payment_status !== 'paid') {
                console.log(`[Verify Payment] Payment not completed. Status: ${session.payment_status}`);
                return res.status(400).json({
                    message: "Payment not completed",
                    payment_status: session.payment_status
                });
            }

            // Get user ID from metadata
            const userId = session.metadata?.userId;
            console.log(`[Verify Payment] User ID from metadata: ${userId}, Current user: ${req.user.id}`);

            if (!userId || userId !== req.user.id) {
                console.log(`[Verify Payment] Unauthorized: userId mismatch`);
                return res.status(403).json({ message: "Unauthorized" });
            }

            // Update user payment status
            await db.update(users)
                .set({
                    hasPaid: true,
                    paymentDate: new Date(),
                    stripePaymentIntentId: session.payment_intent ? String(session.payment_intent) : null,
                })
                .where(eq(users.id, userId));

            // Verify the update
            const updatedUser = await storage.getUser(userId);

            if (!updatedUser) {
                console.error(`❌ Error: User ${userId} not found after update`);
                return res.status(500).json({ message: "User not found after update" });
            }

            if (updatedUser.hasPaid) {
                console.log(`✅ Manual payment verification: User ${userId} payment status updated successfully. hasPaid: ${updatedUser.hasPaid}`);
            } else {
                console.error(`❌ Error: User ${userId} payment status update failed. hasPaid: ${updatedUser.hasPaid}`);
                return res.status(500).json({ message: "Payment status update failed" });
            }

            res.json({
                success: true,
                message: "Payment verified and status updated",
                hasPaid: updatedUser.hasPaid
            });
        } catch (error) {
            console.error("Payment verification error:", error);
            res.status(500).json({
                message: error instanceof Error ? error.message : "Failed to verify payment",
            });
        }
    });

    // Stripe checkout endpoint
    app.post("/api/stripe/create-checkout", requireAuth, async (req, res) => {
        try {
            const user = req.user;

            // If user already paid, return success
            if (user.hasPaid) {
                return res.json({
                    message: "User already has access",
                    alreadyPaid: true
                });
            }

            if (!process.env.STRIPE_PRICE_ID) {
                return res.status(500).json({
                    message: "Stripe price ID not configured"
                });
            }

            // Create Stripe Checkout Session
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [
                    {
                        price: process.env.STRIPE_PRICE_ID,
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                success_url: `${req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:5000'}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:5000'}/payment-cancelled`,
                customer_email: user.email,
                metadata: {
                    userId: user.id,
                },
            });

            // Store Stripe customer ID if available
            if (session.customer) {
                await db.update(users)
                    .set({ stripeCustomerId: typeof session.customer === 'string' ? session.customer : null })
                    .where(eq(users.id, user.id));
            }

            res.json({
                checkoutUrl: session.url,
                sessionId: session.id
            });
        } catch (error) {
            console.error("Stripe checkout error:", error);
            res.status(500).json({
                message: error instanceof Error ? error.message : "Failed to create checkout session",
            });
        }
    });

    // Stripe webhook endpoint
    app.post("/api/stripe/webhook", express.raw({ type: 'application/json' }), async (req, res) => {
        const sig = req.headers['stripe-signature'];

        if (!sig) {
            return res.status(400).json({ message: "Missing stripe-signature header" });
        }

        if (!process.env.STRIPE_WEBHOOK_SECRET) {
            return res.status(500).json({ message: "Stripe webhook secret not configured" });
        }

        let event;

        try {
            event = stripe.webhooks.constructEvent(
                req.body,
                sig,
                process.env.STRIPE_WEBHOOK_SECRET
            );
        } catch (err) {
            console.error("Webhook signature verification failed:", err);
            return res.status(400).json({ message: `Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}` });
        }

        // Handle the event
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as Stripe.Checkout.Session;

            // Get user ID from metadata
            const userId = session.metadata?.userId;
            if (!userId) {
                console.error("No userId in checkout session metadata");
                return res.status(400).json({ message: "Missing userId in session metadata" });
            }

            // Update user payment status
            try {
                await db.update(users)
                    .set({
                        hasPaid: true,
                        paymentDate: new Date(),
                        stripePaymentIntentId: session.payment_intent ? String(session.payment_intent) : null,
                    })
                    .where(eq(users.id, userId));

                console.log(`✅ Payment completed for user ${userId} - hasPaid set to true`);

                // Verify the update was successful
                const updatedUser = await storage.getUser(userId);
                if (updatedUser?.hasPaid) {
                    console.log(`✅ Verified: User ${userId} payment status updated successfully`);
                } else {
                    console.error(`❌ Warning: User ${userId} payment status update may have failed`);
                }
            } catch (dbError) {
                console.error("Failed to update user payment status:", dbError);
                return res.status(500).json({ message: "Failed to update payment status" });
            }
        } else {
            console.log(`Webhook received event: ${event.type} (not handled)`);
        }

        res.json({ received: true });
    });

    // Health check endpoint for debugging production issues
    app.get("/api/health", async (req, res) => {
        try {
            const dbCheck = await storage.healthCheck();
            res.json({
                status: "ok",
                database: dbCheck,
                environment: process.env.NODE_ENV || "development",
                sessionConfigured: !!req.session,
                trustProxy: req.app.get("trust proxy"),
            });
        } catch (error) {
            res.status(500).json({
                status: "error",
                message: error instanceof Error ? error.message : "Health check failed",
            });
        }
    });

    // Idea generation route
    app.post("/api/generate-idea", requireAuth, async (req, res) => {
        try {
            const { originalIdea, longerDescription, expand } = req.body;
            const userId = req.user.id; // Use authenticated user ID

            let generatedIdea: string;

            // If expand is requested, expand the existing pitch
            if (expand && originalIdea && originalIdea.trim().length > 0) {
                try {
                    generatedIdea = await microSaaSIdeaGenerator.expandIdea(originalIdea.trim());
                } catch (error) {
                    console.error("Error expanding idea:", error);
                    return res.status(500).json({
                        message: "Failed to expand idea",
                        error: error instanceof Error ? error.message : "Unknown error"
                    });
                }
            }
            // If user provided their own idea, use it directly
            else if (originalIdea && originalIdea.trim().length > 0) {
                generatedIdea = originalIdea.trim();
            } else {
                // If longerDescription is requested, generate a longer, more detailed idea
                if (longerDescription) {
                    generatedIdea = await microSaaSIdeaGenerator.generateLongerIdea();
                } else {
                    // Otherwise, use GPT-4o-mini to generate standard microSaaS idea
                    generatedIdea = await microSaaSIdeaGenerator.generateIdea();
                }
            }

            // Create idea immediately and return it
            const idea = await storage.createIdea({
                userId,
                originalIdea: originalIdea || null,
                generatedIdea,
            });

            // Return idea immediately without waiting for name generation
            res.json({ idea: { ...idea, name: null } });

            // Generate name in the background (fire and forget)
            // This allows the user to proceed while the title is being generated
            (async () => {
                try {
                    const generatedName = await microSaaSIdeaGenerator.generateProjectName(generatedIdea);
                    // Name is generated but not stored in DB (ideas table doesn't have name field)
                    // Frontend will fetch it via the /api/idea/:id/name endpoint
                } catch (error) {
                    console.error("Error generating name in background:", error);
                }
            })();
        } catch (error) {
            console.error("Error generating idea:", error);
            res.status(500).json({ message: "Failed to generate idea" });
        }
    });

    // Get or generate idea name endpoint
    app.get("/api/idea/:id/name", requireAuth, async (req, res) => {
        try {
            const ideaId = req.params.id;
            const idea = await storage.getIdea(ideaId);

            if (!idea) {
                return res.status(404).json({ message: "Idea not found" });
            }

            // Verify the idea belongs to the user
            if (idea.userId !== req.user.id) {
                return res.status(403).json({ message: "Unauthorized" });
            }

            // Generate name from the idea
            try {
                const generatedName = await microSaaSIdeaGenerator.generateProjectName(idea.generatedIdea);
                res.json({ name: generatedName });
            } catch (error) {
                console.error("Error generating name:", error);
                res.status(500).json({ message: "Failed to generate name" });
            }
        } catch (error) {
            console.error("Error getting idea name:", error);
            res.status(500).json({ message: "Failed to get idea name" });
        }
    });

    // Get user's ideas
    app.get("/api/ideas", requireAuth, async (req, res) => {
        try {
            const ideas = await storage.getIdeasByUser(req.user.id);

            // Generate keywords for each report if they don't exist
            // This ensures keywords are always available when displaying reports
            const ideasWithKeywords = await Promise.all(
                ideas.map(async (idea) => {
                    if (idea.report && idea.generatedIdea) {
                        // Generate initial 10 keywords (no filters) for display
                        try {
                            const { keywords: keywordData } = await getKeywordsFromVectorDB(
                                idea.generatedIdea,
                                10, // Initial 10 keywords
                                [], // No filters
                            );

                            // Attach opportunity metrics to all keywords before returning
                            const keywordsWithMetrics = keywordData.map((kw) => {
                                // Use precomputed metrics if available, otherwise calculate on-the-fly
                                let metrics: any = null;
                                if ((kw as any).precomputedMetrics) {
                                    metrics = (kw as any).precomputedMetrics;
                                } else {
                                    // Calculate opportunity metrics on-the-fly
                                    metrics = calculateOpportunityScore({
                                        volume: kw.volume || 0,
                                        competition: kw.competition || 0,
                                        cpc: parseFloat(kw.cpc?.toString() || "0"),
                                        topPageBid: parseFloat(kw.topPageBid?.toString() || "0"),
                                        growthYoy: parseFloat(kw.growthYoy?.toString() || "0"),
                                        monthlyData: kw.monthlyData || [],
                                    });
                                }

                                // Attach opportunity metrics to the keyword object
                                return {
                                    ...kw,
                                    volatility: metrics.volatility,
                                    trendStrength: metrics.trendStrength,
                                    bidEfficiency: metrics.bidEfficiency,
                                    tac: metrics.tac,
                                    sac: metrics.sac,
                                    opportunityScore: metrics.opportunityScore,
                                };
                            });

                            return {
                                ...idea,
                                report: {
                                    ...idea.report,
                                    keywords: keywordsWithMetrics,
                                },
                            };
                        } catch (error) {
                            console.error(`[Get Ideas] Error generating keywords for report ${idea.report.id}:`, error);
                            // Return idea with empty keywords if generation fails
                            return idea;
                        }
                    }
                    return idea;
                })
            );

            // OPTIMIZATION: Removed expensive isKeyword check that was adding 12+ seconds
            // The isKeyword badge is not critical for initial page load
            // If needed, this can be computed lazily or cached in the database
            res.json(ideasWithKeywords);
        } catch (error) {
            console.error("[Get Ideas Error]:", error);
            res.status(500).json({ message: "Failed to fetch ideas" });
        }
    });

    // Delete an idea
    app.delete("/api/ideas/:id", requireAuth, async (req, res) => {
        try {
            const { id } = req.params;
            const idea = await storage.getIdea(id);

            if (!idea) {
                return res.status(404).json({ message: "Idea not found" });
            }

            if (idea.userId !== req.user.id) {
                return res.status(403).json({ message: "Forbidden" });
            }

            await storage.deleteIdea(id);
            res.json({ success: true });
        } catch (error) {
            console.error("Error deleting idea:", error);
            res.status(500).json({ message: "Failed to delete idea" });
        }
    });

    // Generate report for an idea
    app.post("/api/generate-report", requireAuth, async (req, res) => {
        try {
            const { ideaId, keywordCount = 20, filters = [] } = req.body;

            // Check payment requirement if filters are provided
            if (filters && filters.length > 0) {
                // Refetch user from database to get latest payment status (req.user might be stale)
                const freshUser = await storage.getUser(req.user.id);
                if (!freshUser || !freshUser.hasPaid) {
                    return res.status(402).json({
                        message: "Payment required to use advanced filters",
                        requiresPayment: true
                    });
                }
                // Update req.user with fresh data
                req.user = freshUser;
            }

            // Validate keywordCount (preload 20 keywords by default)
            const validatedCount = Math.max(
                1,
                Math.min(100, parseInt(keywordCount) || 20),
            );

            const idea = await storage.getIdea(ideaId);
            if (!idea) {
                return res.status(404).json({ message: "Idea not found" });
            }

            if (idea.userId !== req.user.id) {
                return res.status(403).json({ message: "Forbidden" });
            }

            // Check if report already exists
            const existingReport = await storage.getReportByIdeaId(ideaId);

            // Always generate keywords fresh from vector service (new_keywords CSV)
            // This ensures we always use the latest dataset and avoid old incomplete data
            const { keywords: keywordData, aggregates } =
                await getKeywordsFromVectorDB(idea.generatedIdea, validatedCount, filters);

            // Attach opportunity metrics to all keywords before returning
            const keywordsWithMetrics = keywordData.map((kw) => {
                // Use precomputed metrics if available, otherwise calculate on-the-fly
                let metrics: any = null;
                if ((kw as any).precomputedMetrics) {
                    metrics = (kw as any).precomputedMetrics;
                } else {
                    // Calculate opportunity metrics on-the-fly
                    metrics = calculateOpportunityScore({
                        volume: kw.volume || 0,
                        competition: kw.competition || 0,
                        cpc: parseFloat(kw.cpc?.toString() || "0"),
                        topPageBid: parseFloat(kw.topPageBid?.toString() || "0"),
                        growthYoy: parseFloat(kw.growthYoy?.toString() || "0"),
                        monthlyData: kw.monthlyData || [],
                    });
                }

                // Attach opportunity metrics to the keyword object
                return {
                    ...kw,
                    volatility: metrics.volatility,
                    trendStrength: metrics.trendStrength,
                    bidEfficiency: metrics.bidEfficiency,
                    tac: metrics.tac,
                    sac: metrics.sac,
                    opportunityScore: metrics.opportunityScore,
                };
            });

            if (existingReport) {
                // Return existing report but with fresh keywords from vector service
                return res.json({
                    report: existingReport,
                    keywords: keywordsWithMetrics,
                });
            }

            // Create report
            const report = await storage.createReport({
                ideaId,
                userId: req.user.id,
                avgVolume: aggregates.avgVolume,
                growth3m: parseFloat(aggregates.growth3m),
                growthYoy: parseFloat(aggregates.growthYoy),
                competition: aggregates.competition,
                avgTopPageBid: parseFloat(aggregates.avgTopPageBid),
                avgCpc: parseFloat(aggregates.avgCpc),
            });

            // Create keywords with opportunity scores and derived metrics
            const keywordsToInsert = keywordsWithMetrics.map((kw) => {
                return {
                    reportId: report.id,
                    keyword: kw.keyword,
                    volume: kw.volume,
                    competition: kw.competition,
                    cpc: kw.cpc,
                    topPageBid: kw.topPageBid,
                    growth3m: kw.growth3m,
                    growthYoy: kw.growthYoy,
                    similarityScore: kw.similarityScore,
                    growthSlope: kw.growthSlope,
                    growthR2: kw.growthR2,
                    growthConsistency: kw.growthConsistency,
                    growthStability: kw.growthStability,
                    sustainedGrowthScore: kw.sustainedGrowthScore,
                    volatility: kw.volatility,
                    trendStrength: kw.trendStrength,
                    bidEfficiency: kw.bidEfficiency,
                    tac: kw.tac,
                    sac: kw.sac,
                    opportunityScore: kw.opportunityScore,
                    monthlyData: kw.monthlyData,
                };
            });

            // Skip storing keywords in database - always generate fresh from vector service
            // This avoids database bloat and ensures we always use the latest dataset
            // const keywords = await storage.createKeywords(keywordsToInsert);

            res.json({ report, keywords: keywordsWithMetrics });
        } catch (error) {
            console.error("[Generate Report Error]:", error);
            res.status(500).json({
                message: "Failed to generate report",
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });

    // Load more keywords for an existing report (5 at a time)
    app.post("/api/reports/:reportId/load-more", requireAuth, async (req, res) => {
        try {
            const { reportId } = req.params;

            const report = await storage.getReport(reportId);
            if (!report) {
                return res.status(404).json({ message: "Report not found" });
            }

            if (report.userId !== req.user.id) {
                return res.status(403).json({ message: "Forbidden" });
            }

            const idea = await storage.getIdea(report.ideaId);
            if (!idea) {
                return res.status(404).json({ message: "Idea not found" });
            }

            // Fetch 5 more keywords (with filters if provided)
            const { filters = [], existingKeywords = [] } = req.body;

            // Check payment requirement if filters are provided
            if (filters && filters.length > 0) {
                // Refetch user from database to get latest payment status (req.user might be stale)
                const freshUser = await storage.getUser(req.user.id);
                if (!freshUser || !freshUser.hasPaid) {
                    return res.status(402).json({
                        message: "Payment required to use advanced filters",
                        requiresPayment: true
                    });
                }
                // Update req.user with fresh data
                req.user = freshUser;
            }

            // Track existing keywords from client request (not from database)
            const existingKeywordSet = new Set(existingKeywords.map((k: any) => k.keyword || k));
            const TARGET_NEW_KEYWORDS = 5;
            const MAX_ITERATIONS = 5; // Prevent infinite loops
            const MAX_CANDIDATE_POOL = 10000; // Maximum candidate pool size

            // Iterative fetching: expand candidate pool until we get 5 NEW filtered keywords
            let candidatePoolSize = SIMILARITY_CANDIDATE_POOL_SIZE;
            let newKeywordsData: any[] = [];
            let hasMore = false;
            let iterations = 0;
            const seenKeywords = new Set<string>(existingKeywordSet); // Track all keywords seen across iterations

            while (newKeywordsData.length < TARGET_NEW_KEYWORDS && iterations < MAX_ITERATIONS && candidatePoolSize <= MAX_CANDIDATE_POOL) {
                // Request enough candidates to potentially get 5 new filtered keywords
                // Use dynamic candidate pool size to expand search space
                const { keywords: keywordData, hasMore: resultHasMore } = await getKeywordsFromVectorDB(
                    idea.generatedIdea,
                    TARGET_NEW_KEYWORDS * 10, // Request more than needed to account for filtering
                    filters,
                    seenKeywords, // Exclude already loaded keywords AND keywords from previous iterations
                    candidatePoolSize, // Use dynamic candidate pool size
                );

                // Get only new keywords (those not already seen)
                const newKeywords = keywordData.filter(
                    (kw) => !seenKeywords.has(kw.keyword),
                );

                // Add new keywords to seen set to prevent duplicates in next iteration
                newKeywords.forEach(kw => seenKeywords.add(kw.keyword));

                newKeywordsData = [...newKeywordsData, ...newKeywords];
                hasMore = resultHasMore || false;

                // If we got enough new keywords, break
                if (newKeywordsData.length >= TARGET_NEW_KEYWORDS) {
                    break;
                }

                // If no more results available, break
                if (!resultHasMore && newKeywords.length === 0) {
                    break;
                }

                // Expand candidate pool for next iteration
                candidatePoolSize = Math.min(candidatePoolSize * 2, MAX_CANDIDATE_POOL);
                iterations++;
            }

            // Limit to exactly 5 new keywords
            newKeywordsData = newKeywordsData.slice(0, TARGET_NEW_KEYWORDS);

            // Better error handling for edge cases
            if (newKeywordsData.length === 0) {
                if (filters && filters.length > 0) {
                    // Check if we exhausted the candidate pool
                    if (iterations >= MAX_ITERATIONS || candidatePoolSize >= MAX_CANDIDATE_POOL) {
                        return res.status(200).json({
                            keywords: [],
                            noMoreFiltered: true,
                            exhausted: true,
                            message: "No more keywords match your filters. We've searched through all available keywords. Would you like to load keywords without filters?"
                        });
                    }
                    // Filters are too restrictive
                    return res.status(200).json({
                        keywords: [],
                        noMoreFiltered: true,
                        message: "No more keywords match your filters. Would you like to load keywords without filters?"
                    });
                } else {
                    // No filters but no results - exhausted all keywords
                    return res.status(200).json({
                        keywords: [],
                        exhausted: true,
                        message: "No more keywords available for this idea."
                    });
                }
            }

            // Attach opportunity metrics to all new keywords before returning
            const newKeywordsWithMetrics = newKeywordsData.map((kw: any) => {
                // Use precomputed metrics if available, otherwise calculate on-the-fly
                let metrics: any = null;
                if ((kw as any).precomputedMetrics) {
                    metrics = (kw as any).precomputedMetrics;
                } else {
                    // Calculate opportunity metrics on-the-fly
                    metrics = calculateOpportunityScore({
                        volume: kw.volume || 0,
                        competition: kw.competition || 0,
                        cpc: parseFloat(kw.cpc?.toString() || "0"),
                        topPageBid: parseFloat(kw.topPageBid?.toString() || "0"),
                        growthYoy: parseFloat(kw.growthYoy?.toString() || "0"),
                        monthlyData: kw.monthlyData || [],
                    });
                }

                // Attach opportunity metrics to the keyword object
                return {
                    ...kw,
                    volatility: metrics.volatility,
                    trendStrength: metrics.trendStrength,
                    bidEfficiency: metrics.bidEfficiency,
                    tac: metrics.tac,
                    sac: metrics.sac,
                    opportunityScore: metrics.opportunityScore,
                };
            });

            // Create the new keywords with opportunity scores and derived metrics (for potential database storage)
            const keywordsToInsert = newKeywordsWithMetrics.map((kw: any) => {
                return {
                    reportId: report.id,
                    keyword: kw.keyword,
                    volume: kw.volume,
                    competition: kw.competition,
                    cpc: kw.cpc,
                    topPageBid: kw.topPageBid,
                    growth3m: kw.growth3m,
                    growthYoy: kw.growthYoy,
                    similarityScore: kw.similarityScore,
                    growthSlope: kw.growthSlope,
                    growthR2: kw.growthR2,
                    growthConsistency: kw.growthConsistency,
                    growthStability: kw.growthStability,
                    sustainedGrowthScore: kw.sustainedGrowthScore,
                    volatility: kw.volatility,
                    trendStrength: kw.trendStrength,
                    bidEfficiency: kw.bidEfficiency,
                    tac: kw.tac,
                    sac: kw.sac,
                    opportunityScore: kw.opportunityScore,
                    monthlyData: kw.monthlyData,
                };
            });

            // Skip storing keywords in database - always generate fresh from vector service
            // This avoids database bloat and ensures we always use the latest dataset
            // const newKeywords = await storage.createKeywords(keywordsToInsert);

            res.json({ keywords: newKeywordsWithMetrics });
        } catch (error) {
            console.error("[Load More Keywords Error]:", error);
            res.status(500).json({
                message: "Failed to load more keywords",
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });

    // Preview keyword count with filters (for UI preview)
    // Counts across ALL keywords in the database, not just top N similar ones
    app.post("/api/preview-filter-count", requireAuth, async (req, res) => {
        try {
            const { ideaText, filters = [] } = req.body;
            if (!filters || filters.length === 0) {
                // If no filters, we can't provide an accurate count without an idea
                // Return null to indicate count is not applicable
                return res.json({ count: null });
            }

            // Check payment requirement for advanced filters
            // Refetch user from database to get latest payment status (req.user might be stale)
            const freshUser = await storage.getUser(req.user.id);
            if (!freshUser || !freshUser.hasPaid) {
                return res.status(402).json({
                    message: "Payment required to use advanced filters",
                    requiresPayment: true
                });
            }

            // Update req.user with fresh data
            req.user = freshUser;

            // Get ALL keywords from the database (not limited by similarity)
            const allRawKeywords = await keywordVectorService.getAllKeywords();

            // Categorize filters into raw vs processed
            const { rawFilters, processedFilters } = categorizeFilters(filters);

            // Phase 1: Apply raw filters on raw data (fast, no processing needed)
            let filteredRawKeywords = allRawKeywords;
            if (rawFilters.length > 0) {
                filteredRawKeywords = applyRawFilters(allRawKeywords, rawFilters);
            }

            // If no keywords pass raw filters, return 0
            if (filteredRawKeywords.length === 0) {
                return res.json({ count: 0 });
            }

            // Phase 2: Process only remaining candidates and apply processed filters
            // Only process keywords that passed raw filters (much smaller set)
            let filteredKeywords = filteredRawKeywords;
            if (processedFilters.length > 0) {
                // Process keywords to standardized format
                const processedKeywords = processKeywords(filteredRawKeywords);

                // Apply filters that require processed/computed metrics
                filteredKeywords = applyFilters(processedKeywords, processedFilters, (kw) => {
                    // Use precomputed metrics if available, otherwise calculate on-the-fly
                    if ((kw as any).precomputedMetrics) {
                        return (kw as any).precomputedMetrics;
                    }
                    // Calculate on-the-fly (backwards compatibility when precomputed metrics not available)
                    return calculateOpportunityScore({
                        volume: kw.volume || 0,
                        competition: kw.competition || 0,
                        cpc: parseFloat(kw.cpc?.toString() || "0"),
                        topPageBid: parseFloat(kw.topPageBid?.toString() || "0"),
                        growthYoy: parseFloat(kw.growthYoy?.toString() || "0"),
                        monthlyData: kw.monthlyData || [],
                    });
                });
            }

            res.json({ count: filteredKeywords.length });
        } catch (error) {
            console.error("[Get Keywords Count Error]:", error);
            res.status(500).json({
                message: "Failed to get keyword count",
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });

    // Delete a keyword
    app.delete("/api/keywords/:id", requireAuth, async (req, res) => {
        try {
            const { id } = req.params;

            // Get the keyword to verify ownership
            const keyword = await storage.getKeyword(id);
            if (!keyword) {
                return res.status(404).json({ message: "Keyword not found" });
            }

            // Get the report to verify user owns it
            const report = await storage.getReport(keyword.reportId);
            if (!report) {
                return res.status(404).json({ message: "Report not found" });
            }

            if (report.userId !== req.user.id) {
                return res.status(403).json({ message: "Forbidden" });
            }

            // Delete the keyword
            await storage.deleteKeyword(id);

            res.json({ success: true });
        } catch (error) {
            console.error("[Delete Keyword Error]:", error);
            res.status(500).json({
                message: "Failed to delete keyword",
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });

    // Get aggregated sector metrics - requires payment
    app.get("/api/sectors/aggregated", requireAuth, requirePayment, async (req, res) => {
        try {
            const sectorsPath = path.join(process.cwd(), "data", "sectors_aggregated_metrics.json");
            const sectorsStructurePath = path.join(process.cwd(), "data", "sectors.json");

            if (!fs.existsSync(sectorsPath)) {
                return res.status(404).json({
                    message: "Sector metrics not found. Please run the aggregation script first.",
                });
            }

            const sectorsData = JSON.parse(fs.readFileSync(sectorsPath, "utf-8"));

            // Also include sector structure for mapping user_types/product_fits to sectors
            let sectorsStructure = null;
            if (fs.existsSync(sectorsStructurePath)) {
                sectorsStructure = JSON.parse(fs.readFileSync(sectorsStructurePath, "utf-8"));
            }

            res.json({
                ...sectorsData,
                sectorsStructure,
            });
        } catch (error) {
            console.error("[Sectors Aggregated Error]:", error);
            res.status(500).json({
                message: "Failed to load sector metrics",
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });

    // Initialize OpenAI client for custom search
    const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    // Generate items from pitch (topics, personas, pain points, features)
    app.post("/api/custom-search/generate-items", requireAuth, requirePayment, async (req, res) => {
        try {
            const { pitch, type } = req.body;

            if (!pitch || typeof pitch !== "string" || pitch.trim().length === 0) {
                return res.status(400).json({ message: "Pitch is required" });
            }

            if (!type || !["topics", "personas", "pain-points", "features"].includes(type)) {
                return res.status(400).json({ message: "Valid type is required (topics, personas, pain-points, or features)" });
            }

            let prompt = "";
            let systemMessage = "";

            switch (type) {
                case "topics":
                    systemMessage = "You are a business analyst. Generate relevant topics related to the given idea pitch.";
                    prompt = `Based on this idea pitch, generate 5-10 relevant topics (keywords or phrases) that describe the main themes, industries, or categories related to this idea.

Idea Pitch:
${pitch}

Generate 5-10 topics as a JSON array of strings. Each topic should be concise (1-3 words). Return ONLY the JSON array, no other text.`;
                    break;

                case "personas":
                    systemMessage = "You are a marketing strategist. Generate target personas based on the given idea pitch.";
                    prompt = `Based on this idea pitch, generate 5-10 target personas (user types) who would benefit from this idea.

Idea Pitch:
${pitch}

Generate 5-10 personas as a JSON array of strings. Each persona should be a brief description (2-4 words). Return ONLY the JSON array, no other text.`;
                    break;

                case "pain-points":
                    systemMessage = "You are a product strategist. Generate pain points that the idea addresses.";
                    prompt = `Based on this idea pitch, generate 5-10 pain points or problems that this idea addresses.

Idea Pitch:
${pitch}

Generate 5-10 pain points as a JSON array of strings. Each pain point should be concise (2-5 words). Return ONLY the JSON array, no other text.`;
                    break;

                case "features":
                    systemMessage = "You are a product manager. Generate key features based on the given idea pitch.";
                    prompt = `Based on this idea pitch, generate 5-10 key features or capabilities that this idea would provide.

Idea Pitch:
${pitch}

Generate 5-10 features as a JSON array of strings. Each feature should be concise (2-4 words). Return ONLY the JSON array, no other text.`;
                    break;
            }

            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: systemMessage,
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                max_tokens: 300,
                temperature: 0.7,
            });

            let content = response.choices[0]?.message?.content?.trim();
            if (!content) {
                throw new Error("No content generated from OpenAI");
            }

            // Strip markdown code blocks (```json and ```) - handle various formats
            content = content
                .replace(/^```json\s*/i, "")  // Remove ```json at start
                .replace(/^```\s*/i, "")      // Remove ``` at start (if no json)
                .replace(/\s*```$/i, "")      // Remove ``` at end
                .replace(/```json/gi, "")     // Remove any ```json in middle
                .replace(/```/g, "")          // Remove any remaining ```
                .trim();

            // Parse JSON array from response
            let items: string[] = [];
            try {
                // Try to parse as JSON array
                const parsed = JSON.parse(content);
                if (Array.isArray(parsed)) {
                    items = parsed.filter((item) => typeof item === "string" && item.trim().length > 0);
                } else {
                    // If not an array, try to split by commas or newlines
                    items = content.split(/[,\n]/).map((item) => item.trim()).filter((item) => item.length > 0);
                }
            } catch (parseError) {
                // If JSON parsing fails, try to extract items from text
                // Remove markdown formatting and extract items
                items = content
                    .replace(/^\[/g, "")
                    .replace(/\]$/g, "")
                    .split(/[,\n]/)
                    .map((item) => item.trim().replace(/^["']|["']$/g, "").replace(/^[-*]\s*/, ""))
                    .filter((item) => item.length > 0);
            }

            if (items.length === 0) {
                throw new Error("No items generated from OpenAI response");
            }

            res.json({ items });
        } catch (error) {
            console.error("Error generating items:", error);
            res.status(500).json({
                message: "Failed to generate items",
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });

    // Find competitors based on idea description
    app.post("/api/custom-search/find-competitors", requireAuth, requirePayment, async (req, res) => {
        try {
            const { pitch, topics, personas, painPoints, features } = req.body;

            if (!pitch || typeof pitch !== "string" || pitch.trim().length === 0) {
                return res.status(400).json({ message: "Pitch is required" });
            }

            const additionalContext: string[] = [];
            if (topics && Array.isArray(topics) && topics.length > 0) {
                additionalContext.push(`Topics: ${topics.join(", ")}`);
            }
            if (personas && Array.isArray(personas) && personas.length > 0) {
                additionalContext.push(`Target Personas: ${personas.join(", ")}`);
            }
            if (painPoints && Array.isArray(painPoints) && painPoints.length > 0) {
                additionalContext.push(`Pain Points: ${painPoints.join(", ")}`);
            }
            if (features && Array.isArray(features) && features.length > 0) {
                additionalContext.push(`Features: ${features.join(", ")}`);
            }

            let competitors: Array<{ name: string; description: string; url?: string | null }> = [];

            // Set up Server-Sent Events for progressive competitor display
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

            // Flush headers immediately to establish SSE connection
            if (typeof res.flushHeaders === 'function') {
                res.flushHeaders();
            }

            // Helper function to send SSE messages
            const sendSSE = (type: string, data: any) => {
                try {
                    const message = `data: ${JSON.stringify({ type, ...data })}\n\n`;
                    res.write(message);
                    // Try to flush if available (Node.js streams)
                    if (typeof (res as any).flush === 'function') {
                        (res as any).flush();
                    }
                } catch (error) {
                    logger.error("Error sending SSE message", {
                        error: error instanceof Error ? error.message : String(error),
                        type,
                    });
                }
            };

            // Try agentic Google search approach if configured
            const isSearchConfigured = isGoogleSearchConfigured();
            if (!isSearchConfigured) {
                logger.info("Google Search API not configured, will use LLM-only approach", {
                    hasApiKey: !!process.env.GOOGLE_SEARCH_API_KEY,
                    hasEngineId: !!process.env.GOOGLE_SEARCH_ENGINE_ID,
                });
            }

            if (isSearchConfigured) {
                try {
                    logger.info("Using Google search for competitor discovery");

                    // Stage 1: Generate search queries
                    sendSSE("progress", { stage: "generating-queries" });
                    const searchQueries = await generateSearchQueries(pitch, additionalContext);
                    logger.info("Generated search queries", { count: searchQueries.length, queries: searchQueries });

                    // Stage 2: Execute searches
                    sendSSE("progress", { stage: "searching" });
                    const searchResults = await searchGoogleMultiple(searchQueries);
                    logger.info("Google search completed", {
                        queriesCount: searchQueries.length,
                        resultsCount: searchResults.length
                    });

                    if (searchResults.length > 0) {
                        // Stage 3: Extract competitors from search results
                        sendSSE("progress", { stage: "extracting" });
                        const extractedCompetitors = await extractCompetitorsFromSearchResults(
                            searchResults,
                            pitch,
                            additionalContext
                        );
                        logger.info("Extracted competitors from search results", {
                            count: extractedCompetitors.length
                        });

                        // Convert to expected format (url is required from search results)
                        competitors = extractedCompetitors.map(comp => ({
                            name: comp.name,
                            description: comp.description,
                            url: comp.url,
                        }));
                    } else {
                        logger.warn("No search results found, falling back to LLM-only approach");
                    }
                } catch (searchError) {
                    const errorMessage = searchError instanceof Error ? searchError.message : String(searchError);
                    const errorStack = searchError instanceof Error ? searchError.stack : undefined;
                    const isRateLimit = (searchError as any)?.isRateLimit === true;
                    const isQuotaExceeded = (searchError as any)?.isQuotaExceeded === true;

                    if (isRateLimit || isQuotaExceeded) {
                        logger.warn("Google Search API rate limit/quota exceeded, falling back to LLM-only approach", {
                            error: errorMessage,
                            isRateLimit,
                            isQuotaExceeded,
                        });
                    } else {
                        logger.error("Google search failed, falling back to LLM-only approach", searchError, {
                            error: errorMessage,
                            stack: errorStack,
                        });
                    }
                    // Fall through to LLM-only approach
                }
            }

            // Fallback to LLM-only approach if search didn't produce results or failed
            if (competitors.length === 0) {
                logger.info("Using LLM-only approach for competitor discovery");
                sendSSE("progress", { stage: "llm-generating" });

                const systemMessage = "You are a competitive intelligence analyst. Analyze ideas and identify real competitors in the market.";

                const prompt = `Based on this idea pitch, identify exactly 12 real competitors (existing products, services, or companies) that address similar problems or target similar audiences.

Idea Pitch:
${pitch}

${additionalContext.length > 0 ? `\nAdditional Context:\n${additionalContext.join("\n")}\n` : ""}

Generate a JSON array of competitor objects. Each object should have:
- name: string (company or product name)
- description: string (brief description of what they do, 10-20 words)
- url: string | null (website URL if known, or null)

Return ONLY the JSON array, no other text. Example format:
[
  {"name": "Competitor A", "description": "Brief description here", "url": "https://example.com"},
  {"name": "Competitor B", "description": "Brief description here", "url": null}
]`;

                const response = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        {
                            role: "system",
                            content: systemMessage,
                        },
                        {
                            role: "user",
                            content: prompt,
                        },
                    ],
                    max_tokens: 800,
                    temperature: 0.7,
                });

                let content = response.choices[0]?.message?.content?.trim();
                if (!content) {
                    throw new Error("No content generated from OpenAI");
                }

                // Strip markdown code blocks (```json and ```) - handle various formats
                content = content
                    .replace(/^```json\s*/i, "")  // Remove ```json at start
                    .replace(/^```\s*/i, "")      // Remove ``` at start (if no json)
                    .replace(/\s*```$/i, "")      // Remove ``` at end
                    .replace(/```json/gi, "")     // Remove any ```json in middle
                    .replace(/```/g, "")          // Remove any remaining ```
                    .trim();

                // Parse JSON array from response
                try {
                    const parsed = JSON.parse(content);
                    if (Array.isArray(parsed)) {
                        competitors = parsed.map((comp: any) => ({
                            name: comp.name || comp.title || "Unknown",
                            description: comp.description || comp.desc || "",
                            url: comp.url || null,
                        })).filter((comp: any) => comp.name !== "Unknown" && comp.description.length > 0);
                    }
                } catch (parseError) {
                    console.error("Error parsing competitors JSON:", parseError);
                    throw new Error("Failed to parse competitors response");
                }
            }

            if (competitors.length === 0) {
                throw new Error("No competitors found");
            }

            // Stage 4: Validate competitor URLs
            sendSSE("progress", { 
                stage: "validating", 
                completedCount: 0, 
                totalCount: competitors.length 
            });
            logger.info("Validating competitor URLs", { count: competitors.length });

            // Start all validations in parallel and send results as they complete
            const validatedCompetitors: Array<{ name: string; description: string; url?: string | null }> = [];
            let completedCount = 0;
            const totalCount = competitors.length;

            // Create promises that both validate and send results immediately when they complete
            const validationPromises = competitors.map((competitor) => {
                // Handle competitors without URLs immediately (they're valid)
                if (!competitor.url) {
                    validatedCompetitors.push(competitor);
                    logger.debug("Sending competitor via SSE (no URL)", { competitor: competitor.name });
                    sendSSE("competitor", { competitor });
                    // Update progress
                    sendSSE("progress", { 
                        stage: "validating", 
                        completedCount: validatedCompetitors.length, 
                        totalCount: competitors.length 
                    });
                    completedCount++;
                    return Promise.resolve({ competitor, isValid: true });
                }

                // For competitors with URLs, validate and send when done
                return validateCompetitorUrl(competitor.url)
                    .then((validation) => {
                        // Keep only if URL is valid and accessible
                        if (validation.isValid && validation.isAccessible) {
                            validatedCompetitors.push(competitor);
                            logger.debug("Sending competitor via SSE (validated)", { competitor: competitor.name });
                            sendSSE("competitor", { competitor });
                            // Update progress
                            sendSSE("progress", { 
                                stage: "validating", 
                                completedCount: validatedCompetitors.length, 
                                totalCount: competitors.length 
                            });
                            return { competitor, isValid: true };
                        } else {
                            // Log validation failure
                            logger.debug("Filtering out competitor with invalid/inaccessible URL", {
                                competitor: competitor.name,
                                url: competitor.url,
                                error: validation.error,
                                finalUrl: validation.finalUrl,
                            });
                            return { competitor, isValid: false };
                        }
                    })
                    .catch((error) => {
                        logger.warn("URL validation failed with rejection", {
                            competitor: competitor.name,
                            url: competitor.url,
                            error: error instanceof Error ? error.message : String(error),
                        });
                        // If validation itself fails, filter out competitors with URLs
                        return { competitor, isValid: false };
                    })
                    .finally(() => {
                        completedCount++;
                    });
            });

            // Wait for all validations to complete (they're all running in parallel)
            await Promise.allSettled(validationPromises);

            logger.info("URL validation complete", {
                originalCount: competitors.length,
                validatedCount: validatedCompetitors.length,
                filteredCount: competitors.length - validatedCompetitors.length,
            });

            if (validatedCompetitors.length === 0) {
                logger.warn("No valid competitors found after validation");
                sendSSE("error", { error: "No valid competitors found after URL validation" });
                res.end();
                return;
            }

            // Send completion message with all validated competitors
            logger.info("Sending completion message via SSE", { count: validatedCompetitors.length });
            sendSSE("complete", { competitors: validatedCompetitors });
            res.end();
        } catch (error) {
            console.error("Error finding competitors:", error);
            // Check if SSE headers are already set
            if (res.headersSent || res.getHeader('Content-Type') === 'text/event-stream') {
                const sendSSE = (type: string, data: any) => {
                    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
                };
                sendSSE("error", {
                    error: error instanceof Error ? error.message : "Unknown error"
                });
                res.end();
            } else {
                res.status(500).json({
                    message: "Failed to find competitors",
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        }
    });

    // Custom Search Projects API
    // Get all projects for user (with pagination support)
    app.get("/api/custom-search/projects", requireAuth, async (req, res) => {
        try {
            const startTime = Date.now();
            // Always use pagination - default to page 1, limit 10 if not specified
            const page = req.query.page ? parseInt(req.query.page as string) : 1;
            const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
            
            const projectsStartTime = Date.now();
            // Always use paginated method for better performance
            const result = await storage.getCustomSearchProjectsPaginated(req.user.id, page, limit);
            const projects = result.projects;
            const total = result.total;
            console.log(`[Projects API] Fetched ${projects.length} projects (page ${page}, limit ${limit}) in ${Date.now() - projectsStartTime}ms`);

            // Batch get keyword counts for all projects at once (much faster than N queries)
            const countsStartTime = Date.now();
            const projectIds = projects.map(p => p.id);
            const keywordCounts = await storage.getProjectKeywordCounts(projectIds);
            console.log(`[Projects API] Got keyword counts for ${projectIds.length} projects in ${Date.now() - countsStartTime}ms`);

            // Enrich projects with keyword counts and progress
            const projectsWithStats = projects.map((project) => {
                    // Get keyword count from batch result
                    const keywordCount = keywordCounts.get(project.id) || 0;

                    // Extract progress information
                    const progress = project.keywordGenerationProgress;
                    let currentStage = null;
                    let progressInfo = null;

                    if (progress) {
                        currentStage = progress.currentStage || progress.stage || null;

                        // Determine progress info based on stage
                        if (currentStage === 'complete' || progress.completedAt) {
                            progressInfo = {
                                stage: 'complete',
                                label: 'Complete',
                                newKeywordsCollected: progress.newKeywordsCollected || progress.newKeywords?.length || 0,
                            };
                        } else if (currentStage === 'generating-report' || progress.reportGenerated) {
                            progressInfo = {
                                stage: 'generating-report',
                                label: 'Generating Report',
                                newKeywordsCollected: progress.newKeywordsCollected || progress.newKeywords?.length || 0,
                            };
                        } else if (currentStage === 'computing-metrics' || progress.metricsComputed) {
                            progressInfo = {
                                stage: 'computing-metrics',
                                label: 'Computing Metrics',
                                metricsProcessedCount: progress.metricsProcessedCount || 0,
                                newKeywordsCollected: progress.newKeywordsCollected || progress.newKeywords?.length || 0,
                            };
                        } else if (currentStage === 'fetching-dataforseo' || progress.dataForSEOFetched) {
                            progressInfo = {
                                stage: 'fetching-dataforseo',
                                label: 'Fetching Data',
                                keywordsFetchedCount: progress.keywordsFetchedCount || 0,
                                newKeywordsCollected: progress.newKeywordsCollected || progress.newKeywords?.length || 0,
                            };
                        } else if (currentStage === 'generating-keywords' || progress.newKeywordsCollected) {
                            progressInfo = {
                                stage: 'generating-keywords',
                                label: 'Generating Keywords',
                                newKeywordsCollected: progress.newKeywordsCollected || progress.newKeywords?.length || 0,
                            };
                        } else if (currentStage === 'generating-seeds' || progress.seedsGenerated) {
                            progressInfo = {
                                stage: 'generating-seeds',
                                label: 'Generating Seeds',
                                seedsGenerated: progress.seedsGenerated || progress.seeds?.length || 0,
                            };
                        } else if (currentStage === 'calling-api') {
                            progressInfo = {
                                stage: 'calling-api',
                                label: 'Initializing',
                            };
                        }
                    }

                    return {
                        ...project,
                        keywordCount,
                        progress: progressInfo,
                    };
                });

            const response: any = { projects: projectsWithStats };
            if (total !== undefined) {
                response.total = total;
                response.page = page;
                response.limit = limit;
                response.totalPages = Math.ceil(total / limit);
            }

            console.log(`[Projects API] Total request time: ${Date.now() - startTime}ms`);
            res.json(response);
        } catch (error) {
            console.error("Error fetching projects:", error);
            res.status(500).json({
                message: "Failed to fetch projects",
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });

    // Get project keywords status
    app.get("/api/custom-search/projects/:id/keywords-status", requireAuth, async (req, res) => {
        try {
            const { id } = req.params;
            const userId = req.user.id;

            // Verify project ownership
            const project = await storage.getCustomSearchProject(id);
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            if (project.userId !== userId) {
                return res.status(403).json({ message: "Unauthorized" });
            }

            // Get all keywords for the project
            const keywords = await storage.getProjectKeywords(id);

            // Count keywords with data (volume is not null)
            const keywordsWithData = keywords.filter(kw => kw.volume !== null && kw.volume !== undefined);

            // Count keywords with metrics computed (growthYoy or growth3m is not null)
            const keywordsWithMetrics = keywords.filter(kw =>
                kw.volume !== null &&
                kw.volume !== undefined &&
                (kw.growthYoy !== null || kw.growth3m !== null)
            );

            // Get unique source websites from all keywords
            const sourceWebsitesSet = new Set<string>();
            keywords.forEach((kw: any) => {
                if (kw.sourceWebsites && Array.isArray(kw.sourceWebsites)) {
                    kw.sourceWebsites.forEach((site: string) => sourceWebsitesSet.add(site));
                }
            });
            const sourceWebsites = Array.from(sourceWebsitesSet);

            // Get keywords from saved progress (for display)
            const savedProgress = project.keywordGenerationProgress;
            let keywordList = savedProgress?.newKeywords || [];

            // If no keywords in saved progress but we have keywords in database, use those
            if (keywordList.length === 0 && keywords.length > 0) {
                keywordList = keywords.map(kw => kw.keyword);
            }

            res.json({
                totalKeywords: keywords.length,
                keywordsWithData: keywordsWithData.length,
                keywordsWithMetrics: keywordsWithMetrics.length,
                keywordList: keywordList,
                hasDataForSEO: keywordsWithData.length > 0,
                hasMetrics: keywordsWithMetrics.length > 0,
                sourceWebsites: sourceWebsites,
            });
        } catch (error) {
            console.error("Error fetching project keywords status:", error);
            res.status(500).json({
                message: "Failed to fetch project keywords status",
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });

    // Get single project
    app.get("/api/custom-search/projects/:id", requireAuth, async (req, res) => {
        try {
            const { id } = req.params;
            const project = await storage.getCustomSearchProject(id);

            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }

            // Verify ownership
            if (project.userId !== req.user.id) {
                return res.status(403).json({ message: "Forbidden" });
            }

            res.json({ project });
        } catch (error) {
            console.error("Error fetching project:", error);
            res.status(500).json({
                message: "Failed to fetch project",
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });

    // Create new project
    app.post("/api/custom-search/projects", requireAuth, requirePayment, async (req, res) => {
        try {
            const { name, pitch, topics, personas, painPoints, features, competitors } = req.body;

            // Generate project name if not provided
            let projectName = name;
            if (!projectName || projectName.trim().length === 0) {
                // Use timestamp for blank projects (name will be generated when idea is generated)
                const date = new Date();
                projectName = `Project - ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
            }

            const project = await storage.createCustomSearchProject({
                userId: req.user.id,
                name: projectName,
                pitch: pitch || "",
                topics: topics || [],
                personas: personas || [],
                painPoints: painPoints || [],
                features: features || [],
                competitors: competitors || [],
            });

            res.json({ project });
        } catch (error) {
            console.error("Error creating project:", error);
            res.status(500).json({
                message: "Failed to create project",
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });

    // Update project
    app.put("/api/custom-search/projects/:id", requireAuth, requirePayment, async (req, res) => {
        try {
            const { id } = req.params;
            const { name, pitch, topics, personas, painPoints, features, competitors } = req.body;

            // Verify project exists and user owns it
            const existingProject = await storage.getCustomSearchProject(id);
            if (!existingProject) {
                return res.status(404).json({ message: "Project not found" });
            }
            if (existingProject.userId !== req.user.id) {
                return res.status(403).json({ message: "Forbidden" });
            }

            // Build update data (only include provided fields)
            const updateData: any = {};
            if (name !== undefined) updateData.name = name;
            if (pitch !== undefined) updateData.pitch = pitch;
            if (topics !== undefined) updateData.topics = topics;
            if (personas !== undefined) updateData.personas = personas;
            if (painPoints !== undefined) updateData.painPoints = painPoints;
            if (features !== undefined) updateData.features = features;
            if (competitors !== undefined) updateData.competitors = competitors;

            const project = await storage.updateCustomSearchProject(id, updateData);
            res.json({ project });
        } catch (error) {
            console.error("Error updating project:", error);
            res.status(500).json({
                message: "Failed to update project",
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });

    // Delete project
    app.delete("/api/custom-search/projects/:id", requireAuth, requirePayment, async (req, res) => {
        try {
            const { id } = req.params;

            // Verify project exists and user owns it
            const project = await storage.getCustomSearchProject(id);
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            if (project.userId !== req.user.id) {
                return res.status(403).json({ message: "Forbidden" });
            }

            await storage.deleteCustomSearchProject(id);
            res.json({ message: "Project deleted successfully" });
        } catch (error) {
            console.error("Error deleting project:", error);
            res.status(500).json({
                message: "Failed to delete project",
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });

    // Unified endpoint: Generate full report (seeds -> keywords -> DataForSEO -> metrics -> report)
    app.post("/api/custom-search/generate-full-report", requireAuth, requirePayment, async (req, res) => {
        const projectIdForError = req.body.projectId; // Capture for error handling
        let lastProgress: any = null;
        let lastSaveTime = Date.now();
        const SAVE_INTERVAL = 10000; // Save every 10 seconds

        try {
            const { projectId, pitch, topics, personas, painPoints, features, queryKeywords, resumeFromProgress } = req.body;

            // Verify project exists and user owns it
            if (!projectId) {
                return res.status(400).json({ message: "projectId is required" });
            }

            const project = await storage.getCustomSearchProject(projectId);
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            if (project.userId !== req.user.id) {
                return res.status(403).json({ message: "Forbidden" });
            }

            // Set up Server-Sent Events for progress updates
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

            // Get saved progress or use provided resumeFromProgress
            const savedProgress = resumeFromProgress || project.keywordGenerationProgress;

            // Helper function to send progress updates
            const sendProgress = (stage: string, data: any) => {
                const progress = {
                    type: 'progress',
                    stage,
                    currentStage: stage,
                    ...data
                };
                res.write(`data: ${JSON.stringify(progress)}\n\n`);
                lastProgress = progress;
            };

            // Helper function to save progress
            const saveProgress = async (progressData: any) => {
                try {
                    // Get current saved progress to preserve existing state
                    const currentProgress = project.keywordGenerationProgress || {};

                    // Create progress object directly
                    const progressToSave: any = {
                        currentStage: progressData.currentStage || progressData.stage || currentProgress.currentStage || 'initializing',
                        stage: progressData.currentStage || progressData.stage || currentProgress.currentStage || 'initializing',
                        ...progressData,
                        newKeywords: progressData.newKeywords || [],
                        // Add full pipeline tracking fields - preserve existing values if not provided
                        dataForSEOFetched: progressData.dataForSEOFetched !== undefined ? progressData.dataForSEOFetched : (currentProgress.dataForSEOFetched || false),
                        metricsComputed: progressData.metricsComputed !== undefined ? progressData.metricsComputed : (currentProgress.metricsComputed || false),
                        reportGenerated: progressData.reportGenerated !== undefined ? progressData.reportGenerated : (currentProgress.reportGenerated || false),
                        keywordsFetchedCount: progressData.keywordsFetchedCount !== undefined ? progressData.keywordsFetchedCount : (currentProgress.keywordsFetchedCount || 0),
                        metricsProcessedCount: progressData.metricsProcessedCount !== undefined ? progressData.metricsProcessedCount : (currentProgress.metricsProcessedCount || 0),
                    };

                    // Preserve other fields from current progress if not provided
                    if (!progressData.seeds && currentProgress.seeds) {
                        progressToSave.seeds = currentProgress.seeds;
                    }
                    if (!progressData.processedSeeds && currentProgress.processedSeeds) {
                        progressToSave.processedSeeds = currentProgress.processedSeeds;
                    }
                    if (!progressData.seedSimilarities && currentProgress.seedSimilarities) {
                        progressToSave.seedSimilarities = currentProgress.seedSimilarities;
                    }
                    if (!progressData.queryKeywords && currentProgress.queryKeywords) {
                        progressToSave.queryKeywords = currentProgress.queryKeywords;
                    }
                    if (!progressData.taskId && currentProgress.taskId) {
                        progressToSave.taskId = currentProgress.taskId;
                    }
                    if (!progressData.dataForSEOResults && currentProgress.dataForSEOResults) {
                        progressToSave.dataForSEOResults = currentProgress.dataForSEOResults;
                    }
                    if (!progressData.dataForSEOSiteResults && currentProgress.dataForSEOSiteResults) {
                        progressToSave.dataForSEOSiteResults = currentProgress.dataForSEOSiteResults;
                    }

                    await storage.saveKeywordGenerationProgress(projectId, progressToSave);
                    lastSaveTime = Date.now();

                    // Update local project reference to reflect saved progress
                    project.keywordGenerationProgress = progressToSave;
                } catch (error) {
                    console.error("Error saving progress:", error);
                }
            };

            // Use provided inputs or project data
            const input = {
                pitch: pitch || project.pitch || "",
                topics: topics || project.topics || [],
                personas: personas || project.personas || [],
                painPoints: painPoints || project.painPoints || [],
                features: features || project.features || [],
                competitors: project.competitors || [],
            };

            // Get query keywords from request, saved progress, or project
            const queryKeywordsList = queryKeywords || savedProgress?.queryKeywords || project.queryKeywords || [];

            // Validate query keywords (1-20 required) - but allow resuming if we have saved progress with keywords
            if ((!queryKeywordsList || !Array.isArray(queryKeywordsList) || queryKeywordsList.length === 0 || queryKeywordsList.length > 20)
                && (!savedProgress || !savedProgress.newKeywords || savedProgress.newKeywords.length === 0)) {
                res.write(`data: ${JSON.stringify({
                    type: 'error',
                    error: "Please provide 1-20 query keywords for keyword discovery."
                })}\n\n`);
                res.end();
                return;
            }

            let finalKeywords: string[] = [];

            // STEP 1: Call keywords_for_keywords API (skip if already done)
            if (!savedProgress || !savedProgress.newKeywords || savedProgress.newKeywords.length === 0) {
                const { getKeywordsForKeywordsLive } = await import("./dataforseo-service");
                const locationCode = req.body.location_code || 2840; // Use provided location or default to US
                const locationName = req.body.location_name;

                // Use live API directly to avoid duplicate calls and save credits
                sendProgress('calling-api', { message: `Fetching keywords with ${queryKeywordsList.length} query keywords...` });

                const dataForSEOResults = await getKeywordsForKeywordsLive(queryKeywordsList, locationCode, locationName);

                // Extract keywords for backward compatibility
                finalKeywords = dataForSEOResults
                    .map(result => result.keyword)
                    .filter(keyword => keyword && keyword.trim().length > 0);

                // Handle case where task completed but returned no results
                if (finalKeywords.length === 0) {
                    res.write(`data: ${JSON.stringify({
                        type: 'error',
                        stage: 'calling-api',
                        error: "No keywords found from API. The query keywords may not have returned any results. Please try different query keywords."
                    })}\n\n`);
                    res.end();
                    return;
                }

                // Save progress with full DataForSEO results (no taskId needed for live API)
                await saveProgress({
                    currentStage: 'calling-api',
                    queryKeywords: queryKeywordsList,
                    newKeywords: finalKeywords,
                    dataForSEOResults: dataForSEOResults,
                    keywordsGenerated: finalKeywords.length,
                    newKeywordsCollected: finalKeywords.length,
                });

                sendProgress('calling-api', { message: `Found ${finalKeywords.length} keywords from API`, newKeywords: finalKeywords });
            } else {
                // Use saved DataForSEO results or keywords
                let dataForSEOResults: typeof import("./dataforseo-service").KeywordsForKeywordsKeywordResult[] | undefined;
                let finalKeywords: string[] = [];

                if (savedProgress.dataForSEOResults && Array.isArray(savedProgress.dataForSEOResults)) {
                    // Use saved DataForSEO results
                    dataForSEOResults = savedProgress.dataForSEOResults as any;
                    finalKeywords = dataForSEOResults
                        .map(result => result.keyword)
                        .filter(keyword => keyword && keyword.trim().length > 0);
                } else if (savedProgress.newKeywords && Array.isArray(savedProgress.newKeywords)) {
                    // Fallback to saved keywords (backward compatibility)
                    finalKeywords = savedProgress.newKeywords;
                    // No need to re-fetch - use saved results if available
                }

                if (finalKeywords.length === 0) {
                    res.write(`data: ${JSON.stringify({
                        type: 'error',
                        error: "No keywords found. Please try again."
                    })}\n\n`);
                    res.end();
                    return;
                }

                sendProgress('calling-api', { message: `Using saved keywords (${finalKeywords.length})`, newKeywords: finalKeywords });
            }

            // Validate that we have keywords before proceeding
            if (!finalKeywords || finalKeywords.length === 0) {
                logger.error("No keywords found from API", {
                    finalKeywordsLength: finalKeywords?.length || 0,
                    queryKeywordsCount: queryKeywordsList.length,
                });
                res.write(`data: ${JSON.stringify({
                    type: 'error',
                    error: "No keywords were found from the API. Please check your query keywords and try again."
                })}\n\n`);
                res.end();
                return;
            }

            logger.info("Keywords ready for next steps", {
                keywordsCount: finalKeywords.length,
            });

            // STEP 2: Process DataForSEO results (skip if already done)
            if (!savedProgress || !savedProgress.dataForSEOFetched) {
                sendProgress('fetching-dataforseo', { message: `Processing metrics for ${finalKeywords.length} keywords...` });

                // Get DataForSEO results from Step 1 (stored in progress)
                let dataForSEOResults: typeof import("./dataforseo-service").KeywordsForKeywordsKeywordResult[] | undefined;

                if (savedProgress && savedProgress.dataForSEOResults && Array.isArray(savedProgress.dataForSEOResults)) {
                    // Use saved DataForSEO results
                    dataForSEOResults = savedProgress.dataForSEOResults as any;
                }
                // No fallback needed - live API is used directly, so results should always be saved

                if (!dataForSEOResults || dataForSEOResults.length === 0) {
                    // Check if we have keywords from saved progress
                    if (savedProgress?.newKeywords && savedProgress.newKeywords.length > 0) {
                        // Use saved keywords instead
                        finalKeywords = savedProgress.newKeywords;
                        sendProgress('fetching-dataforseo', { message: 'Using saved keywords from previous run' });
                    } else {
                        res.write(`data: ${JSON.stringify({
                            type: 'error',
                            stage: 'fetching-dataforseo',
                            error: "No results found. Please try again with different query keywords."
                        })}\n\n`);
                        res.end();
                        return;
                    }
                }

                // Process DataForSEO results using shared function
                const { processDataForSEOResults, saveKeywordsToProject } = await import("./keyword-processing-service");
                const { keywordsToInsert, keywordMap, keywordsWithData } = processDataForSEOResults(dataForSEOResults, finalKeywords);
                // Get target from saved progress for sourceWebsite tracking
                const savedProgressForTarget = project.keywordGenerationProgress;
                const targetForSource = savedProgressForTarget?.target || '';
                const savedKeywordsCount = await saveKeywordsToProject(keywordsToInsert, finalKeywords, projectId, project.pitch, storage, keywordVectorService, targetForSource);

                // Save progress
                await saveProgress({
                    currentStage: 'fetching-dataforseo',
                    dataForSEOFetched: true,
                    keywordsFetchedCount: keywordsWithData,
                    newKeywords: finalKeywords
                });

                sendProgress('fetching-dataforseo', {
                    message: `Fetched metrics: ${keywordsWithData} out of ${finalKeywords.length} keywords had data`,
                    keywordsWithData,
                    totalKeywords: finalKeywords.length
                });
            } else {
                sendProgress('fetching-dataforseo', { message: 'Metrics already fetched, skipping...' });
            }

            // STEP 3: Generate report FIRST (before computing metrics)
            // This allows users to see the report immediately while metrics are computed in the background
            if (!savedProgress || !savedProgress.reportGenerated) {
                logger.info("=== GENERATE REPORT PIPELINE START ===", {
                    projectId,
                    timestamp: new Date().toISOString(),
                });

                sendProgress('generating-report', { message: 'Generating final report...' });

                // Reuse logic from existing generate-report endpoint
                const allKeywords = await storage.getProjectKeywords(projectId);
                logger.debug("Retrieved keywords for report generation", {
                    totalKeywords: allKeywords.length,
                });

                // Include keywords with any data metric (volume, competition, cpc, or topPageBid)
                const keywordsWithData = allKeywords.filter(kw =>
                    (kw.volume !== null && kw.volume !== undefined) ||
                    (kw.competition !== null && kw.competition !== undefined) ||
                    (kw.cpc !== null && kw.cpc !== undefined && kw.cpc !== '') ||
                    (kw.topPageBid !== null && kw.topPageBid !== undefined && kw.topPageBid !== '')
                );

                logger.info("Filtered keywords with data", {
                    totalKeywords: allKeywords.length,
                    keywordsWithData: keywordsWithData.length,
                    keywordsWithoutData: allKeywords.length - keywordsWithData.length,
                });

                if (keywordsWithData.length === 0) {
                    logger.error("No keywords with data found for report generation", {
                        projectId,
                        totalKeywords: allKeywords.length,
                    });
                    // Instead of throwing, send an error via SSE and generate an empty report
                    res.write(`data: ${JSON.stringify({
                        type: 'error',
                        stage: 'generating-report',
                        error: "No keywords with data found. Please ensure keywords have been generated and metrics have been fetched."
                    })}\n\n`);
                    res.end();
                    return;
                }

                // Use helper function to generate report data
                const reportData = await generateReportData(
                    projectId,
                    project,
                    keywordsWithData,
                    keywordVectorService,
                    db,
                    customSearchProjectKeywords
                );

                // Save final progress
                await saveProgress({
                    currentStage: 'complete',
                    reportGenerated: true,
                    newKeywords: finalKeywords
                });

                // Send complete event with report
                logger.info("Sending report to client", {
                    projectId,
                    reportKeywordsCount: reportData.keywords?.length || 0,
                    totalKeywords: reportData.totalKeywords,
                    hasAggregated: !!reportData.aggregated,
                    metricsPending: savedProgress?.metricsComputed === false
                });
                res.write(`data: ${JSON.stringify({
                    type: 'complete',
                    stage: 'complete',
                    currentStage: 'complete',
                    report: {
                        aggregated: reportData.aggregated,
                        keywords: reportData.keywords,
                        totalKeywords: reportData.totalKeywords,
                        metricsPending: savedProgress?.metricsComputed === false
                    }
                })}\n\n`);
            } else {
                logger.info("Report already generated, fetching and sending report data", {
                    projectId,
                });

                // Report already generated, but we still need to fetch and send the data
                const allKeywords = await storage.getProjectKeywords(projectId);
                const keywordsWithData = allKeywords.filter(kw =>
                    (kw.volume !== null && kw.volume !== undefined) ||
                    (kw.competition !== null && kw.competition !== undefined) ||
                    (kw.cpc !== null && kw.cpc !== undefined && kw.cpc !== '') ||
                    (kw.topPageBid !== null && kw.topPageBid !== undefined && kw.topPageBid !== '')
                );

                if (keywordsWithData.length === 0) {
                    logger.error("No keywords with data found for existing report", {
                        projectId,
                        totalKeywords: allKeywords.length,
                    });
                    res.write(`data: ${JSON.stringify({
                        type: 'error',
                        stage: 'generating-report',
                        error: "No keywords with data found."
                    })}\n\n`);
                    res.end();
                    return;
                }

                // Use helper function to generate report data
                const reportData = await generateReportData(
                    projectId,
                    project,
                    keywordsWithData,
                    keywordVectorService,
                    db,
                    customSearchProjectKeywords
                );

                // Send complete event with report
                res.write(`data: ${JSON.stringify({
                    type: 'complete',
                    stage: 'complete',
                    currentStage: 'complete',
                    report: {
                        aggregated: reportData.aggregated,
                        keywords: reportData.keywords,
                        totalKeywords: reportData.totalKeywords,
                        metricsPending: savedProgress?.metricsComputed === false
                    }
                })}\n\n`);
            }

            // Close the response so user can see the report immediately
            res.end();

            // STEP 4: Compute metrics in the background (asynchronously, after sending report)
            // This runs after the response is sent, so it doesn't block the user
            if (!savedProgress || !savedProgress.metricsComputed) {
                // Start metrics computation asynchronously (fire and forget, but with error handling)
                (async () => {
                    try {
                        const metricsStartTime = Date.now();
                        logger.info("=== COMPUTE METRICS PIPELINE START (BACKGROUND) ===", {
                            projectId,
                            timestamp: new Date().toISOString(),
                        });

                        const keywords = await storage.getProjectKeywords(projectId);
                        const { calculateVolatility, calculateTrendStrength } = await import("./opportunity-score");

                        const BATCH_SIZE = 50; // Process 50 keywords concurrently
                        let processedCount = 0;
                        let skippedCount = 0;
                        let errorCount = 0;
                        const totalKeywords = keywords.filter(kw => kw.monthlyData && Array.isArray(kw.monthlyData) && kw.monthlyData.length > 0 && kw.volume !== null).length;
                        const totalBatches = Math.ceil(keywords.length / BATCH_SIZE);

                        logger.info("Starting background metrics computation", {
                            totalKeywords: keywords.length,
                            keywordsWithData: totalKeywords,
                            batchSize: BATCH_SIZE,
                            totalBatches,
                        });

                        // Process keywords in batches
                        for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
                            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
                            const batchStartTime = Date.now();
                            const batch = keywords.slice(i, i + BATCH_SIZE);

                            logger.debug(`[Batch ${batchNumber}/${totalBatches}] Processing batch (background)`, {
                                batchNumber,
                                totalBatches,
                                batchStart: i + 1,
                                batchEnd: Math.min(i + BATCH_SIZE, keywords.length),
                                batchSize: batch.length,
                            });

                            // Process batch concurrently - compute metrics first, then bulk update
                            const batchPromises = batch.map(async (keyword) => {
                                try {
                                    if (!keyword.monthlyData || !Array.isArray(keyword.monthlyData) || keyword.monthlyData.length === 0) {
                                        return { success: false, reason: 'no_monthly_data', keywordId: keyword.id, metrics: null };
                                    }
                                    if (keyword.volume === null || keyword.volume === undefined) {
                                        return { success: false, reason: 'no_volume', keywordId: keyword.id, metrics: null };
                                    }

                                    const monthlyData = keyword.monthlyData;
                                    const sortedMonthlyData = [...monthlyData].sort((a, b) => {
                                        return parseMonthString(a.month) - parseMonthString(b.month);
                                    });

                                    if (sortedMonthlyData.length < 2) {
                                        return { success: false, reason: 'insufficient_data', keywordId: keyword.id, metrics: null };
                                    }

                                    const lastMonth = sortedMonthlyData[sortedMonthlyData.length - 1];
                                    let yoyGrowth: number | null = null;
                                    if (sortedMonthlyData.length >= 12) {
                                        const sameMonthLastYear = sortedMonthlyData[sortedMonthlyData.length - 12];
                                        yoyGrowth = ((lastMonth.volume - sameMonthLastYear.volume) / (sameMonthLastYear.volume + 1)) * 100;
                                    }

                                    let threeMonthGrowth: number | null = null;
                                    if (sortedMonthlyData.length >= 3) {
                                        const threeMonthsAgo = sortedMonthlyData[sortedMonthlyData.length - 3];
                                        if (threeMonthsAgo.volume > 0) {
                                            threeMonthGrowth = ((lastMonth.volume - threeMonthsAgo.volume) / threeMonthsAgo.volume) * 100;
                                        }
                                    }

                                    const volatility = calculateVolatility(sortedMonthlyData);
                                    const growthYoyValue = yoyGrowth !== null ? yoyGrowth : 0;
                                    const trendStrength = calculateTrendStrength(growthYoyValue, volatility);

                                    // Return metrics instead of updating immediately
                                    return {
                                        success: true,
                                        keywordId: keyword.id,
                                        metrics: {
                                            growthYoy: yoyGrowth !== null ? yoyGrowth.toString() : null,
                                            growth3m: threeMonthGrowth !== null ? threeMonthGrowth.toString() : null,
                                            volatility: volatility.toString(),
                                            trendStrength: trendStrength.toString()
                                        }
                                    };
                                } catch (error) {
                                    logger.error("Error computing metrics for keyword (background)", error, {
                                        keywordId: keyword.id,
                                        keyword: keyword.keyword,
                                    });
                                    return { success: false, reason: 'error', keywordId: keyword.id, error, metrics: null };
                                }
                            });

                            const batchResults = await Promise.all(batchPromises);

                            // Store metrics in cache immediately (before saving to DB)
                            // This allows clients to fetch metrics right away
                            let projectMetricsCache = computedMetricsCache.get(projectId);
                            if (!projectMetricsCache) {
                                projectMetricsCache = new Map();
                                computedMetricsCache.set(projectId, projectMetricsCache);
                            }

                            const updatesToApply = batchResults
                                .filter(r => r.success && r.metrics)
                                .map(r => {
                                    // Store in cache immediately
                                    projectMetricsCache.set(r.keywordId, {
                                        volatility: r.metrics!.volatility,
                                        trendStrength: r.metrics!.trendStrength,
                                        growth3m: r.metrics!.growth3m,
                                        growthYoy: r.metrics!.growthYoy,
                                    });
                                    return { keywordId: r.keywordId, metrics: r.metrics! };
                                });

                            // Save to database asynchronously (non-blocking)
                            // This allows the client to get metrics immediately while DB operations happen in background
                            if (updatesToApply.length > 0) {
                                // Don't await - let it run in background
                                storage.bulkUpdateKeywordMetrics(updatesToApply).catch((error) => {
                                    logger.error("Error saving metrics to database (background)", error, {
                                        projectId,
                                        updateCount: updatesToApply.length,
                                    });
                                });
                            }
                            const successful = batchResults.filter(r => r.success).length;
                            const failed = batchResults.filter(r => !r.success);
                            const skipped = failed.filter(r => r.reason !== 'error').length;
                            const errors = failed.filter(r => r.reason === 'error').length;

                            processedCount += successful;
                            skippedCount += skipped;
                            errorCount += errors;

                            const batchDuration = Date.now() - batchStartTime;
                            const avgTimePerKeyword = batch.length > 0 ? batchDuration / batch.length : 0;

                            logger.info(`[Batch ${batchNumber}/${totalBatches}] Batch completed (background)`, {
                                batchNumber,
                                totalBatches,
                                duration: `${batchDuration}ms (${(batchDuration / 1000).toFixed(2)}s)`,
                                avgTimePerKeyword: `${Math.round(avgTimePerKeyword)}ms`,
                                successful,
                                skipped,
                                errors,
                                cumulativeProgress: {
                                    processed: processedCount,
                                    skipped: skippedCount,
                                    errors: errorCount,
                                    total: totalKeywords,
                                    progressPercent: totalKeywords > 0 ? `${((processedCount / totalKeywords) * 100).toFixed(1)}%` : "0%",
                                },
                            });

                            // Save progress after each batch (but don't send SSE since response is closed)
                            try {
                                const currentProgress = project.keywordGenerationProgress || {};
                                const { progressToSaveFormat } = await import("./keyword-collector");
                                const progressToSave = progressToSaveFormat(
                                    { stage: 'computing-metrics', currentStage: 'computing-metrics' },
                                    finalKeywords
                                );
                                progressToSave.currentStage = 'computing-metrics';
                                progressToSave.metricsProcessedCount = processedCount;
                                progressToSave.metricsComputed = false; // Still computing
                                progressToSave.dataForSEOFetched = currentProgress.dataForSEOFetched || false;
                                progressToSave.reportGenerated = currentProgress.reportGenerated || false;
                                progressToSave.keywordsFetchedCount = currentProgress.keywordsFetchedCount || 0;
                                progressToSave.newKeywords = finalKeywords;
                                await storage.saveKeywordGenerationProgress(projectId, progressToSave);
                            } catch (saveError) {
                                logger.error("Error saving metrics progress (background)", saveError, {
                                    projectId,
                                });
                            }
                        }

                        const metricsDuration = Date.now() - metricsStartTime;
                        const avgTimePerKeyword = processedCount > 0 ? metricsDuration / processedCount : 0;

                        // Save final metrics progress
                        try {
                            const currentProgress = project.keywordGenerationProgress || {};
                            const { progressToSaveFormat } = await import("./keyword-collector");
                            const progressToSave = progressToSaveFormat(
                                { stage: 'computing-metrics', currentStage: 'computing-metrics' },
                                finalKeywords
                            );
                            progressToSave.currentStage = 'complete';
                            progressToSave.metricsComputed = true;
                            progressToSave.metricsProcessedCount = processedCount;
                            progressToSave.dataForSEOFetched = currentProgress.dataForSEOFetched || false;
                            progressToSave.reportGenerated = currentProgress.reportGenerated || false;
                            progressToSave.keywordsFetchedCount = currentProgress.keywordsFetchedCount || 0;
                            progressToSave.newKeywords = finalKeywords;
                            await storage.saveKeywordGenerationProgress(projectId, progressToSave);
                        } catch (saveError) {
                            logger.error("Error saving final metrics progress (background)", saveError, {
                                projectId,
                            });
                        }

                        logger.info("=== COMPUTE METRICS PIPELINE COMPLETE (BACKGROUND) ===", {
                            duration: `${metricsDuration}ms (${(metricsDuration / 1000).toFixed(2)}s)`,
                            processed: processedCount,
                            skipped: skippedCount,
                            errors: errorCount,
                            totalKeywords,
                            avgTimePerKeyword: `${Math.round(avgTimePerKeyword)}ms`,
                            successRate: totalKeywords > 0 ? `${((processedCount / totalKeywords) * 100).toFixed(1)}%` : "0%",
                            timestamp: new Date().toISOString(),
                        });
                    } catch (error) {
                        logger.error("Error in background metrics computation", error, {
                            projectId,
                            timestamp: new Date().toISOString(),
                        });
                    }
                })();
            } else {
                logger.info("Skipping metrics computation - already computed", {
                    projectId,
                    metricsProcessedCount: savedProgress.metricsProcessedCount,
                });
            }
        } catch (error) {
            logger.error("Error generating full report", error, {
                projectId: projectIdForError,
                userId: req.user?.id,
                timestamp: new Date().toISOString(),
            });

            // Save error state if we have a project
            if (projectIdForError && lastProgress) {
                try {
                    const { progressToSaveFormat } = await import("./keyword-collector");
                    const errorProgress = progressToSaveFormat(lastProgress, lastProgress.newKeywords || []);
                    errorProgress.currentStage = lastProgress.currentStage || lastProgress.stage || 'error';
                    await storage.saveKeywordGenerationProgress(projectIdForError, errorProgress);
                    logger.debug("Saved error progress", {
                        projectId: projectIdForError,
                        stage: errorProgress.currentStage,
                    });
                } catch (saveError) {
                    logger.error("Error saving error progress", saveError, {
                        projectId: projectIdForError,
                    });
                }
            }

            res.write(`data: ${JSON.stringify({
                type: 'error',
                error: error instanceof Error ? error.message : "Unknown error"
            })}\n\n`);
            res.end();
        }
    });

    // Find keywords from website using DataForSEO keywords_for_site API
    app.post("/api/custom-search/find-keywords-from-website", requireAuth, requirePayment, async (req, res) => {
        try {
            const { projectId, target, location_code, location_name, resume } = req.body;

            // Verify project exists and user owns it
            if (!projectId) {
                return res.status(400).json({ message: "projectId is required" });
            }

            const project = await storage.getCustomSearchProject(projectId);
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            if (project.userId !== req.user.id) {
                return res.status(403).json({ message: "Forbidden" });
            }

            // Start pipeline in background
            executeWebsiteKeywordPipeline(
                projectId,
                target,
                location_code,
                location_name,
                resume === true
            ).catch((error) => {
                logger.error("Error in background pipeline execution", error, {
                    projectId
                });
            });

            // Return immediately with status
            return res.json({
                status: 'running',
                message: 'Pipeline started. Use /api/custom-search/pipeline-status/:projectId to check progress.'
            });
        } catch (error) {
            logger.error("Error starting pipeline", error, {
                projectId: req.body.projectId
            });
            return res.status(500).json({
                message: error instanceof Error ? error.message : "Unknown error"
            });
        }
    });

    /**
     * Background pipeline execution function
     * Runs the pipeline independently of client connection
     */
    async function executeWebsiteKeywordPipeline(
        projectId: string,
        target: string | undefined,
        location_code: number | undefined,
        location_name: string | undefined,
        resume: boolean
    ): Promise<void> {
        // Declare finalKeywords outside try block so it's accessible in catch block
        let finalKeywords: string[] = [];
        try {
            const project = await storage.getCustomSearchProject(projectId);
            if (!project) {
                throw new Error("Project not found");
            }

            // Get saved progress early to check if we're resuming
            let savedProgress = project.keywordGenerationProgress;

            // When resuming, target is optional if we already have progress
            // Otherwise, target is required for new requests
            const isResuming = resume === true || (savedProgress && savedProgress.currentStage && savedProgress.currentStage !== 'complete' && savedProgress.currentStage !== 'error');
            if (!isResuming && (!target || typeof target !== 'string' || target.trim().length === 0)) {
                throw new Error("target (website URL) is required");
            }

            // If resuming and no target provided, try to get it from saved progress or use empty string
            const targetToUse = target?.trim() || savedProgress?.target || '';

            // Helper function to normalize website URL for consistent comparison
            const normalizeWebsite = (website: string): string => {
                if (!website) return '';
                try {
                    // Add protocol if missing
                    const urlWithProtocol = website.startsWith('http') ? website : `https://${website}`;
                    const urlObj = new URL(urlWithProtocol);
                    // Get hostname and remove www.
                    return urlObj.hostname.replace(/^www\./, '').toLowerCase();
                } catch {
                    // If URL parsing fails, just clean it up
                    return website.replace(/^https?:\/\//, '').replace(/^www\./, '').toLowerCase().split('/')[0];
                }
            };

            const normalizedTarget = normalizeWebsite(targetToUse);

            // Helper function to save progress
            const saveProgress = async (progressData: any) => {
                try {
                    // Get current saved progress to preserve existing state
                    const currentProgress = project.keywordGenerationProgress || {};

                    const { progressToSaveFormat } = await import("./keyword-collector");
                    const progressToSave = progressToSaveFormat(
                        { stage: progressData.currentStage || progressData.stage, ...progressData },
                        progressData.newKeywords || []
                    );

                    // Add full pipeline tracking fields - preserve existing values if not provided
                    progressToSave.currentStage = progressData.currentStage || progressData.stage || currentProgress.currentStage;
                    progressToSave.dataForSEOFetched = progressData.dataForSEOFetched !== undefined ? progressData.dataForSEOFetched : (currentProgress.dataForSEOFetched || false);
                    progressToSave.metricsComputed = progressData.metricsComputed !== undefined ? progressData.metricsComputed : (currentProgress.metricsComputed || false);
                    progressToSave.reportGenerated = progressData.reportGenerated !== undefined ? progressData.reportGenerated : (currentProgress.reportGenerated || false);
                    progressToSave.keywordsFetchedCount = progressData.keywordsFetchedCount !== undefined ? progressData.keywordsFetchedCount : (currentProgress.keywordsFetchedCount || 0);
                    progressToSave.metricsProcessedCount = progressData.metricsProcessedCount !== undefined ? progressData.metricsProcessedCount : (currentProgress.metricsProcessedCount || 0);
                    // Preserve task ID if not provided
                    progressToSave.taskId = progressData.taskId !== undefined ? progressData.taskId : (currentProgress.taskId || undefined);
                    // Preserve DataForSEO results if not provided
                    progressToSave.dataForSEOResults = progressData.dataForSEOResults !== undefined ? progressData.dataForSEOResults : (currentProgress.dataForSEOResults || undefined);
                    progressToSave.dataForSEOSiteResults = progressData.dataForSEOSiteResults !== undefined ? progressData.dataForSEOSiteResults : (currentProgress.dataForSEOSiteResults || undefined);
                    // Preserve target
                    if (targetToUse) {
                        progressToSave.target = targetToUse;
                    }

                    await storage.saveKeywordGenerationProgress(projectId, progressToSave);

                    // Update local project reference to reflect saved progress
                    project.keywordGenerationProgress = progressToSave;

                    // Update savedProgress to reflect the new state
                    if (savedProgress) {
                        Object.assign(savedProgress, progressToSave);
                    }
                } catch (error) {
                    logger.error("Error saving progress:", error);
                }
            };

            // Declare siteResults at function scope for error handling
            let siteResults: any[] | undefined = undefined;

            // Check if everything is already done - if so, skip all API calls
            // Note: These checks are done at the start, but savedProgress is updated after each saveProgress call
            // So we need to re-check these flags after each step completes
            let hasKeywords = savedProgress?.newKeywords && Array.isArray(savedProgress.newKeywords) && savedProgress.newKeywords.length > 0;
            let hasDataForSEOResults = savedProgress?.dataForSEOSiteResults && Array.isArray(savedProgress.dataForSEOSiteResults) && savedProgress.dataForSEOSiteResults.length > 0;
            let hasDataForSEOMetrics = savedProgress?.dataForSEOFetched === true;
            let hasReport = savedProgress?.reportGenerated === true;

            // Check if the target website is different from existing ones
            let isDifferentWebsite = true;
            if (normalizedTarget && hasKeywords) {
                // Get existing keywords with their source websites
                const existingKeywords = await storage.getProjectKeywords(projectId);
                const existingSourceWebsites = new Set<string>();
                existingKeywords.forEach((kw: any) => {
                    if (kw.sourceWebsites && Array.isArray(kw.sourceWebsites)) {
                        kw.sourceWebsites.forEach((site: string) => existingSourceWebsites.add(site));
                    }
                });
                
                // Check if this website was already processed
                isDifferentWebsite = !existingSourceWebsites.has(normalizedTarget);
                
                logger.info("Checking if website is different", {
                    projectId,
                    normalizedTarget,
                    existingSourceWebsites: Array.from(existingSourceWebsites),
                    isDifferentWebsite
                });
            }

            // Check if everything is already done for this specific website - if so, skip all API calls
            if (hasKeywords && hasDataForSEOResults && hasDataForSEOMetrics && hasReport && savedProgress && !isDifferentWebsite) {
                logger.info("All API calls already completed for this website, pipeline is complete", {
                    projectId,
                    target: targetToUse,
                    normalizedTarget,
                    keywordsCount: savedProgress.newKeywords?.length || 0,
                    dataForSEOResultsCount: savedProgress.dataForSEOSiteResults?.length || 0,
                });

                // Load keywords from saved progress
                finalKeywords = savedProgress.newKeywords || [];
                siteResults = savedProgress.dataForSEOSiteResults as any;

                // Save progress to mark as complete
                await saveProgress({
                    currentStage: 'complete',
                    reportGenerated: true,
                    newKeywords: finalKeywords
                });

                return; // Pipeline already complete for this website
            }

            // STEP 1: Fetch keywords from website using live API (skip if keywords already found for this website)
            if (!hasKeywords || isDifferentWebsite) {
                // Only fetch if we have a target (not resuming without target)
                if (!targetToUse || targetToUse.trim().length === 0) {
                    const errorMessage = "Cannot fetch keywords: website URL is required. Please provide a website URL or resume from existing progress.";
                    await saveProgress({
                        currentStage: 'error',
                        error: errorMessage
                    });
                    throw new Error(errorMessage);
                }

                logger.info("Fetching keywords from website using live API", { projectId, target: targetToUse });
                await saveProgress({
                    currentStage: 'creating-task', // Keep same stage name for UI consistency
                });

                const { getKeywordsForSiteLive } = await import("./dataforseo-service");
                const locationCode = location_code || 2840; // Default to US if not provided
                const locationName = location_name;

                // Calculate date range: last 4 years from today
                const today = new Date();
                const fourYearsAgo = new Date();
                fourYearsAgo.setFullYear(today.getFullYear() - 4);
                const dateTo = today.toISOString().split('T')[0];
                const dateFrom = fourYearsAgo.toISOString().split('T')[0];

                // Use live API directly to avoid duplicate calls and save credits
                siteResults = await getKeywordsForSiteLive(targetToUse, locationCode, locationName, dateFrom, dateTo);

                logger.info("Live API returned results", {
                    projectId,
                    target: targetToUse,
                    resultsCount: siteResults.length,
                    sampleKeywords: siteResults.slice(0, 5).map(r => r.keyword),
                });

                // Extract keywords for backward compatibility
                // Add diagnostic logging to understand result structure
                if (siteResults.length > 0) {
                    const firstResult = siteResults[0];
                    logger.debug("Sample result structure", {
                        projectId,
                        target: targetToUse,
                        hasKeyword: 'keyword' in firstResult,
                        keywordValue: firstResult.keyword,
                        keywordType: typeof firstResult.keyword,
                        allKeys: Object.keys(firstResult),
                        sampleResult: JSON.stringify(firstResult).substring(0, 200),
                    });
                }

                finalKeywords = siteResults
                    .map(result => result.keyword)
                    .filter(keyword => keyword && keyword.trim().length > 0);

                // Log detailed extraction info
                const emptyKeywords = siteResults.filter(r => !r.keyword || !r.keyword.trim()).length;
                logger.info("Extracted keywords from results", {
                    projectId,
                    target: targetToUse,
                    totalResults: siteResults.length,
                    validKeywords: finalKeywords.length,
                    emptyKeywords: emptyKeywords,
                    sampleKeywords: finalKeywords.slice(0, 5),
                    sampleEmptyResults: siteResults
                        .filter(r => !r.keyword || !r.keyword.trim())
                        .slice(0, 3)
                        .map(r => ({ hasKeyword: 'keyword' in r, keys: Object.keys(r) })),
                });

                // STEP 2: Extract and save keywords
                logger.info("Extracted keywords from website", { projectId, keywordsCount: finalKeywords.length });

                // Save keywords and full DataForSEO results to project progress (no taskId needed for live API)
                await saveProgress({
                    currentStage: 'extracting-keywords',
                    newKeywords: finalKeywords,
                    dataForSEOSiteResults: siteResults,
                    keywordsGenerated: finalKeywords.length,
                    newKeywordsCollected: finalKeywords.length
                });

                logger.info("Saved keywords", { projectId, keywordsCount: finalKeywords.length });

                // Update flags after saving keywords
                hasKeywords = true;
                hasDataForSEOResults = true;

                // Re-fetch project to get updated progress state
                const updatedProject = await storage.getCustomSearchProject(projectId);
                if (updatedProject?.keywordGenerationProgress) {
                    savedProgress = updatedProject.keywordGenerationProgress;
                    // Re-evaluate hasDataForSEOMetrics based on updated progress
                    hasDataForSEOMetrics = savedProgress.dataForSEOFetched === true;
                    // Ensure siteResults is available from saved progress
                    if (savedProgress.dataForSEOSiteResults && Array.isArray(savedProgress.dataForSEOSiteResults)) {
                        siteResults = savedProgress.dataForSEOSiteResults as any;
                    }
                    logger.info("Re-evaluated flags after saving keywords", {
                        projectId,
                        hasKeywords,
                        hasDataForSEOResults,
                        hasDataForSEOMetrics,
                        dataForSEOFetched: savedProgress.dataForSEOFetched,
                        siteResultsCount: siteResults?.length || 0
                    });
                }

                // Immediately transition to next stage if metrics haven't been fetched yet
                if (!hasDataForSEOMetrics) {
                    logger.info("Transitioning to fetching-dataforseo stage after extracting keywords", { projectId });
                    await saveProgress({
                        currentStage: 'fetching-dataforseo',
                    });
                }

                // Update savedProgress reference after extraction
                savedProgress = project.keywordGenerationProgress;
                hasDataForSEOMetrics = savedProgress?.dataForSEOFetched === true;
            } else {
                // Use saved DataForSEO results or keywords
                let finalKeywordsLocal: string[] = [];

                // When resuming, prioritize saved newKeywords if they exist (they're already extracted)
                if (savedProgress && savedProgress.newKeywords && Array.isArray(savedProgress.newKeywords) && savedProgress.newKeywords.length > 0) {
                    // Use saved keywords directly (they're already extracted and validated)
                    finalKeywordsLocal = savedProgress.newKeywords;
                    logger.info("Resuming with saved keywords", {
                        projectId,
                        keywordsCount: finalKeywordsLocal.length,
                    });

                    // Use saved DataForSEO results if available
                    if (savedProgress.dataForSEOSiteResults && Array.isArray(savedProgress.dataForSEOSiteResults)) {
                        siteResults = savedProgress.dataForSEOSiteResults as any;
                    }

                    // Use saved results - no need to re-fetch since we use live API directly
                    if (hasDataForSEOResults && savedProgress) {
                        // Use existing DataForSEO results
                        siteResults = savedProgress.dataForSEOSiteResults as any;
                        logger.info("Using existing DataForSEO results", {
                            projectId,
                            target: targetToUse,
                            resultsCount: siteResults?.length || 0,
                        });
                    }
                } else if (savedProgress && savedProgress.dataForSEOSiteResults && Array.isArray(savedProgress.dataForSEOSiteResults)) {
                    // Fallback: Extract keywords from saved DataForSEO results if newKeywords don't exist
                    siteResults = savedProgress.dataForSEOSiteResults as any;
                    finalKeywordsLocal = siteResults
                        .map(result => result.keyword)
                        .filter(keyword => keyword && keyword.trim().length > 0);
                    logger.info("Extracted keywords from saved DataForSEO results", {
                        projectId,
                        resultsCount: siteResults.length,
                        keywordsCount: finalKeywordsLocal.length,
                    });
                }

                // Use finalKeywordsLocal if we have it, otherwise use finalKeywords from earlier
                if (finalKeywordsLocal && finalKeywordsLocal.length > 0) {
                    finalKeywords = finalKeywordsLocal;
                }

                // Update flags after loading saved keywords
                if (finalKeywords && finalKeywords.length > 0) {
                    hasKeywords = true;
                    hasDataForSEOResults = savedProgress?.dataForSEOSiteResults && Array.isArray(savedProgress.dataForSEOSiteResults) && savedProgress.dataForSEOSiteResults.length > 0;

                    logger.info("Using keywords", { projectId, keywordsCount: finalKeywords.length });
                    await saveProgress({
                        currentStage: 'extracting-keywords',
                        newKeywords: finalKeywords
                    });
                }

                // Validate that we have keywords before proceeding
                // When resuming, if we have saved keywords, use them even if extraction failed
                if (!finalKeywords || finalKeywords.length === 0) {
                    // If resuming and we have saved keywords, use them
                    if (isResuming && savedProgress?.newKeywords && Array.isArray(savedProgress.newKeywords) && savedProgress.newKeywords.length > 0) {
                        finalKeywords = savedProgress.newKeywords;
                        logger.info("Using saved keywords when resuming (extraction failed)", {
                            projectId,
                            savedKeywordsCount: finalKeywords.length,
                        });
                    } else {
                        // No keywords available at all
                        const siteResultsCount = siteResults?.length || 0;

                        logger.warn("No keywords found from website", {
                            projectId,
                            target: targetToUse,
                            siteResultsCount: siteResultsCount,
                            taskId: savedProgress?.taskId,
                            isResuming,
                            hasSavedKeywords: savedProgress?.newKeywords && savedProgress.newKeywords.length > 0,
                            savedKeywordsCount: savedProgress?.newKeywords?.length || 0,
                        });

                        // Provide more detailed error message
                        let errorMessage = "No keywords were found from the website.";
                        let errorDetails = [];

                        if (siteResultsCount > 0) {
                            errorDetails.push(`Returned ${siteResultsCount} results, but none contained valid keywords.`);
                            errorDetails.push("This might indicate an issue with the keyword extraction process.");
                            errorDetails.push("The results may have been filtered out or the keyword field may be missing.");
                        } else {
                            errorDetails.push("No results returned for this website.");
                            errorDetails.push("Possible reasons:");
                            errorDetails.push("• The website URL is incorrect or inaccessible");
                            errorDetails.push("• The website doesn't have enough content for keyword analysis");
                            errorDetails.push("• The website couldn't be analyzed (may need more time)");
                            errorDetails.push("• The website may be blocked or restricted");
                            errorDetails.push("• Both task API and live API returned empty results");
                        }

                        errorDetails.push("\nPlease check the URL and try again, or try a different website.");

                        await saveProgress({
                            currentStage: 'error',
                            error: errorMessage + "\n\n" + errorDetails.join("\n")
                        });
                        throw new Error(errorMessage + "\n\n" + errorDetails.join("\n"));
                    }
                }
            }

            // STEP 3: Process DataForSEO results in memory (skip if already done)
            // This runs regardless of whether keywords were just extracted or loaded from saved progress
            // Re-check flags after potential updates
            savedProgress = project.keywordGenerationProgress;
            hasDataForSEOMetrics = savedProgress?.dataForSEOFetched === true;
            hasDataForSEOResults = savedProgress?.dataForSEOSiteResults && Array.isArray(savedProgress.dataForSEOSiteResults) && savedProgress.dataForSEOSiteResults.length > 0;

            // Variables to hold processed data for report generation
            let processedKeywordsToInsert: Array<{
                keyword: string;
                volume: number | null;
                competition: number | null;
                cpc: number | null;
                topPageBid: number | null;
                monthlyData: Array<{ month: string; volume: number }>;
                source: string;
            }> | null = null;
            let processedKeywordsWithDataCount = 0;

            logger.info("Checking if DataForSEO metrics need to be processed", {
                projectId,
                hasDataForSEOMetrics,
                dataForSEOFetched: savedProgress?.dataForSEOFetched,
                keywordsCount: finalKeywords.length,
                hasDataForSEOResults
            });

            if (!hasDataForSEOMetrics && finalKeywords && finalKeywords.length > 0) {
                logger.info("Processing DataForSEO metrics in memory", { projectId, keywordsCount: finalKeywords.length });
                await saveProgress({
                    currentStage: 'fetching-dataforseo',
                });

                // Get DataForSEO results from Step 1-2 (stored in progress)
                // Note: siteResults is already declared at function scope
                if (savedProgress && savedProgress.dataForSEOSiteResults && Array.isArray(savedProgress.dataForSEOSiteResults)) {
                    // Use saved DataForSEO results
                    siteResults = savedProgress.dataForSEOSiteResults as any;
                }
                // No fallback needed - live API is used directly, so results should always be saved

                if (!siteResults || siteResults.length === 0) {
                    const errorMessage = "No results found. Please try again.";
                    await saveProgress({
                        currentStage: 'error',
                        error: errorMessage
                    });
                    throw new Error(errorMessage);
                }

                // Process DataForSEO results in memory (fast, no database operations)
                const { processDataForSEOResults } = await import("./keyword-processing-service");
                const { keywordsToInsert, keywordsWithData } = processDataForSEOResults(siteResults, finalKeywords);
                processedKeywordsToInsert = keywordsToInsert;
                processedKeywordsWithDataCount = keywordsWithData;

                logger.info("Processed DataForSEO metrics in memory", {
                    projectId,
                    keywordsWithData,
                    totalKeywords: finalKeywords.length
                });
            } else {
                logger.info("DataForSEO metrics already processed, skipping", { projectId });
            }

            // STEP 4: Generate report FIRST (before saving to database)
            // Re-check hasReport flag after potential updates
            savedProgress = project.keywordGenerationProgress;
            hasReport = savedProgress?.reportGenerated === true;

            if (!hasReport) {
                logger.info("=== GENERATE REPORT PIPELINE START ===", {
                    projectId,
                    timestamp: new Date().toISOString(),
                });

                logger.info("Generating final report from in-memory data", { projectId });
                await saveProgress({
                    currentStage: 'generating-report',
                });

                let keywordsForReport: any[] = [];

                // If we just processed keywords in memory, use those
                if (processedKeywordsToInsert && processedKeywordsToInsert.length > 0) {
                    keywordsForReport = convertProcessedKeywordsToReportFormat(processedKeywordsToInsert, projectId);
                    // Get sourceWebsites from database for these keywords
                    const allKeywordsFromDb = await storage.getProjectKeywords(projectId);
                    const keywordToSourceWebsitesMap = new Map<string, string[]>();
                    allKeywordsFromDb.forEach((kw: any) => {
                        keywordToSourceWebsitesMap.set(kw.keyword.toLowerCase(), kw.sourceWebsites || []);
                    });
                    // Add sourceWebsites to keywordsForReport
                    keywordsForReport = keywordsForReport.map(kw => ({
                        ...kw,
                        sourceWebsites: keywordToSourceWebsitesMap.get(kw.keyword.toLowerCase()) || []
                    }));
                    logger.debug("Using in-memory processed keywords for report generation", {
                        totalKeywords: processedKeywordsToInsert.length,
                        keywordsWithData: keywordsForReport.length,
                    });
                } else {
                    // Fallback: load from database (for resume scenarios)
                    const allKeywords = await storage.getProjectKeywords(projectId);
                    logger.debug("Retrieved keywords from database for report generation", {
                        totalKeywords: allKeywords.length,
                    });

                    // Include keywords with any data metric
                    keywordsForReport = allKeywords.filter(kw =>
                        (kw.volume !== null && kw.volume !== undefined) ||
                        (kw.competition !== null && kw.competition !== undefined) ||
                        (kw.cpc !== null && kw.cpc !== undefined && kw.cpc !== '') ||
                        (kw.topPageBid !== null && kw.topPageBid !== undefined && kw.topPageBid !== '')
                    );
                }

                logger.info("Filtered keywords with data", {
                    totalKeywords: processedKeywordsToInsert?.length || 0,
                    keywordsWithData: keywordsForReport.length,
                    keywordsWithoutData: (processedKeywordsToInsert?.length || 0) - keywordsForReport.length,
                });

                if (keywordsForReport.length === 0) {
                    logger.error("No keywords with data found for report generation", {
                        projectId,
                        totalKeywords: processedKeywordsToInsert?.length || 0,
                    });
                    const errorMessage = "No keywords with data found. Please ensure keywords have been generated and metrics have been fetched.";
                    await saveProgress({
                        currentStage: 'error',
                        error: errorMessage
                    });
                    throw new Error(errorMessage);
                }

                // Use helper function to generate report data
                const reportData = await generateReportData(
                    projectId,
                    project,
                    keywordsForReport,
                    keywordVectorService,
                    db,
                    customSearchProjectKeywords
                );

                // Save final progress
                logger.info("Report generated successfully", {
                    projectId,
                    reportKeywordsCount: reportData.keywords?.length || 0,
                    totalKeywords: reportData.totalKeywords,
                    hasAggregated: !!reportData.aggregated,
                    metricsPending: savedProgress?.metricsComputed === false
                });
                await saveProgress({
                    currentStage: 'complete',
                    reportGenerated: true,
                    newKeywords: finalKeywords
                });
            } else {
                logger.info("Report already generated", { projectId });
                // Ensure stage is set to complete when report already exists
                await saveProgress({
                    currentStage: 'complete',
                    reportGenerated: true,
                });
            }

            // STEP 5: Save DataForSEO metrics to database in background (after report generation)
            // This allows users to see the report immediately while database operations happen in background
            if (!hasDataForSEOMetrics && processedKeywordsToInsert && processedKeywordsToInsert.length > 0) {
                // Start database save in background (fire and forget, but with error handling)
                (async () => {
                    try {
                        logger.info("Saving DataForSEO metrics to database (background)", {
                            projectId,
                            keywordsCount: processedKeywordsToInsert!.length,
                        });

                        const { saveKeywordsToProject } = await import("./keyword-processing-service");
                        const savedKeywordsCount = await saveKeywordsToProject(
                            processedKeywordsToInsert!,
                            finalKeywords,
                            projectId,
                            project.pitch || '',
                            storage,
                            keywordVectorService,
                            targetToUse // Pass sourceWebsite
                        );

                        // Update progress after save completes
                        logger.info("Saved DataForSEO metrics to database", {
                            projectId,
                            keywordsWithData: savedKeywordsCount,
                            totalKeywords: finalKeywords.length
                        });
                        await saveProgress({
                            dataForSEOFetched: true,
                            keywordsFetchedCount: savedKeywordsCount
                        });

                        // Re-fetch project to get updated progress state
                        const updatedProject = await storage.getCustomSearchProject(projectId);
                        const currentProgress = updatedProject?.keywordGenerationProgress;

                        // STEP 6: Compute metrics in the background AFTER keywords are saved
                        // This ensures keywords exist in the database before metrics computation starts
                        if (!currentProgress || !currentProgress.metricsComputed) {
                            // Start metrics computation asynchronously (fire and forget, but with error handling)
                            (async () => {
                                let metricsError: Error | null = null;
                                let failedBatches: Array<{ batchNumber: number; error: string }> = [];
                                const MAX_BATCH_RETRIES = 2; // Retry failed batches up to 2 times

                                try {
                                    const metricsStartTime = Date.now();
                                    logger.info("=== COMPUTE METRICS PIPELINE START (BACKGROUND) ===", {
                                        projectId,
                                        timestamp: new Date().toISOString(),
                                    });

                                    const keywords = await storage.getProjectKeywords(projectId);
                                    const { calculateVolatility, calculateTrendStrength } = await import("./opportunity-score");

                                    const BATCH_SIZE = 50; // Process 50 keywords concurrently
                                    let processedCount = 0;
                                    let skippedCount = 0;
                                    let errorCount = 0;
                                    const totalKeywords = keywords.filter(kw => kw.monthlyData && Array.isArray(kw.monthlyData) && kw.monthlyData.length > 0 && kw.volume !== null).length;
                                    const totalBatches = Math.ceil(keywords.length / BATCH_SIZE);

                                    logger.info("Starting background metrics computation", {
                                        totalKeywords: keywords.length,
                                        keywordsWithData: totalKeywords,
                                        batchSize: BATCH_SIZE,
                                        totalBatches,
                                    });

                                    // Helper function to process a batch with retry
                                    const processBatchWithRetry = async (
                                        batch: any[],
                                        batchNumber: number,
                                        retryCount: number = 0
                                    ): Promise<{ successful: number; skipped: number; errors: number; validUpdates: any[] }> => {
                                        const batchStartTime = Date.now();

                                        try {
                                            logger.debug(`[Batch ${batchNumber}/${totalBatches}] Processing batch (background)${retryCount > 0 ? ` [Retry ${retryCount}]` : ''}`, {
                                                batchNumber,
                                                totalBatches,
                                                batchSize: batch.length,
                                                retryCount,
                                            });

                                            const batchUpdates = await Promise.allSettled(
                                                batch.map(async (keyword) => {
                                                    if (!keyword.monthlyData || !Array.isArray(keyword.monthlyData) || keyword.monthlyData.length === 0 || keyword.volume === null) {
                                                        return { keywordId: keyword.id, metrics: null, skipped: true };
                                                    }

                                                    try {
                                                        const monthlyData = keyword.monthlyData;
                                                        const sortedMonthlyData = [...monthlyData].sort((a: any, b: any) => {
                                                            return parseMonthString(a.month) - parseMonthString(b.month);
                                                        });

                                                        const lastMonth = sortedMonthlyData[sortedMonthlyData.length - 1];
                                                        let yoyGrowth: number | null = null;
                                                        if (sortedMonthlyData.length >= 12) {
                                                            const sameMonthLastYear = sortedMonthlyData[sortedMonthlyData.length - 12];
                                                            yoyGrowth = ((lastMonth.volume - sameMonthLastYear.volume) / (sameMonthLastYear.volume + 1)) * 100;
                                                        }

                                                        let threeMonthGrowth: number | null = null;
                                                        if (sortedMonthlyData.length >= 3) {
                                                            const threeMonthsAgo = sortedMonthlyData[sortedMonthlyData.length - 3];
                                                            if (threeMonthsAgo.volume > 0) {
                                                                threeMonthGrowth = ((lastMonth.volume - threeMonthsAgo.volume) / threeMonthsAgo.volume) * 100;
                                                            }
                                                        }

                                                        const volatility = calculateVolatility(sortedMonthlyData);
                                                        const growthYoyValue = yoyGrowth !== null ? yoyGrowth : 0;
                                                        const trendStrength = calculateTrendStrength(growthYoyValue, volatility);
                                                        const opportunityScore = (volatility + trendStrength) / 2;

                                                        return {
                                                            keywordId: keyword.id,
                                                            metrics: {
                                                                growthYoy: yoyGrowth !== null ? yoyGrowth.toString() : null,
                                                                growth3m: threeMonthGrowth !== null ? threeMonthGrowth.toString() : null,
                                                                volatility: volatility.toFixed(2),
                                                                trendStrength: trendStrength.toFixed(2),
                                                                opportunityScore: opportunityScore.toFixed(2)
                                                            },
                                                            skipped: false
                                                        };
                                                    } catch (error) {
                                                        logger.warn("Error computing metrics for keyword", {
                                                            keywordId: keyword.id,
                                                            keyword: keyword.keyword,
                                                            error: error instanceof Error ? error.message : String(error),
                                                            stack: error instanceof Error ? error.stack : undefined,
                                                        });
                                                        return { keywordId: keyword.id, metrics: null, skipped: false, error: true, errorMessage: error instanceof Error ? error.message : String(error) };
                                                    }
                                                })
                                            );

                                            const successful = batchUpdates.filter(r => r.status === 'fulfilled' && !r.value.skipped && !r.value.error).length;
                                            const skipped = batchUpdates.filter(r => r.status === 'fulfilled' && r.value.skipped).length;
                                            const errors = batchUpdates.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error)).length;

                                            const validUpdates = batchUpdates
                                                .filter(r => r.status === 'fulfilled' && r.value.metrics !== null)
                                                .map(r => (r as PromiseFulfilledResult<any>).value);

                                            // Save valid updates
                                            if (validUpdates.length > 0) {
                                                try {
                                                    await storage.bulkUpdateKeywordMetrics(validUpdates);
                                                } catch (saveError) {
                                                    logger.error(`[Batch ${batchNumber}] Error saving batch metrics`, saveError, {
                                                        batchNumber,
                                                        validUpdatesCount: validUpdates.length,
                                                        error: saveError instanceof Error ? saveError.message : String(saveError),
                                                    });
                                                    // Retry the batch if save failed
                                                    if (retryCount < MAX_BATCH_RETRIES) {
                                                        logger.info(`[Batch ${batchNumber}] Retrying batch after save error`, {
                                                            batchNumber,
                                                            retryCount: retryCount + 1,
                                                        });
                                                        return await processBatchWithRetry(batch, batchNumber, retryCount + 1);
                                                    }
                                                    throw saveError;
                                                }
                                            }

                                            const batchDuration = Date.now() - batchStartTime;
                                            logger.info(`[Batch ${batchNumber}/${totalBatches}] Batch completed (background)${retryCount > 0 ? ` [Retry ${retryCount}]` : ''}`, {
                                                batchNumber,
                                                totalBatches,
                                                duration: `${batchDuration}ms`,
                                                successful,
                                                skipped,
                                                errors,
                                                retryCount,
                                            });

                                            return { successful, skipped, errors, validUpdates };
                                        } catch (error) {
                                            const errorMessage = error instanceof Error ? error.message : String(error);
                                            logger.error(`[Batch ${batchNumber}] Batch processing failed`, error, {
                                                batchNumber,
                                                batchSize: batch.length,
                                                retryCount,
                                                error: errorMessage,
                                                stack: error instanceof Error ? error.stack : undefined,
                                            });

                                            // Retry the batch if we haven't exceeded max retries
                                            if (retryCount < MAX_BATCH_RETRIES) {
                                                logger.info(`[Batch ${batchNumber}] Retrying batch after error`, {
                                                    batchNumber,
                                                    retryCount: retryCount + 1,
                                                    error: errorMessage,
                                                });
                                                // Wait a bit before retrying
                                                await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
                                                return await processBatchWithRetry(batch, batchNumber, retryCount + 1);
                                            }

                                            // Track failed batch
                                            failedBatches.push({ batchNumber, error: errorMessage });
                                            throw error;
                                        }
                                    };

                                    // Process keywords in batches
                                    for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
                                        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
                                        const batch = keywords.slice(i, i + BATCH_SIZE);

                                        try {
                                            const batchResult = await processBatchWithRetry(batch, batchNumber);
                                            processedCount += batchResult.successful;
                                            skippedCount += batchResult.skipped;
                                            errorCount += batchResult.errors;
                                        } catch (error) {
                                            // Batch failed after retries, continue with next batch
                                            errorCount += batch.length;
                                            logger.error(`[Batch ${batchNumber}] Batch failed after retries, continuing with next batch`, error, {
                                                batchNumber,
                                                batchSize: batch.length,
                                            });
                                        }
                                    }

                                    const metricsDuration = Date.now() - metricsStartTime;
                                    const successRate = totalKeywords > 0 ? ((processedCount / totalKeywords) * 100).toFixed(1) : '0';

                                    logger.info("=== COMPUTE METRICS PIPELINE COMPLETE (BACKGROUND) ===", {
                                        projectId,
                                        duration: `${metricsDuration}ms (${(metricsDuration / 1000).toFixed(2)}s)`,
                                        processed: processedCount,
                                        skipped: skippedCount,
                                        errors: errorCount,
                                        total: totalKeywords,
                                        successRate: `${successRate}%`,
                                        failedBatches: failedBatches.length > 0 ? failedBatches : undefined,
                                    });

                                    // Save progress with success state
                                    await saveProgress({
                                        currentStage: 'complete',
                                        metricsComputed: true,
                                        metricsProcessedCount: processedCount,
                                        metricsErrorCount: errorCount,
                                        metricsFailedBatches: failedBatches.length > 0 ? failedBatches : undefined,
                                        newKeywords: finalKeywords
                                    });
                                } catch (error) {
                                    metricsError = error instanceof Error ? error : new Error(String(error));
                                    logger.error("Error in background metrics computation", error, {
                                        projectId,
                                        error: metricsError.message,
                                        stack: metricsError.stack,
                                        failedBatches: failedBatches.length > 0 ? failedBatches : undefined,
                                    });

                                    // Save error state in progress
                                    try {
                                        await saveProgress({
                                            currentStage: 'complete',
                                            metricsComputed: false,
                                            metricsError: {
                                                message: metricsError.message,
                                                stack: metricsError.stack,
                                                timestamp: new Date().toISOString(),
                                                failedBatches: failedBatches.length > 0 ? failedBatches : undefined,
                                            },
                                            newKeywords: finalKeywords
                                        });
                                    } catch (saveError) {
                                        logger.error("Failed to save metrics error state", saveError, {
                                            projectId,
                                            originalError: metricsError.message,
                                        });
                                    }
                                }
                            })();
                        }
                    } catch (error) {
                        logger.error("Error saving DataForSEO metrics to database (background)", error, {
                            projectId,
                        });
                        // Don't throw - this is background operation, report is already generated
                    }
                })();
            } else {
                // STEP 6: Compute metrics in the background (asynchronously, after sending report)
                // Only start metrics computation if keywords were already saved (hasDataForSEOMetrics is true)
                if (!savedProgress || !savedProgress.metricsComputed) {
                    // Start metrics computation asynchronously (fire and forget, but with error handling)
                    (async () => {
                        let metricsError: Error | null = null;
                        let failedBatches: Array<{ batchNumber: number; error: string }> = [];
                        const MAX_BATCH_RETRIES = 2; // Retry failed batches up to 2 times

                        try {
                            const metricsStartTime = Date.now();
                            logger.info("=== COMPUTE METRICS PIPELINE START (BACKGROUND) ===", {
                                projectId,
                                timestamp: new Date().toISOString(),
                            });

                            const keywords = await storage.getProjectKeywords(projectId);
                            const { calculateVolatility, calculateTrendStrength } = await import("./opportunity-score");

                            const BATCH_SIZE = 50; // Process 50 keywords concurrently
                            let processedCount = 0;
                            let skippedCount = 0;
                            let errorCount = 0;
                            const totalKeywords = keywords.filter(kw => kw.monthlyData && Array.isArray(kw.monthlyData) && kw.monthlyData.length > 0 && kw.volume !== null).length;
                            const totalBatches = Math.ceil(keywords.length / BATCH_SIZE);

                            logger.info("Starting background metrics computation", {
                                totalKeywords: keywords.length,
                                keywordsWithData: totalKeywords,
                                batchSize: BATCH_SIZE,
                                totalBatches,
                            });

                            // Helper function to process a batch with retry
                            const processBatchWithRetry = async (
                                batch: any[],
                                batchNumber: number,
                                retryCount: number = 0
                            ): Promise<{ successful: number; skipped: number; errors: number; validUpdates: any[] }> => {
                                const batchStartTime = Date.now();

                                try {
                                    logger.debug(`[Batch ${batchNumber}/${totalBatches}] Processing batch (background)${retryCount > 0 ? ` [Retry ${retryCount}]` : ''}`, {
                                        batchNumber,
                                        totalBatches,
                                        batchSize: batch.length,
                                        retryCount,
                                    });

                                    const batchUpdates = await Promise.allSettled(
                                        batch.map(async (keyword) => {
                                            if (!keyword.monthlyData || !Array.isArray(keyword.monthlyData) || keyword.monthlyData.length === 0 || keyword.volume === null) {
                                                return { keywordId: keyword.id, metrics: null, skipped: true };
                                            }

                                            try {
                                                const monthlyData = keyword.monthlyData;
                                                const sortedMonthlyData = [...monthlyData].sort((a: any, b: any) => {
                                                    return parseMonthString(a.month) - parseMonthString(b.month);
                                                });

                                                const lastMonth = sortedMonthlyData[sortedMonthlyData.length - 1];
                                                let yoyGrowth: number | null = null;
                                                if (sortedMonthlyData.length >= 12) {
                                                    const sameMonthLastYear = sortedMonthlyData[sortedMonthlyData.length - 12];
                                                    yoyGrowth = ((lastMonth.volume - sameMonthLastYear.volume) / (sameMonthLastYear.volume + 1)) * 100;
                                                }

                                                let threeMonthGrowth: number | null = null;
                                                if (sortedMonthlyData.length >= 3) {
                                                    const threeMonthsAgo = sortedMonthlyData[sortedMonthlyData.length - 3];
                                                    if (threeMonthsAgo.volume > 0) {
                                                        threeMonthGrowth = ((lastMonth.volume - threeMonthsAgo.volume) / threeMonthsAgo.volume) * 100;
                                                    }
                                                }

                                                const volatility = calculateVolatility(sortedMonthlyData);
                                                const growthYoyValue = yoyGrowth !== null ? yoyGrowth : 0;
                                                const trendStrength = calculateTrendStrength(growthYoyValue, volatility);
                                                const opportunityScore = (volatility + trendStrength) / 2;

                                                return {
                                                    keywordId: keyword.id,
                                                    metrics: {
                                                        growthYoy: yoyGrowth !== null ? yoyGrowth.toString() : null,
                                                        growth3m: threeMonthGrowth !== null ? threeMonthGrowth.toString() : null,
                                                        volatility: volatility.toFixed(2),
                                                        trendStrength: trendStrength.toFixed(2),
                                                        opportunityScore: opportunityScore.toFixed(2)
                                                    },
                                                    skipped: false
                                                };
                                            } catch (error) {
                                                logger.warn("Error computing metrics for keyword", {
                                                    keywordId: keyword.id,
                                                    keyword: keyword.keyword,
                                                    error: error instanceof Error ? error.message : String(error),
                                                    stack: error instanceof Error ? error.stack : undefined,
                                                });
                                                return { keywordId: keyword.id, metrics: null, skipped: false, error: true, errorMessage: error instanceof Error ? error.message : String(error) };
                                            }
                                        })
                                    );

                                    const successful = batchUpdates.filter(r => r.status === 'fulfilled' && !r.value.skipped && !r.value.error).length;
                                    const skipped = batchUpdates.filter(r => r.status === 'fulfilled' && r.value.skipped).length;
                                    const errors = batchUpdates.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error)).length;

                                    const validUpdates = batchUpdates
                                        .filter(r => r.status === 'fulfilled' && r.value.metrics !== null)
                                        .map(r => (r as PromiseFulfilledResult<any>).value);

                                    // Save valid updates
                                    if (validUpdates.length > 0) {
                                        try {
                                            await storage.bulkUpdateKeywordMetrics(validUpdates);
                                        } catch (saveError) {
                                            logger.error(`[Batch ${batchNumber}] Error saving batch metrics`, saveError, {
                                                batchNumber,
                                                validUpdatesCount: validUpdates.length,
                                                error: saveError instanceof Error ? saveError.message : String(saveError),
                                            });
                                            // Retry the batch if save failed
                                            if (retryCount < MAX_BATCH_RETRIES) {
                                                logger.info(`[Batch ${batchNumber}] Retrying batch after save error`, {
                                                    batchNumber,
                                                    retryCount: retryCount + 1,
                                                });
                                                return await processBatchWithRetry(batch, batchNumber, retryCount + 1);
                                            }
                                            throw saveError;
                                        }
                                    }

                                    const batchDuration = Date.now() - batchStartTime;
                                    logger.info(`[Batch ${batchNumber}/${totalBatches}] Batch completed (background)${retryCount > 0 ? ` [Retry ${retryCount}]` : ''}`, {
                                        batchNumber,
                                        totalBatches,
                                        duration: `${batchDuration}ms`,
                                        successful,
                                        skipped,
                                        errors,
                                        retryCount,
                                    });

                                    return { successful, skipped, errors, validUpdates };
                                } catch (error) {
                                    const errorMessage = error instanceof Error ? error.message : String(error);
                                    logger.error(`[Batch ${batchNumber}] Batch processing failed`, error, {
                                        batchNumber,
                                        batchSize: batch.length,
                                        retryCount,
                                        error: errorMessage,
                                        stack: error instanceof Error ? error.stack : undefined,
                                    });

                                    // Retry the batch if we haven't exceeded max retries
                                    if (retryCount < MAX_BATCH_RETRIES) {
                                        logger.info(`[Batch ${batchNumber}] Retrying batch after error`, {
                                            batchNumber,
                                            retryCount: retryCount + 1,
                                            error: errorMessage,
                                        });
                                        // Wait a bit before retrying
                                        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
                                        return await processBatchWithRetry(batch, batchNumber, retryCount + 1);
                                    }

                                    // Track failed batch
                                    failedBatches.push({ batchNumber, error: errorMessage });
                                    throw error;
                                }
                            };

                            // Process keywords in batches
                            for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
                                const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
                                const batch = keywords.slice(i, i + BATCH_SIZE);

                                try {
                                    const batchResult = await processBatchWithRetry(batch, batchNumber);
                                    processedCount += batchResult.successful;
                                    skippedCount += batchResult.skipped;
                                    errorCount += batchResult.errors;
                                } catch (error) {
                                    // Batch failed after retries, continue with next batch
                                    errorCount += batch.length;
                                    logger.error(`[Batch ${batchNumber}] Batch failed after retries, continuing with next batch`, error, {
                                        batchNumber,
                                        batchSize: batch.length,
                                    });
                                }
                            }

                            const metricsDuration = Date.now() - metricsStartTime;
                            const successRate = totalKeywords > 0 ? ((processedCount / totalKeywords) * 100).toFixed(1) : '0';

                            logger.info("=== COMPUTE METRICS PIPELINE COMPLETE (BACKGROUND) ===", {
                                projectId,
                                duration: `${metricsDuration}ms (${(metricsDuration / 1000).toFixed(2)}s)`,
                                processed: processedCount,
                                skipped: skippedCount,
                                errors: errorCount,
                                total: totalKeywords,
                                successRate: `${successRate}%`,
                                failedBatches: failedBatches.length > 0 ? failedBatches : undefined,
                            });

                            // Save progress with success state
                            await saveProgress({
                                currentStage: 'complete',
                                metricsComputed: true,
                                metricsProcessedCount: processedCount,
                                metricsErrorCount: errorCount,
                                metricsFailedBatches: failedBatches.length > 0 ? failedBatches : undefined,
                                newKeywords: finalKeywords
                            });
                        } catch (error) {
                            metricsError = error instanceof Error ? error : new Error(String(error));
                            logger.error("Error in background metrics computation", error, {
                                projectId,
                                error: metricsError.message,
                                stack: metricsError.stack,
                                failedBatches: failedBatches.length > 0 ? failedBatches : undefined,
                            });

                            // Save error state in progress
                            try {
                                await saveProgress({
                                    currentStage: 'complete',
                                    metricsComputed: false,
                                    metricsError: {
                                        message: metricsError.message,
                                        stack: metricsError.stack,
                                        timestamp: new Date().toISOString(),
                                        failedBatches: failedBatches.length > 0 ? failedBatches : undefined,
                                    },
                                    newKeywords: finalKeywords
                                });
                            } catch (saveError) {
                                logger.error("Failed to save metrics error state", saveError, {
                                    projectId,
                                    originalError: metricsError.message,
                                });
                            }
                        }
                    })();
                }
            }
        } catch (error) {
            logger.error("Error in background pipeline execution", error, {
                projectId,
            });

            // Try to save error state - use a basic save since saveProgress might not be available
            try {
                // Try to get keywords from saved progress if finalKeywords is empty
                let keywordsForError = finalKeywords || [];
                if (keywordsForError.length === 0) {
                    try {
                        const project = await storage.getCustomSearchProject(projectId);
                        if (project?.keywordGenerationProgress?.newKeywords) {
                            keywordsForError = project.keywordGenerationProgress.newKeywords;
                        }
                    } catch (e) {
                        // Ignore errors when trying to get saved progress
                    }
                }

                const errorProgress: any = {
                    currentStage: 'error',
                    stage: 'error',
                    error: error instanceof Error ? error.message : "Unknown error",
                    newKeywords: keywordsForError,
                    seedsGenerated: 0,
                    keywordsGenerated: 0,
                    duplicatesFound: 0,
                    existingKeywordsFound: 0,
                    newKeywordsCollected: keywordsForError.length
                };
                await storage.saveKeywordGenerationProgress(projectId, errorProgress);
            } catch (saveError) {
                logger.error("Error saving error progress", saveError, {
                    projectId,
                });
            }
        }
    }

    // Pipeline status endpoint - allows polling for progress
    app.get("/api/custom-search/pipeline-status/:projectId", requireAuth, requirePayment, async (req, res) => {
        try {
            const { projectId } = req.params;

            if (!projectId) {
                return res.status(400).json({ message: "projectId is required" });
            }

            const project = await storage.getCustomSearchProject(projectId);
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            if (project.userId !== req.user.id) {
                return res.status(403).json({ message: "Forbidden" });
            }

            const progress = project.keywordGenerationProgress;
            if (!progress) {
                return res.json({
                    status: 'idle',
                    progress: null,
                    report: null
                });
            }

            const currentStage = progress.currentStage || progress.stage || 'idle';
            const isComplete = currentStage === 'complete';
            const isError = currentStage === 'error';
            const isRunning = !isComplete && !isError && currentStage !== 'idle';

            // Determine status
            let status: 'idle' | 'running' | 'complete' | 'error' = 'idle';
            if (isError) {
                status = 'error';
            } else if (isComplete) {
                status = 'complete';
            } else if (isRunning) {
                status = 'running';
            }

            // If complete and report is generated, include report data
            let report = null;
            if (isComplete && progress.reportGenerated) {
                try {
                    const allKeywords = await storage.getProjectKeywords(projectId);
                    const keywordsWithData = allKeywords.filter(kw =>
                        (kw.volume !== null && kw.volume !== undefined) ||
                        (kw.competition !== null && kw.competition !== undefined) ||
                        (kw.cpc !== null && kw.cpc !== undefined && kw.cpc !== '') ||
                        (kw.topPageBid !== null && kw.topPageBid !== undefined && kw.topPageBid !== '')
                    );

                    if (keywordsWithData.length > 0) {
                        const reportData = await generateReportData(
                            projectId,
                            project,
                            keywordsWithData,
                            keywordVectorService,
                            db,
                            customSearchProjectKeywords
                        );
                        report = {
                            aggregated: reportData.aggregated,
                            keywords: reportData.keywords,
                            totalKeywords: reportData.totalKeywords,
                            metricsPending: progress.metricsComputed === false
                        };
                    }
                } catch (error) {
                    logger.error("Error generating report for status endpoint", error, {
                        projectId
                    });
                }
            }

            return res.json({
                status,
                progress: {
                    currentStage,
                    stage: progress.stage || currentStage,
                    seedsGenerated: progress.seedsGenerated || 0,
                    keywordsGenerated: progress.keywordsGenerated || 0,
                    duplicatesFound: progress.duplicatesFound || 0,
                    existingKeywordsFound: progress.existingKeywordsFound || 0,
                    newKeywordsCollected: progress.newKeywordsCollected || 0,
                    newKeywords: progress.newKeywords || [],
                    dataForSEOFetched: progress.dataForSEOFetched || false,
                    metricsComputed: progress.metricsComputed || false,
                    reportGenerated: progress.reportGenerated || false,
                    keywordsFetchedCount: progress.keywordsFetchedCount || 0,
                    metricsProcessedCount: progress.metricsProcessedCount || 0,
                    error: progress.error || (isError ? progress.error : undefined)
                },
                report
            });
        } catch (error) {
            logger.error("Error in pipeline-status endpoint", error, {
                projectId: req.params.projectId
            });
            return res.status(500).json({
                message: error instanceof Error ? error.message : "Unknown error"
            });
        }
    });

    // Generate keywords for a custom search project
    app.post("/api/custom-search/generate-keywords", requireAuth, requirePayment, async (req, res) => {
        const requestStartTime = Date.now();
        let isClientConnected = true;
        let cancelled = false;

        logger.info("=== KEYWORD GENERATION REQUEST START ===", {
            projectId: req.body.projectId,
            userId: req.user.id,
            timestamp: new Date().toISOString(),
        });

        // Handle client disconnection
        req.on('close', () => {
            isClientConnected = false;
            cancelled = true;
            logger.info("Client disconnected from keyword generation endpoint", {
                projectId: req.body.projectId,
                duration: Date.now() - requestStartTime,
            });
        });

        try {
            const { projectId, pitch, topics, personas, painPoints, features, competitors, resumeFromProgress } = req.body;

            logger.info("Processing keyword generation request", {
                projectId,
                hasPitch: !!pitch,
                pitchLength: pitch?.length || 0,
                topicsCount: topics?.length || 0,
                personasCount: personas?.length || 0,
                painPointsCount: painPoints?.length || 0,
                featuresCount: features?.length || 0,
                competitorsCount: competitors?.length || 0,
                hasResumeProgress: !!resumeFromProgress,
            });

            // Input validation
            logger.debug("Validating input parameters", { projectId, hasPitch: !!pitch });

            if (projectId && typeof projectId !== 'string') {
                logger.warn("Invalid projectId type", { projectId, type: typeof projectId });
                return res.status(400).json({ message: "projectId must be a string" });
            }

            // Validate pitch length
            if (pitch !== undefined && typeof pitch !== 'string') {
                return res.status(400).json({ message: "pitch must be a string" });
            }
            if (pitch && pitch.length > 10000) {
                return res.status(400).json({ message: "pitch must be 10000 characters or less" });
            }

            // Validate array inputs
            if (topics !== undefined && !Array.isArray(topics)) {
                return res.status(400).json({ message: "topics must be an array" });
            }
            if (topics && topics.length > 100) {
                return res.status(400).json({ message: "topics array must contain 100 items or less" });
            }
            if (topics && topics.some(t => typeof t !== 'string' || t.length > 500)) {
                return res.status(400).json({ message: "Each topic must be a string with 500 characters or less" });
            }

            if (personas !== undefined && !Array.isArray(personas)) {
                return res.status(400).json({ message: "personas must be an array" });
            }
            if (personas && personas.length > 100) {
                return res.status(400).json({ message: "personas array must contain 100 items or less" });
            }
            if (personas && personas.some(p => typeof p !== 'string' || p.length > 500)) {
                return res.status(400).json({ message: "Each persona must be a string with 500 characters or less" });
            }

            if (painPoints !== undefined && !Array.isArray(painPoints)) {
                return res.status(400).json({ message: "painPoints must be an array" });
            }
            if (painPoints && painPoints.length > 100) {
                return res.status(400).json({ message: "painPoints array must contain 100 items or less" });
            }
            if (painPoints && painPoints.some(p => typeof p !== 'string' || p.length > 500)) {
                return res.status(400).json({ message: "Each pain point must be a string with 500 characters or less" });
            }

            if (features !== undefined && !Array.isArray(features)) {
                return res.status(400).json({ message: "features must be an array" });
            }
            if (features && features.length > 100) {
                return res.status(400).json({ message: "features array must contain 100 items or less" });
            }
            if (features && features.some(f => typeof f !== 'string' || f.length > 500)) {
                return res.status(400).json({ message: "Each feature must be a string with 500 characters or less" });
            }

            if (competitors !== undefined && !Array.isArray(competitors)) {
                return res.status(400).json({ message: "competitors must be an array" });
            }
            if (competitors && competitors.length > 50) {
                return res.status(400).json({ message: "competitors array must contain 50 items or less" });
            }
            if (competitors && Array.isArray(competitors)) {
                for (const competitor of competitors) {
                    if (typeof competitor !== 'object' || competitor === null) {
                        return res.status(400).json({ message: "Each competitor must be an object" });
                    }
                    if (competitor.name !== undefined && typeof competitor.name !== 'string') {
                        return res.status(400).json({ message: "competitor.name must be a string" });
                    }
                    if (competitor.name && competitor.name.length > 200) {
                        return res.status(400).json({ message: "competitor.name must be 200 characters or less" });
                    }
                    if (competitor.description !== undefined && typeof competitor.description !== 'string') {
                        return res.status(400).json({ message: "competitor.description must be a string" });
                    }
                    if (competitor.description && competitor.description.length > 1000) {
                        return res.status(400).json({ message: "competitor.description must be 1000 characters or less" });
                    }
                    if (competitor.url !== undefined && competitor.url !== null && typeof competitor.url !== 'string') {
                        return res.status(400).json({ message: "competitor.url must be a string or null" });
                    }
                    if (competitor.url && competitor.url.length > 500) {
                        return res.status(400).json({ message: "competitor.url must be 500 characters or less" });
                    }
                }
            }

            // Verify project exists and user owns it (cache result for reuse)
            let project = null;
            if (projectId) {
                logger.debug("Fetching project from database", { projectId });
                project = await storage.getCustomSearchProject(projectId);
                if (!project) {
                    logger.warn("Project not found", { projectId });
                    return res.status(404).json({ message: "Project not found" });
                }
                if (project.userId !== req.user.id) {
                    logger.warn("User does not own project", { projectId, userId: req.user.id, projectUserId: project.userId });
                    return res.status(403).json({ message: "Forbidden" });
                }
                logger.info("Project verified", {
                    projectId,
                    hasSavedProgress: !!project.keywordGenerationProgress,
                    savedProgressStage: project.keywordGenerationProgress?.stage,
                });
            }

            // Use provided inputs or project data
            const input = {
                pitch: pitch || project?.pitch || "",
                topics: topics || project?.topics || [],
                personas: personas || project?.personas || [],
                painPoints: painPoints || project?.painPoints || [],
                features: features || project?.features || [],
                competitors: project?.competitors || [],
            };

            // Validate pitch is non-empty
            if (!input.pitch || !input.pitch.trim()) {
                logger.warn("Pitch validation failed", { pitch: input.pitch?.substring(0, 50) });
                return res.status(400).json({ message: "Pitch is required and cannot be empty" });
            }

            logger.info("Input validation passed, setting up SSE connection", {
                projectId,
                pitchLength: input.pitch.length,
            });

            // Set up Server-Sent Events for progress updates
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

            // Import keyword collector
            logger.debug("Importing keyword collector module", {});
            const { collectKeywords, progressToSaveFormat } = await import("./keyword-collector");

            // Track progress for saving (declare outside try-catch for error handling)
            let lastProgress: ProgressUpdate | null = null;
            let lastSaveTime = Date.now();
            let lastCheckpointTime = Date.now();
            let lastCheckpointKeywordCount = 0;
            let accumulatedNewKeywords: string[] = []; // Track accumulated new keywords (full list)
            let accumulatedAllKeywords: string[] = []; // Track full allKeywords list
            let accumulatedDuplicates: string[] = []; // Track full duplicates list
            let accumulatedExistingKeywords: string[] = []; // Track full existingKeywords list
            const projectIdForError = projectId; // Capture for error handler

            // Async queue for progress saves to prevent race conditions
            const progressSaveQueue = new Map<string, Promise<void>>();
            const enqueueProgressSave = async (projectId: string, progress: ProgressUpdate, keywords: string[]): Promise<void> => {
                // Wait for existing save to complete if in progress
                if (progressSaveQueue.has(projectId)) {
                    try {
                        await progressSaveQueue.get(projectId);
                    } catch (error) {
                        // Ignore errors from previous save
                        logger.warn("Previous progress save failed", { projectId, error });
                    }
                }

                // Create new save promise
                const savePromise = (async () => {
                    try {
                        // Use accumulated full lists if available, otherwise use progress lists (may be truncated)
                        const progressToSave = progressToSaveFormat(
                            progress,
                            keywords,
                            accumulatedAllKeywords.length > 0 ? accumulatedAllKeywords : undefined,
                            accumulatedDuplicates.length > 0 ? accumulatedDuplicates : undefined,
                            accumulatedExistingKeywords.length > 0 ? accumulatedExistingKeywords : undefined
                        );
                        await storage.saveKeywordGenerationProgress(projectId, progressToSave);
                        lastSaveTime = Date.now();
                        logger.debug("Progress saved successfully", { projectId, newKeywordsCount: keywords.length });
                    } catch (error) {
                        logger.error("Error saving progress", error, { projectId });
                        // Don't fail the generation if saving fails
                        throw error; // Re-throw to mark promise as failed
                    } finally {
                        progressSaveQueue.delete(projectId);
                    }
                })();

                progressSaveQueue.set(projectId, savePromise);
                return savePromise;
            };

            // Progress callback
            const progressCallback = async (progress: ProgressUpdate) => {
                // Check if client is still connected
                if (!isClientConnected || cancelled) {
                    logger.debug("Skipping progress callback - client disconnected", { projectId });
                    return;
                }

                try {
                    logger.debug("Sending progress update to client", {
                        projectId,
                        stage: progress.stage,
                        newKeywordsCollected: progress.newKeywordsCollected,
                        keywordsGenerated: progress.keywordsGenerated,
                    });
                    res.write(`data: ${JSON.stringify({ type: 'progress', data: progress })}\n\n`);
                } catch (error) {
                    logger.warn("Failed to write progress to client", { projectId, error });
                    isClientConnected = false;
                    return;
                }

                lastProgress = progress;

                // Helper function to update accumulated list from progress
                // Single source of truth: use full list from collector when available, otherwise merge truncated lists
                const updateAccumulatedList = (
                    progressList: string[] | undefined,
                    accumulatedList: string[],
                    isTruncated: boolean
                ): string[] => {
                    if (!progressList || !Array.isArray(progressList)) {
                        return accumulatedList;
                    }

                    if (!isTruncated) {
                        // Full list from collector - this is the source of truth, replace accumulated
                        return [...progressList];
                    } else {
                        // Truncated list - merge with existing accumulated list (avoid duplicates)
                        const existingSet = new Set(accumulatedList.map(k => k.toLowerCase()));
                        const merged = [...accumulatedList];
                        progressList.forEach(kw => {
                            if (!existingSet.has(kw.toLowerCase())) {
                                merged.push(kw);
                                existingSet.add(kw.toLowerCase());
                            }
                        });
                        return merged;
                    }
                };

                // Update accumulated lists from progress using helper function
                accumulatedNewKeywords = updateAccumulatedList(
                    progress.newKeywords,
                    accumulatedNewKeywords,
                    progress._listsTruncated || false
                );
                accumulatedAllKeywords = updateAccumulatedList(
                    progress.allKeywords,
                    accumulatedAllKeywords,
                    progress._listsTruncated || false
                );
                accumulatedDuplicates = updateAccumulatedList(
                    progress.duplicates,
                    accumulatedDuplicates,
                    progress._listsTruncated || false
                );
                accumulatedExistingKeywords = updateAccumulatedList(
                    progress.existingKeywords,
                    accumulatedExistingKeywords,
                    progress._listsTruncated || false
                );

                // Save progress periodically (every SAVE_INTERVAL_MS or every SAVE_KEYWORD_INTERVAL keywords)
                const now = Date.now();
                const shouldSave = projectId && (now - lastSaveTime > SAVE_INTERVAL_MS || (progress.newKeywordsCollected > 0 && progress.newKeywordsCollected % SAVE_KEYWORD_INTERVAL === 0));

                if (shouldSave) {
                    logger.debug("Saving progress periodically", {
                        projectId,
                        timeSinceLastSave: now - lastSaveTime,
                        newKeywordsCollected: progress.newKeywordsCollected,
                        reason: now - lastSaveTime > SAVE_INTERVAL_MS ? "time interval" : "keyword interval",
                    });

                    // Use newKeywords from progress if available, otherwise use accumulated
                    // Note: progress.newKeywords may be truncated, but we need full list for saving
                    // The collector maintains full lists internally and passes them via progressToSaveFormat
                    const keywordsToSave = accumulatedNewKeywords.length > 0 ? accumulatedNewKeywords : (progress.newKeywords || []);
                    // Don't await - let it save in background
                    enqueueProgressSave(projectId, progress, keywordsToSave).catch((error) => {
                        logger.error("Failed to enqueue progress save", error, { projectId });
                    });
                }

                // Save checkpoint periodically (every PROGRESS_CHECKPOINT_INTERVAL_MS or every PROGRESS_CHECKPOINT_KEYWORD_INTERVAL keywords)
                // Checkpoints ensure critical state is saved even if process crashes
                const shouldCheckpoint = projectId && (
                    now - lastCheckpointTime > PROGRESS_CHECKPOINT_INTERVAL_MS ||
                    (progress.newKeywordsCollected > 0 && (progress.newKeywordsCollected - lastCheckpointKeywordCount) >= PROGRESS_CHECKPOINT_KEYWORD_INTERVAL)
                );

                if (shouldCheckpoint) {
                    logger.debug("Saving progress checkpoint", {
                        projectId,
                        timeSinceLastCheckpoint: now - lastCheckpointTime,
                        keywordsSinceLastCheckpoint: progress.newKeywordsCollected - lastCheckpointKeywordCount,
                        newKeywordsCollected: progress.newKeywordsCollected,
                        reason: now - lastCheckpointTime > PROGRESS_CHECKPOINT_INTERVAL_MS ? "time interval" : "keyword interval",
                    });

                    // Use accumulated full lists for checkpoint
                    const keywordsToSave = accumulatedNewKeywords.length > 0 ? accumulatedNewKeywords : (progress.newKeywords || []);

                    // Await checkpoint save to ensure it completes (critical state)
                    try {
                        await enqueueProgressSave(projectId, progress, keywordsToSave);
                        lastCheckpointTime = now;
                        lastCheckpointKeywordCount = progress.newKeywordsCollected;
                        logger.debug("Progress checkpoint saved successfully", {
                            projectId,
                            newKeywordsCollected: progress.newKeywordsCollected,
                        });
                    } catch (error) {
                        logger.error("Failed to save progress checkpoint", error, {
                            projectId,
                            newKeywordsCollected: progress.newKeywordsCollected,
                        });
                        // Don't throw - continue processing even if checkpoint fails
                    }
                }
            };

            // Generate keywords (with resume support if provided)
            const resumeState = resumeFromProgress || project?.keywordGenerationProgress || undefined;
            logger.info("Starting keyword collection", {
                projectId,
                targetCount: 1000,
                hasResumeState: !!resumeState,
                resumeStage: resumeState?.stage,
                resumeNewKeywords: resumeState?.newKeywords?.length || 0,
            });

            const collectionStartTime = Date.now();
            const result = await collectKeywords(
                input,
                progressCallback,
                1000,
                resumeState
            );
            const collectionDuration = Date.now() - collectionStartTime;

            logger.info("Keyword collection completed", {
                projectId,
                duration: collectionDuration,
                keywordsCollected: result.keywords.length,
                progressStage: result.progress.stage,
            });

            // Check if cancelled
            if (cancelled || !isClientConnected) {
                logger.info("Keyword generation cancelled or client disconnected", {
                    projectId,
                    duration: Date.now() - requestStartTime,
                });
                return;
            }

            accumulatedNewKeywords = result.keywords;

            // Save final progress with full lists from result
            if (projectId) {
                try {
                    logger.info("Saving final progress", {
                        projectId,
                        keywordsCount: result.keywords.length,
                        accumulatedAllKeywords: accumulatedAllKeywords.length,
                        accumulatedDuplicates: accumulatedDuplicates.length,
                        accumulatedExistingKeywords: accumulatedExistingKeywords.length,
                    });

                    // Use result.progress which should have full lists, or fall back to accumulated lists
                    const finalProgress = progressToSaveFormat(
                        lastProgress || result.progress,
                        result.keywords, // Full list from result
                        accumulatedAllKeywords.length > 0 ? accumulatedAllKeywords : undefined,
                        accumulatedDuplicates.length > 0 ? accumulatedDuplicates : undefined,
                        accumulatedExistingKeywords.length > 0 ? accumulatedExistingKeywords : undefined
                    );
                    await storage.saveKeywordGenerationProgress(projectId, finalProgress);
                    logger.info("Final progress saved successfully", {
                        projectId,
                        keywordsCount: result.keywords.length,
                        stage: finalProgress.stage,
                    });
                } catch (error) {
                    logger.error("Error saving final progress", error, { projectId });
                }
            }

            // Send final result
            if (isClientConnected) {
                try {
                    logger.info("Sending final result to client", {
                        projectId,
                        keywordsCount: result.keywords.length,
                        totalDuration: Date.now() - requestStartTime,
                    });
                    res.write(`data: ${JSON.stringify({ type: 'complete', data: { keywords: result.keywords } })}\n\n`);
                    res.end();
                    logger.info("=== KEYWORD GENERATION REQUEST COMPLETE ===", {
                        projectId,
                        totalDuration: Date.now() - requestStartTime,
                        keywordsCollected: result.keywords.length,
                    });
                } catch (error) {
                    logger.warn("Failed to send final result to client", { projectId, error });
                }
            }
        } catch (error) {
            logger.error("Error generating keywords", error, { projectId: req.body.projectId });

            // Save error state if we have a project
            if (projectIdForError && lastProgress) {
                try {
                    const { progressToSaveFormat } = await import("./keyword-collector");
                    const errorProgress = progressToSaveFormat(
                        lastProgress,
                        accumulatedNewKeywords, // Use accumulated list if available
                        accumulatedAllKeywords.length > 0 ? accumulatedAllKeywords : undefined,
                        accumulatedDuplicates.length > 0 ? accumulatedDuplicates : undefined,
                        accumulatedExistingKeywords.length > 0 ? accumulatedExistingKeywords : undefined
                    );
                    await storage.saveKeywordGenerationProgress(projectIdForError, errorProgress);
                    logger.info("Error progress saved", { projectId: projectIdForError });
                } catch (saveError) {
                    logger.error("Error saving error progress", saveError, { projectId: projectIdForError });
                }
            }

            if (isClientConnected) {
                try {
                    res.write(`data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : "Unknown error" })}\n\n`);
                    res.end();
                } catch (writeError) {
                    logger.warn("Failed to send error to client", { projectId: projectIdForError, error: writeError });
                }
            }
        }
    });

    // Fetch DataForSEO metrics for generated keywords
    app.post("/api/custom-search/fetch-dataforseo", requireAuth, requirePayment, async (req, res) => {
        try {
            const { projectId } = req.body;
            const userId = req.user.id;

            if (!projectId) {
                return res.status(400).json({ message: "projectId is required" });
            }

            // Verify project ownership
            const project = await storage.getCustomSearchProject(projectId);
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            if (project.userId !== userId) {
                return res.status(403).json({ message: "Unauthorized" });
            }

            // Get keywords from saved progress
            const savedProgress = project.keywordGenerationProgress;
            if (!savedProgress || !savedProgress.newKeywords || savedProgress.newKeywords.length === 0) {
                return res.status(400).json({ message: "No keywords found. Please generate keywords first." });
            }

            const keywords = savedProgress.newKeywords;
            if (keywords.length > 1000) {
                return res.status(400).json({ message: "Maximum 1000 keywords allowed per request" });
            }

            // Calculate date range: last 4 years from today
            const today = new Date();
            const fourYearsAgo = new Date();
            fourYearsAgo.setFullYear(today.getFullYear() - 4);

            const dateTo = today.toISOString().split('T')[0]; // YYYY-MM-DD
            const dateFrom = fourYearsAgo.toISOString().split('T')[0]; // YYYY-MM-DD

            // Import and call DataForSEO service
            const { fetchKeywordMetrics } = await import("./dataforseo-service");
            const apiResponse = await fetchKeywordMetrics(keywords, dateFrom, dateTo);

            // Process API response and save to database
            const task = apiResponse.tasks[0];
            if (!task || !task.result) {
                return res.status(500).json({ message: "No results from API" });
            }

            const keywordResults = task.result;
            let keywordsWithData = 0;
            const keywordIds: string[] = [];
            const similarityScores: number[] = [];

            // Prepare keywords for insertion
            const keywordsToInsert: any[] = [];
            const keywordMap = new Map<string, any>(); // Map keyword text to result

            for (const result of keywordResults) {
                if (result.search_volume !== null && result.search_volume !== undefined) {
                    keywordsWithData++;
                }

                // Format monthly data and convert to "Nov 2021" format, then sort chronologically
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const monthlyData = result.monthly_searches?.map(ms => {
                    const monthName = monthNames[ms.month - 1]; // month is 1-12, array is 0-indexed
                    return {
                        month: `${monthName} ${ms.year}`,
                        volume: ms.search_volume,
                        sortKey: `${ms.year}-${String(ms.month).padStart(2, '0')}` // For sorting
                    };
                }).sort((a, b) => {
                    // Sort chronologically by sortKey
                    return a.sortKey.localeCompare(b.sortKey);
                }).map(({ sortKey, ...rest }) => rest) || []; // Remove sortKey after sorting

                // Normalize competition (prioritize competition_index from DataForSEO)
                let competitionIndex = null;
                // Use competition_index first if available (more granular than string values)
                if (result.competition_index !== null && result.competition_index !== undefined) {
                    competitionIndex = result.competition_index;
                } else if (result.competition) {
                    // Fall back to converting competition string if competition_index is not available
                    if (result.competition === "HIGH") {
                        competitionIndex = 100;
                    } else if (result.competition === "MEDIUM") {
                        competitionIndex = 50;
                    } else if (result.competition === "LOW") {
                        competitionIndex = 0;
                    }
                }

                // Calculate average top page bid
                const avgTopPageBid = result.low_top_of_page_bid && result.high_top_of_page_bid
                    ? (result.low_top_of_page_bid + result.high_top_of_page_bid) / 2
                    : null;

                const keywordData = {
                    keyword: result.keyword,
                    volume: result.search_volume || null,
                    competition: competitionIndex || null,
                    cpc: result.cpc || null,
                    topPageBid: avgTopPageBid,
                    monthlyData: monthlyData,
                    source: "dataforseo"
                };

                keywordsToInsert.push(keywordData);
                keywordMap.set(result.keyword.toLowerCase(), result);
            }

            // Also add keywords that weren't in the API response (no data)
            for (const keyword of keywords) {
                if (!keywordMap.has(keyword.toLowerCase())) {
                    keywordsToInsert.push({
                        keyword: keyword,
                        volume: null,
                        competition: null,
                        cpc: null,
                        topPageBid: null,
                        monthlyData: [],
                        source: "dataforseo"
                    });
                }
            }

            // Save all keywords to globalKeywords table (only new ones will be created)
            const savedKeywords = await storage.createGlobalKeywords(keywordsToInsert);

            // Get all keywords that should be linked (both newly created and existing)
            const allKeywordsToLink: string[] = [];
            const keywordTextToIdMap = new Map<string, string>();

            // Map newly saved keywords
            savedKeywords.forEach(kw => {
                keywordTextToIdMap.set(kw.keyword.toLowerCase(), kw.id);
                allKeywordsToLink.push(kw.keyword);
            });

            // Get existing keywords that weren't just created
            const existingKeywords = await storage.getGlobalKeywordsByTexts(keywords);
            existingKeywords.forEach(kw => {
                if (!keywordTextToIdMap.has(kw.keyword.toLowerCase())) {
                    keywordTextToIdMap.set(kw.keyword.toLowerCase(), kw.id);
                    allKeywordsToLink.push(kw.keyword);
                }
            });

            // Get existing links to check for duplicates
            const existingLinks = await storage.getProjectKeywords(projectId);
            const existingLinkIds = new Set(existingLinks.map(kw => kw.id));
            const existingSimilarityMap = new Map<string, number>();
            existingLinks.forEach(kw => {
                existingSimilarityMap.set(kw.keyword.toLowerCase(), kw.similarityScore ? parseFloat(kw.similarityScore) : 0.8);
            });

            // Calculate similarity scores for new keywords against project pitch
            const pitch = project.pitch || "";
            const { keywordVectorService } = await import("./keyword-vector-service");

            // Prepare keywords to link (exclude already linked ones)
            const keywordIdsToLink: string[] = [];
            const similarityScoresToLink: number[] = [];

            for (const keywordText of allKeywordsToLink) {
                const keywordId = keywordTextToIdMap.get(keywordText.toLowerCase());
                if (keywordId && !existingLinkIds.has(keywordId)) {
                    keywordIdsToLink.push(keywordId);

                    // Calculate actual similarity score if not already stored
                    let similarity = existingSimilarityMap.get(keywordText.toLowerCase());
                    if (similarity === undefined && pitch.trim()) {
                        try {
                            similarity = await keywordVectorService.calculateTextSimilarity(pitch, keywordText);
                        } catch (error) {
                            console.warn(`Failed to calculate similarity for keyword "${keywordText}":`, error);
                            similarity = 0.5; // Default fallback
                        }
                    } else if (similarity === undefined) {
                        similarity = 0.5; // Default fallback when no pitch
                    }

                    similarityScoresToLink.push(similarity);
                }
            }

            // Link keywords to project (only new links)
            if (keywordIdsToLink.length > 0) {
                await storage.linkKeywordsToProject(projectId, keywordIdsToLink, similarityScoresToLink);
            }

            res.json({
                success: true,
                keywordsWithData,
                totalKeywords: keywords.length,
                keywordsWithoutData: keywords.length - keywordsWithData
            });
        } catch (error) {
            console.error("Error fetching DataForSEO metrics:", error);
            res.status(500).json({
                message: error instanceof Error ? error.message : "Failed to fetch metrics",
                error: error instanceof Error ? error.stack : String(error)
            });
        }
    });

    // Compute metrics for keywords
    app.post("/api/custom-search/compute-metrics", requireAuth, requirePayment, async (req, res) => {
        try {
            const { projectId } = req.body;
            const userId = req.user.id;

            if (!projectId) {
                return res.status(400).json({ message: "projectId is required" });
            }

            // Verify project ownership
            const project = await storage.getCustomSearchProject(projectId);
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            if (project.userId !== userId) {
                return res.status(403).json({ message: "Unauthorized" });
            }

            // Get all keywords for the project
            const keywords = await storage.getProjectKeywords(projectId);

            // Import opportunity score functions
            const { calculateVolatility, calculateTrendStrength } = await import("./opportunity-score");

            let processedCount = 0;

            // Process each keyword that has monthly data
            for (const keyword of keywords) {
                if (!keyword.monthlyData || !Array.isArray(keyword.monthlyData) || keyword.monthlyData.length === 0) {
                    continue; // Skip keywords without data
                }

                if (keyword.volume === null || keyword.volume === undefined) {
                    continue; // Skip keywords without volume
                }

                const monthlyData = keyword.monthlyData;

                // Parse and sort monthly data correctly (format: "Jan 2024")
                const sortedMonthlyData = [...monthlyData].sort((a, b) => {
                    return parseMonthString(a.month) - parseMonthString(b.month);
                });

                if (sortedMonthlyData.length < 2) {
                    continue; // Need at least 2 months for calculations
                }

                // Calculate YoY growth (add 1 to denominator to avoid division by zero and provide smoothing)
                const lastMonth = sortedMonthlyData[sortedMonthlyData.length - 1];
                let yoyGrowth: number | null = null;
                if (sortedMonthlyData.length >= 12) {
                    const sameMonthLastYear = sortedMonthlyData[sortedMonthlyData.length - 12];
                    yoyGrowth = ((lastMonth.volume - sameMonthLastYear.volume) / (sameMonthLastYear.volume + 1)) * 100;
                }

                // Calculate 3mo growth
                let threeMonthGrowth: number | null = null;
                if (sortedMonthlyData.length >= 3) {
                    const threeMonthsAgo = sortedMonthlyData[sortedMonthlyData.length - 3];
                    if (threeMonthsAgo.volume > 0) {
                        threeMonthGrowth = ((lastMonth.volume - threeMonthsAgo.volume) / threeMonthsAgo.volume) * 100;
                    }
                }

                // Calculate volatility (using function from opportunity-score.ts)
                const volatility = calculateVolatility(sortedMonthlyData);

                // Calculate trend strength (requires growthYoy and volatility)
                const growthYoyValue = yoyGrowth !== null ? yoyGrowth : 0;
                const trendStrength = calculateTrendStrength(growthYoyValue, volatility);

                // Update keyword with computed metrics
                await storage.updateKeywordMetrics(keyword.id, {
                    growthYoy: yoyGrowth !== null ? yoyGrowth.toString() : null,
                    growth3m: threeMonthGrowth !== null ? threeMonthGrowth.toString() : null,
                    volatility: volatility.toString(),
                    trendStrength: trendStrength.toString()
                });

                processedCount++;
            }

            res.json({
                success: true,
                processedCount,
                totalKeywords: keywords.length
            });
        } catch (error) {
            console.error("Error computing metrics:", error);
            res.status(500).json({
                message: error instanceof Error ? error.message : "Failed to compute metrics",
                error: error instanceof Error ? error.stack : String(error)
            });
        }
    });

    // Get computed metrics from cache (before they're saved to DB)
    app.get("/api/custom-search/projects/:projectId/computed-metrics", requireAuth, requirePayment, async (req, res) => {
        try {
            const { projectId } = req.params;
            const userId = req.user.id;

            // Verify project ownership
            const project = await storage.getCustomSearchProject(projectId);
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            if (project.userId !== userId) {
                return res.status(403).json({ message: "Unauthorized" });
            }

            // Get metrics from cache
            const projectMetrics = computedMetricsCache.get(projectId);
            if (!projectMetrics) {
                return res.json({ metrics: {} });
            }

            // Convert Map to object for JSON response
            const metrics: Record<string, any> = {};
            projectMetrics.forEach((value, key) => {
                metrics[key] = value;
            });

            return res.json({ metrics });
        } catch (error) {
            console.error("Error fetching computed metrics:", error);
            res.status(500).json({
                message: error instanceof Error ? error.message : "Failed to fetch computed metrics",
            });
        }
    });

    // Generate report for keywords
    app.post("/api/custom-search/generate-report", requireAuth, requirePayment, async (req, res) => {
        try {
            const { projectId } = req.body;
            const userId = req.user.id;

            if (!projectId) {
                return res.status(400).json({ message: "projectId is required" });
            }

            // Verify project ownership
            const project = await storage.getCustomSearchProject(projectId);
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            if (project.userId !== userId) {
                return res.status(403).json({ message: "Unauthorized" });
            }

            // Get all keywords for the project that have data (exclude null volumes)
            const allKeywords = await storage.getProjectKeywords(projectId);
            const keywordsWithData = allKeywords.filter(kw => kw.volume !== null && kw.volume !== undefined);

            if (keywordsWithData.length === 0) {
                return res.status(400).json({ message: "No keywords with data found. Please fetch metrics first." });
            }

            // Calculate aggregated PRIMARY metrics (averages of individual keyword metrics)
            const totalVolume = keywordsWithData.reduce((sum, kw) => sum + (kw.volume || 0), 0);
            const avgVolume = Math.round(totalVolume / keywordsWithData.length);

            const validCpc = keywordsWithData
                .map(kw => kw.cpc ? parseFloat(kw.cpc) : null)
                .filter((c): c is number => c !== null);
            const avgCpc = validCpc.length > 0
                ? validCpc.reduce((sum, c) => sum + c, 0) / validCpc.length
                : null;

            const validTopPageBid = keywordsWithData
                .map(kw => kw.topPageBid ? parseFloat(kw.topPageBid) : null)
                .filter((b): b is number => b !== null);
            const avgTopPageBid = validTopPageBid.length > 0
                ? validTopPageBid.reduce((sum, b) => sum + b, 0) / validTopPageBid.length
                : null;

            // Determine competition level (most common)
            const competitionLevels = keywordsWithData
                .map(kw => {
                    if (!kw.competition) return null;
                    const comp = kw.competition;
                    if (comp >= 75) return "high";
                    if (comp >= 25) return "medium";
                    return "low";
                })
                .filter((c): c is string => c !== null);

            const competitionCounts = competitionLevels.reduce((acc, level) => {
                acc[level] = (acc[level] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

            const competition = Object.keys(competitionCounts).length > 0
                ? Object.entries(competitionCounts).sort((a, b) => b[1] - a[1])[0][0]
                : null;

            // Convert competition to number for calculations (high=100, medium=50, low=0)
            const competitionNumber = competition === "high" ? 100 : competition === "medium" ? 50 : 0;

            // Calculate aggregated monthly data (average volume per month across all keywords)
            const monthlyDataMap = new Map<string, { sum: number; count: number }>();
            keywordsWithData.forEach(kw => {
                if (kw.monthlyData && Array.isArray(kw.monthlyData)) {
                    kw.monthlyData.forEach((md: any) => {
                        if (md.month && md.volume !== null && md.volume !== undefined) {
                            const existing = monthlyDataMap.get(md.month) || { sum: 0, count: 0 };
                            monthlyDataMap.set(md.month, {
                                sum: existing.sum + md.volume,
                                count: existing.count + 1
                            });
                        }
                    });
                }
            });

            // Convert to array format and sort chronologically
            const aggregatedMonthlyData = Array.from(monthlyDataMap.entries())
                .map(([month, data]) => ({
                    month,
                    volume: Math.round(data.sum / data.count),
                    sortKey: month // For sorting
                }))
                .sort((a, b) => {
                    // Sort chronologically by parsing month string
                    const dateA = new Date(a.month);
                    const dateB = new Date(b.month);
                    return dateA.getTime() - dateB.getTime();
                })
                .map(({ sortKey, ...rest }) => rest);

            // Calculate aggregated SECONDARY metrics from aggregated primary metrics
            const { calculateVolatility, calculateTrendStrength, calculateOpportunityScore } = await import("./opportunity-score");

            // Calculate aggregated YoY growth from aggregated monthly data
            let aggregatedGrowthYoy: number | null = null;
            if (aggregatedMonthlyData.length >= 12) {
                const lastMonth = aggregatedMonthlyData[aggregatedMonthlyData.length - 1];
                const sameMonthLastYear = aggregatedMonthlyData[aggregatedMonthlyData.length - 12];
                aggregatedGrowthYoy = ((lastMonth.volume - sameMonthLastYear.volume) / (sameMonthLastYear.volume + 1)) * 100;
            }

            // Calculate aggregated 3-month growth from aggregated monthly data
            let aggregatedGrowth3m: number | null = null;
            if (aggregatedMonthlyData.length >= 3) {
                const lastMonth = aggregatedMonthlyData[aggregatedMonthlyData.length - 1];
                const threeMonthsAgo = aggregatedMonthlyData[aggregatedMonthlyData.length - 3];
                aggregatedGrowth3m = ((lastMonth.volume - threeMonthsAgo.volume) / (threeMonthsAgo.volume + 1)) * 100;
            }

            // Calculate aggregated volatility from aggregated monthly data
            const aggregatedVolatility = calculateVolatility(aggregatedMonthlyData);

            // Calculate aggregated trend strength from aggregated YoY growth and volatility
            const aggregatedTrendStrength = aggregatedGrowthYoy !== null
                ? calculateTrendStrength(aggregatedGrowthYoy, aggregatedVolatility)
                : 0;

            // Calculate aggregated opportunity score from aggregated primary metrics
            let aggregatedOpportunityScore = null;
            let aggregatedBidEfficiency = null;
            let aggregatedTac = null;
            let aggregatedSac = null;

            if (avgVolume && avgCpc !== null && avgTopPageBid !== null && aggregatedGrowthYoy !== null && aggregatedMonthlyData.length > 0) {
                const oppResult = calculateOpportunityScore({
                    volume: avgVolume,
                    competition: competitionNumber,
                    cpc: avgCpc,
                    topPageBid: avgTopPageBid,
                    growthYoy: aggregatedGrowthYoy,
                    monthlyData: aggregatedMonthlyData
                });
                aggregatedOpportunityScore = oppResult.opportunityScore;
                aggregatedBidEfficiency = oppResult.bidEfficiency;
                aggregatedTac = oppResult.tac;
                aggregatedSac = oppResult.sac;
            }

            // Format keywords for response (matching Keyword type from schema)
            // Need to calculate opportunity score and other derived metrics for individual keywords

            // Get all similarity scores for keywords in one query
            const keywordIds = keywordsWithData.map(kw => kw.id);
            const projectLinks = keywordIds.length > 0
                ? await db
                    .select()
                    .from(customSearchProjectKeywords)
                    .where(
                        eq(customSearchProjectKeywords.customSearchProjectId, projectId)
                    )
                : [];

            const similarityScoreMap = new Map<string, string>();
            const pitch = project.pitch || "";

            // Create a map of keyword ID to keyword text for lookup
            const keywordIdToTextMap = new Map<string, string>();
            keywordsWithData.forEach(kw => {
                keywordIdToTextMap.set(kw.id, kw.keyword);
            });

            // Recalculate similarity scores if they're missing, equal to 0.8 (old default), or 0.5 (current default when pitch was empty)
            for (const link of projectLinks) {
                let similarity = link.similarityScore ? parseFloat(link.similarityScore) : null;

                // If similarity is missing, is the old default (0.8), or is the current default (0.5), recalculate it
                if (similarity === null || similarity === 0.8 || similarity === 0.5) {
                    const keywordText = keywordIdToTextMap.get(link.globalKeywordId);
                    if (keywordText && pitch.trim()) {
                        try {
                            similarity = await keywordVectorService.calculateTextSimilarity(pitch, keywordText);
                            // Update the database with the new similarity score
                            await db
                                .update(customSearchProjectKeywords)
                                .set({ similarityScore: similarity.toString() })
                                .where(eq(customSearchProjectKeywords.id, link.id));
                        } catch (error) {
                            console.warn(`Failed to calculate similarity for keyword "${keywordText}":`, error);
                            similarity = similarity || 0.5; // Use existing or default
                        }
                    } else {
                        similarity = similarity || 0.5; // Use existing or default
                    }
                }

                similarityScoreMap.set(link.globalKeywordId, similarity.toString());
            }

            const formattedKeywords = keywordsWithData.map(kw => {
                // Calculate opportunity score if we have all required data
                let opportunityScore = null;
                let bidEfficiency = null;
                let tac = null;
                let sac = null;

                if (kw.volume && kw.competition !== null && kw.cpc && kw.topPageBid && kw.growthYoy !== null && kw.monthlyData) {
                    try {
                        const oppResult = calculateOpportunityScore({
                            volume: kw.volume,
                            competition: kw.competition,
                            cpc: parseFloat(kw.cpc),
                            topPageBid: parseFloat(kw.topPageBid),
                            growthYoy: parseFloat(kw.growthYoy),
                            monthlyData: kw.monthlyData
                        });
                        opportunityScore = oppResult.opportunityScore;
                        bidEfficiency = oppResult.bidEfficiency;
                        tac = oppResult.tac;
                        sac = oppResult.sac;
                    } catch (error) {
                        console.error(`Error calculating opportunity score for keyword ${kw.keyword}:`, error);
                    }
                }

                const similarityScore = similarityScoreMap.get(kw.id) || null;

                // Ensure monthlyData is properly formatted and sorted chronologically
                let formattedMonthlyData = kw.monthlyData || [];
                if (Array.isArray(formattedMonthlyData) && formattedMonthlyData.length > 0) {
                    // Check if data is in "YYYY-MM" format (from DataForSEO) and convert to "Nov 2021" format
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const needsConversion = formattedMonthlyData.some((item: any) =>
                        typeof item.month === 'string' && /^\d{4}-\d{2}$/.test(item.month)
                    );

                    if (needsConversion) {
                        formattedMonthlyData = formattedMonthlyData.map((item: any) => {
                            if (/^\d{4}-\d{2}$/.test(item.month)) {
                                const [year, month] = item.month.split('-');
                                const monthIndex = parseInt(month, 10) - 1;
                                const monthName = monthNames[monthIndex];
                                return {
                                    month: `${monthName} ${year}`,
                                    volume: item.volume,
                                    sortKey: item.month // For sorting
                                };
                            }
                            return { ...item, sortKey: item.month };
                        }).sort((a: any, b: any) => {
                            // Sort chronologically
                            if (a.sortKey && b.sortKey) {
                                return a.sortKey.localeCompare(b.sortKey);
                            }
                            // If no sortKey, try to parse from month string
                            const dateA = new Date(a.month);
                            const dateB = new Date(b.month);
                            return dateA.getTime() - dateB.getTime();
                        }).map(({ sortKey, ...rest }: any) => rest); // Remove sortKey after sorting
                    } else {
                        // Already in correct format, just ensure it's sorted
                        formattedMonthlyData = [...formattedMonthlyData].sort((a: any, b: any) => {
                            const dateA = new Date(a.month);
                            const dateB = new Date(b.month);
                            return dateA.getTime() - dateB.getTime();
                        });
                    }
                }

                return {
                    id: kw.id,
                    reportId: projectId, // Use projectId as reportId for display purposes
                    keyword: kw.keyword,
                    volume: kw.volume,
                    competition: kw.competition,
                    cpc: kw.cpc ? parseFloat(kw.cpc).toString() : null,
                    topPageBid: kw.topPageBid ? parseFloat(kw.topPageBid).toString() : null,
                    growth3m: kw.growth3m ? parseFloat(kw.growth3m).toString() : null,
                    growthYoy: kw.growthYoy ? parseFloat(kw.growthYoy).toString() : null,
                    similarityScore: similarityScore ? parseFloat(similarityScore).toString() : null,
                    growthSlope: null,
                    growthR2: null,
                    growthConsistency: null,
                    growthStability: null,
                    sustainedGrowthScore: null,
                    volatility: kw.volatility ? parseFloat(kw.volatility).toString() : null,
                    trendStrength: kw.trendStrength ? parseFloat(kw.trendStrength).toString() : null,
                    bidEfficiency: bidEfficiency ? bidEfficiency.toString() : null,
                    tac: tac ? tac.toString() : null,
                    sac: sac ? sac.toString() : null,
                    opportunityScore: opportunityScore ? opportunityScore.toString() : null,
                    monthlyData: formattedMonthlyData
                };
            });

            res.json({
                success: true,
                report: {
                    aggregated: {
                        avgVolume,
                        growth3m: aggregatedGrowth3m !== null ? aggregatedGrowth3m.toString() : null,
                        growthYoy: aggregatedGrowthYoy !== null ? aggregatedGrowthYoy.toString() : null,
                        competition,
                        avgTopPageBid: avgTopPageBid !== null ? avgTopPageBid.toString() : null,
                        avgCpc: avgCpc !== null ? avgCpc.toString() : null,
                        // Secondary metrics computed from aggregated primary metrics
                        volatility: aggregatedVolatility.toString(),
                        trendStrength: aggregatedTrendStrength.toString(),
                        bidEfficiency: aggregatedBidEfficiency !== null ? aggregatedBidEfficiency.toString() : null,
                        tac: aggregatedTac !== null ? aggregatedTac.toString() : null,
                        sac: aggregatedSac !== null ? aggregatedSac.toString() : null,
                        opportunityScore: aggregatedOpportunityScore !== null ? aggregatedOpportunityScore.toString() : null
                    },
                    keywords: formattedKeywords,
                    totalKeywords: keywordsWithData.length
                }
            });
        } catch (error) {
            console.error("Error generating report:", error);
            res.status(500).json({
                message: error instanceof Error ? error.message : "Failed to generate report",
                error: error instanceof Error ? error.stack : String(error)
            });
        }
    });

    const httpServer = createServer(app);
    return httpServer;
}

