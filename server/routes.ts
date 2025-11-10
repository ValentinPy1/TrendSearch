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
import {
    SAVE_INTERVAL_MS,
    SAVE_KEYWORD_INTERVAL,
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
            const dateA = new Date(a.month);
            const dateB = new Date(b.month);
            return dateA.getTime() - dateB.getTime();
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
            .select()
            .from(customSearchProjectKeywords)
            .where(
                eq(customSearchProjectKeywords.customSearchProjectId, projectId)
            )
        : [];

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
    });

    for (const link of projectLinks) {
        let similarity = link.similarityScore ? parseFloat(link.similarityScore) : null;
        if (similarity === null || similarity === 0.8) {
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

    const similarityDuration = Date.now() - similarityStartTime;
    logger.info("Similarity calculation complete", {
        duration: `${similarityDuration}ms (${(similarityDuration / 1000).toFixed(2)}s)`,
        calculated: similarityCalculated,
        cached: similarityCached,
        errors: similarityErrors,
        total: projectLinks.length,
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
            monthlyData: formattedMonthlyData
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
                } catch (createError) {
                    console.error("Failed to auto-create user profile:", createError);
                    return res.status(500).json({
                        message: "Failed to create user profile. Database connection issue."
                    });
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
            let generatedName: string | null = null;

            // If expand is requested, expand the existing pitch
            if (expand && originalIdea && originalIdea.trim().length > 0) {
                try {
                    generatedIdea = await microSaaSIdeaGenerator.expandIdea(originalIdea.trim());
                    // Generate name from expanded idea
                    try {
                        generatedName = await microSaaSIdeaGenerator.generateProjectName(generatedIdea);
                    } catch (error) {
                        console.error("Error generating name from expanded idea:", error);
                    }
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
                // Generate name from provided idea
                try {
                    generatedName = await microSaaSIdeaGenerator.generateProjectName(generatedIdea);
                } catch (error) {
                    console.error("Error generating name from provided idea:", error);
                }
            } else {
                // If longerDescription is requested, generate a longer, more detailed idea
                if (longerDescription) {
                    generatedIdea = await microSaaSIdeaGenerator.generateLongerIdea();
                } else {
                    // Otherwise, use GPT-4o-mini to generate standard microSaaS idea
                    generatedIdea = await microSaaSIdeaGenerator.generateIdea();
                }
                // Generate name from generated idea
                try {
                    generatedName = await microSaaSIdeaGenerator.generateProjectName(generatedIdea);
                } catch (error) {
                    console.error("Error generating name from generated idea:", error);
                }
            }

            const idea = await storage.createIdea({
                userId,
                originalIdea: originalIdea || null,
                generatedIdea,
            });

            res.json({ idea: { ...idea, name: generatedName } });
        } catch (error) {
            console.error("Error generating idea:", error);
            res.status(500).json({ message: "Failed to generate idea" });
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
            let competitors: Array<{ name: string; description: string; url?: string | null }> = [];
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

            if (competitors.length === 0) {
                throw new Error("No competitors found");
            }

            res.json({ competitors });
        } catch (error) {
            console.error("Error finding competitors:", error);
            res.status(500).json({
                message: "Failed to find competitors",
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });

    // Custom Search Projects API
    // Get all projects for user
    app.get("/api/custom-search/projects", requireAuth, async (req, res) => {
        try {
            const projects = await storage.getCustomSearchProjects(req.user.id);
            res.json({ projects });
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

            // Get query keywords from request or project
            const queryKeywordsList = queryKeywords || project.queryKeywords || [];

            // Validate query keywords (1-20 required)
            if (!queryKeywordsList || !Array.isArray(queryKeywordsList) || queryKeywordsList.length === 0 || queryKeywordsList.length > 20) {
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
                sendProgress('calling-api', { message: `Calling DataForSEO API with ${queryKeywordsList.length} query keywords...` });

                const { createKeywordsForKeywordsTask, getKeywordsForKeywordsTask } = await import("./dataforseo-service");
                const locationCode = 2840; // Default to US

                // Create task
                const taskId = await createKeywordsForKeywordsTask(queryKeywordsList, locationCode);
                sendProgress('calling-api', { message: 'Task created successfully, polling for results...', taskId });

                // Poll task until complete with progress updates
                const pollWithProgress = async (): Promise<string[]> => {
                    let attempts = 0;
                    const maxAttempts = 60;
                    const pollInterval = 5000;

                    while (attempts < maxAttempts) {
                        const results = await getKeywordsForKeywordsTask(taskId, 1, 0); // Single attempt, no delay

                        if (results && results.length > 0) {
                            // Task completed, extract keywords
                            const keywords = results
                                .map(result => result.keyword)
                                .filter(keyword => keyword && keyword.trim().length > 0);
                            return keywords;
                        }

                        // Task still processing
                        attempts++;
                        sendProgress('calling-api', { message: `Polling task... (attempt ${attempts}/${maxAttempts})` });
                        await new Promise(resolve => setTimeout(resolve, pollInterval));
                    }

                    throw new Error(`Task did not complete within ${maxAttempts} attempts`);
                };

                finalKeywords = await pollWithProgress();

                // Save progress
                await saveProgress({
                    currentStage: 'calling-api',
                    queryKeywords: queryKeywordsList,
                    newKeywords: finalKeywords,
                    keywordsGenerated: finalKeywords.length,
                    newKeywordsCollected: finalKeywords.length,
                });

                sendProgress('calling-api', { message: `Found ${finalKeywords.length} keywords from API`, newKeywords: finalKeywords });
            } else {
                // Use saved keywords
                finalKeywords = (savedProgress.newKeywords && Array.isArray(savedProgress.newKeywords))
                    ? savedProgress.newKeywords
                    : [];

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

            // STEP 2: Fetch DataForSEO (skip if already done)
            if (!savedProgress || !savedProgress.dataForSEOFetched) {
                sendProgress('fetching-dataforseo', { message: `Finding data for ${finalKeywords.length} keywords...` });

                // Mock DataForSEO: Use existing database keywords instead of API call
                // Simulate API delay (~30s)
                await new Promise(resolve => setTimeout(resolve, 30000));

                // Get existing keywords from database
                const existingKeywords = await storage.getGlobalKeywordsByTexts(finalKeywords);
                const existingKeywordsMap = new Map(existingKeywords.map(kw => [kw.keyword.toLowerCase(), kw]));

                // Simulate DataForSEO API response structure using existing database data
                // For keywords not in DB, generate random mock data (fast)
                const keywordResults: any[] = [];

                for (const keywordText of finalKeywords) {
                    const existingKeyword = existingKeywordsMap.get(keywordText.toLowerCase());

                    if (existingKeyword && (
                        existingKeyword.volume !== null ||
                        existingKeyword.competition !== null ||
                        existingKeyword.cpc !== null ||
                        existingKeyword.topPageBid !== null
                    )) {
                        // Use existing keyword data from database
                        const monthlyData = existingKeyword.monthlyData && Array.isArray(existingKeyword.monthlyData)
                            ? existingKeyword.monthlyData.map((md: any) => {
                                const [monthName, yearStr] = md.month.split(' ');
                                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                                const month = monthNames.indexOf(monthName) + 1;
                                const year = parseInt(yearStr);
                                return {
                                    year,
                                    month,
                                    search_volume: md.volume || 0
                                };
                            })
                            : [];

                        // Convert competition from number to string if needed
                        let competition = existingKeyword.competition;
                        if (typeof competition === 'number') {
                            if (competition === 100) competition = 'HIGH';
                            else if (competition === 50) competition = 'MEDIUM';
                            else if (competition === 0) competition = 'LOW';
                        }

                        keywordResults.push({
                            keyword: existingKeyword.keyword,
                            spell: null,
                            location_code: 2840, // US
                            language_code: 'en',
                            search_partners: false,
                            competition: competition || null,
                            competition_index: typeof existingKeyword.competition === 'number' ? existingKeyword.competition : null,
                            search_volume: existingKeyword.volume || null,
                            cpc: existingKeyword.cpc || null,
                            low_top_of_page_bid: existingKeyword.topPageBid || null,
                            high_top_of_page_bid: existingKeyword.topPageBid || null,
                            monthly_searches: monthlyData
                        });
                    } else {
                        // Generate random mock data for keywords not in DB (fast)
                        const keywordLength = keywordText.split(' ').length;
                        const baseVolume = keywordLength === 2 ? 1000 : keywordLength === 3 ? 500 : 200;
                        const volume = baseVolume + Math.floor(Math.random() * baseVolume * 0.5);
                        const competition = ['LOW', 'MEDIUM', 'HIGH'][Math.floor(Math.random() * 3)];
                        const competitionIndex = competition === 'HIGH' ? 75 + Math.floor(Math.random() * 25) :
                            competition === 'MEDIUM' ? 25 + Math.floor(Math.random() * 50) :
                                Math.floor(Math.random() * 25);
                        const cpc = 0.5 + Math.random() * 2.0; // $0.50 - $2.50
                        const topPageBid = cpc * (0.8 + Math.random() * 0.4); // 80-120% of CPC

                        // Generate mock monthly data for last 12 months
                        const monthlyData = [];
                        const now = new Date();
                        for (let i = 11; i >= 0; i--) {
                            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                            const month = date.getMonth() + 1;
                            const year = date.getFullYear();
                            const monthlyVolume = Math.max(0, Math.floor(volume * (0.8 + Math.random() * 0.4)));
                            monthlyData.push({
                                year,
                                month,
                                search_volume: monthlyVolume
                            });
                        }

                        keywordResults.push({
                            keyword: keywordText,
                            spell: null,
                            location_code: 2840, // US
                            language_code: 'en',
                            search_partners: false,
                            competition: competition,
                            competition_index: competitionIndex,
                            search_volume: volume,
                            cpc: cpc.toFixed(2),
                            low_top_of_page_bid: topPageBid.toFixed(2),
                            high_top_of_page_bid: (topPageBid * 1.2).toFixed(2),
                            monthly_searches: monthlyData
                        });
                    }
                }
                let keywordsWithData = 0;
                const keywordsToInsert: any[] = [];
                const keywordMap = new Map<string, any>();

                for (const result of keywordResults) {
                    // Count keywords with any data metric
                    if ((result.search_volume !== null && result.search_volume !== undefined) ||
                        (result.competition !== null && result.competition !== undefined) ||
                        (result.competition_index !== null && result.competition_index !== undefined) ||
                        (result.cpc !== null && result.cpc !== undefined) ||
                        (result.low_top_of_page_bid !== null && result.low_top_of_page_bid !== undefined) ||
                        (result.high_top_of_page_bid !== null && result.high_top_of_page_bid !== undefined)) {
                        keywordsWithData++;
                    }

                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const monthlyData = result.monthly_searches?.map(ms => {
                        const monthName = monthNames[ms.month - 1];
                        return {
                            month: `${monthName} ${ms.year}`,
                            volume: ms.search_volume,
                            sortKey: `${ms.year}-${String(ms.month).padStart(2, '0')}`
                        };
                    }).sort((a, b) => a.sortKey.localeCompare(b.sortKey)).map(({ sortKey, ...rest }) => rest) || [];

                    let competitionIndex = null;
                    if (result.competition) {
                        if (result.competition === "HIGH") competitionIndex = 100;
                        else if (result.competition === "MEDIUM") competitionIndex = 50;
                        else if (result.competition === "LOW") competitionIndex = 0;
                    }

                    const avgTopPageBid = result.low_top_of_page_bid && result.high_top_of_page_bid
                        ? (result.low_top_of_page_bid + result.high_top_of_page_bid) / 2
                        : null;

                    const keywordData = {
                        keyword: result.keyword,
                        volume: result.search_volume || null,
                        competition: competitionIndex || result.competition_index || null,
                        cpc: result.cpc || null,
                        topPageBid: avgTopPageBid,
                        monthlyData: monthlyData,
                        source: "dataforseo"
                    };

                    keywordsToInsert.push(keywordData);
                    keywordMap.set(result.keyword.toLowerCase(), result);
                }

                // Add keywords without data
                for (const keyword of finalKeywords) {
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

                // Save all keywords to globalKeywords table
                const savedKeywords = await storage.createGlobalKeywords(keywordsToInsert);

                // Link keywords to project
                const allKeywordsToLink: string[] = [];
                const keywordTextToIdMap = new Map<string, string>();

                savedKeywords.forEach(kw => {
                    keywordTextToIdMap.set(kw.keyword.toLowerCase(), kw.id);
                    allKeywordsToLink.push(kw.keyword);
                });

                // Get all existing keywords that weren't in savedKeywords (already in DB)
                const allExistingKeywords = await storage.getGlobalKeywordsByTexts(finalKeywords);
                allExistingKeywords.forEach(kw => {
                    if (!keywordTextToIdMap.has(kw.keyword.toLowerCase())) {
                        keywordTextToIdMap.set(kw.keyword.toLowerCase(), kw.id);
                        allKeywordsToLink.push(kw.keyword);
                    }
                });

                const existingLinks = await storage.getProjectKeywords(projectId);
                const existingLinkIds = new Set(existingLinks.map(kw => kw.id));

                const pitch = project.pitch || "";
                const keywordIdsToLink: string[] = [];
                const similarityScoresToLink: number[] = [];

                for (const keywordText of allKeywordsToLink) {
                    const keywordId = keywordTextToIdMap.get(keywordText.toLowerCase());
                    if (keywordId && !existingLinkIds.has(keywordId)) {
                        keywordIdsToLink.push(keywordId);
                        let similarity = 0.5;
                        if (pitch.trim()) {
                            try {
                                similarity = await keywordVectorService.calculateTextSimilarity(pitch, keywordText);
                            } catch (error) {
                                console.warn(`Failed to calculate similarity for keyword "${keywordText}":`, error);
                            }
                        }
                        similarityScoresToLink.push(similarity);
                    }
                }

                if (keywordIdsToLink.length > 0) {
                    await storage.linkKeywordsToProject(projectId, keywordIdsToLink, similarityScoresToLink);
                }

                // Save progress
                await saveProgress({
                    currentStage: 'fetching-dataforseo',
                    dataForSEOFetched: true,
                    keywordsFetchedCount: keywordsWithData,
                    newKeywords: finalKeywords
                });

                sendProgress('fetching-dataforseo', {
                    message: `Fetched DataForSEO metrics: ${keywordsWithData} out of ${finalKeywords.length} keywords had data`,
                    keywordsWithData,
                    totalKeywords: finalKeywords.length
                });
            } else {
                sendProgress('fetching-dataforseo', { message: 'DataForSEO metrics already fetched, skipping...' });
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
                        error: "No keywords with data found. Please ensure keywords have been generated and DataForSEO metrics have been fetched."
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
                res.write(`data: ${JSON.stringify({
                    type: 'complete',
                    stage: 'complete',
                    currentStage: 'complete',
                    report: {
                        aggregated: reportData.aggregated,
                        keywords: reportData.keywords,
                        totalKeywords: reportData.totalKeywords
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
                        totalKeywords: reportData.totalKeywords
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
                                        const dateA = new Date(a.month);
                                        const dateB = new Date(b.month);
                                        return dateA.getTime() - dateB.getTime();
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
                            
                            // Bulk update all successful metrics in a single database call
                            const updatesToApply = batchResults
                                .filter(r => r.success && r.metrics)
                                .map(r => ({ keywordId: r.keywordId, metrics: r.metrics! }));
                            
                            if (updatesToApply.length > 0) {
                                await storage.bulkUpdateKeywordMetrics(updatesToApply);
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
        const projectIdForError = req.body.projectId;
        let lastProgress: any = null;
        let lastSaveTime = Date.now();
        const SAVE_INTERVAL = 10000; // Save every 10 seconds
        let finalKeywords: string[] = [];

        try {
            const { projectId, target, location_code } = req.body;

            // Verify project exists and user owns it
            if (!projectId) {
                return res.status(400).json({ message: "projectId is required" });
            }

            if (!target || typeof target !== 'string' || target.trim().length === 0) {
                return res.status(400).json({ message: "target (website URL) is required" });
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

            // Get saved progress
            const savedProgress = project.keywordGenerationProgress;

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

                    await storage.saveKeywordGenerationProgress(projectId, progressToSave);
                    lastSaveTime = Date.now();

                    // Update local project reference to reflect saved progress
                    project.keywordGenerationProgress = progressToSave;
                } catch (error) {
                    console.error("Error saving progress:", error);
                }
            };

            // STEP 1: Create task (skip if keywords already found from website)
            if (!savedProgress || !savedProgress.newKeywords || savedProgress.newKeywords.length === 0) {
                sendProgress('creating-task', { message: `Creating task to find keywords for ${target}...` });

                const { createKeywordsForSiteTask } = await import("./dataforseo-service");
                const locationCode = location_code || 2840; // Default to US
                
                const taskId = await createKeywordsForSiteTask(target, locationCode);

                sendProgress('creating-task', { message: 'Task created successfully', taskId });

                // STEP 2: Poll task until complete
                sendProgress('polling-task', { message: 'Polling task for results...' });

                const { getKeywordsForSiteTask } = await import("./dataforseo-service");
                
                // Poll with progress updates
                let pollAttempt = 0;
                const maxPollAttempts = 60;
                const pollIntervalMs = 5000;

                const pollWithProgress = async (): Promise<string[]> => {
                    const apiUrl = `https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_site/task_get/${taskId}`;
                    const credB64 = process.env.DATA_FOR_SEO_CRED_B64;

                    if (!credB64) {
                        throw new Error("DATA_FOR_SEO_CRED_B64 environment variable is not set");
                    }

                    while (pollAttempt < maxPollAttempts) {
                        const response = await fetch(apiUrl, {
                            method: "GET",
                            headers: {
                                "Authorization": `Basic ${credB64}`,
                                "Content-Type": "application/json"
                            }
                        });

                        if (!response.ok) {
                            const errorText = await response.text();
                            throw new Error(`DataForSEO API error: ${response.status} ${response.statusText} - ${errorText}`);
                        }

                        const data = await response.json();

                        if (data.status_code !== 20000) {
                            throw new Error(`DataForSEO API error: ${data.status_message} (code: ${data.status_code})`);
                        }

                        if (!data.tasks || data.tasks.length === 0) {
                            throw new Error("No tasks found in response");
                        }

                        const task = data.tasks[0];

                        if (task.status_code === 20000 && task.result && task.result.length > 0) {
                            // Task completed successfully
                            const keywords = task.result
                                .map((result: any) => result.keyword)
                                .filter((keyword: string) => keyword && keyword.trim().length > 0);
                            
                            return keywords;
                        } else if (task.status_code === 20100 || task.status_code === 20200) {
                            // Task still processing
                            pollAttempt++;
                            sendProgress('polling-task', { 
                                message: `Polling... (attempt ${pollAttempt}/${maxPollAttempts})`,
                                attempt: pollAttempt,
                                maxAttempts: maxPollAttempts
                            });
                            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
                            continue;
                        } else {
                            throw new Error(`Task failed: ${task.status_message} (code: ${task.status_code})`);
                        }
                    }

                    throw new Error(`Task did not complete within ${maxPollAttempts} attempts`);
                };

                finalKeywords = await pollWithProgress();

                // STEP 3: Extract and save keywords
                sendProgress('extracting-keywords', { message: `Extracted ${finalKeywords.length} keywords from website` });

                // Save keywords to project progress
                await saveProgress({
                    currentStage: 'extracting-keywords',
                    newKeywords: finalKeywords,
                    keywordsGenerated: finalKeywords.length,
                    newKeywordsCollected: finalKeywords.length
                });

                sendProgress('extracting-keywords', { message: `Saved ${finalKeywords.length} keywords`, newKeywords: finalKeywords });
            } else {
                // Use saved keywords
                finalKeywords = (savedProgress.newKeywords && Array.isArray(savedProgress.newKeywords))
                    ? savedProgress.newKeywords
                    : [];

                if (finalKeywords.length === 0) {
                    res.write(`data: ${JSON.stringify({
                        type: 'error',
                        error: "No keywords found. Please try again."
                    })}\n\n`);
                    res.end();
                    return;
                }

                sendProgress('extracting-keywords', { message: `Using ${finalKeywords.length} previously found keywords`, newKeywords: finalKeywords });
            }

            // Validate that we have keywords before proceeding
            if (!finalKeywords || finalKeywords.length === 0) {
                res.write(`data: ${JSON.stringify({
                    type: 'error',
                    error: "No keywords were found from the website. Please check the URL and try again."
                })}\n\n`);
                res.end();
                return;
            }

            // STEP 4: Fetch DataForSEO (reuse existing logic from generate-full-report)
            if (!savedProgress || !savedProgress.dataForSEOFetched) {
                sendProgress('fetching-dataforseo', { message: `Finding data for ${finalKeywords.length} keywords...` });

                // Calculate date range: last 4 years from today
                const today = new Date();
                const fourYearsAgo = new Date();
                fourYearsAgo.setFullYear(today.getFullYear() - 4);

                const dateTo = today.toISOString().split('T')[0];
                const dateFrom = fourYearsAgo.toISOString().split('T')[0];

                // Import and call DataForSEO service
                const { fetchKeywordMetrics } = await import("./dataforseo-service");
                
                // Process keywords in batches of 1000 (API limit)
                const BATCH_SIZE = 1000;
                let allKeywordResults: any[] = [];

                for (let i = 0; i < finalKeywords.length; i += BATCH_SIZE) {
                    const batch = finalKeywords.slice(i, i + BATCH_SIZE);
                    const apiResponse = await fetchKeywordMetrics(batch, dateFrom, dateTo);
                    
                    const task = apiResponse.tasks[0];
                    if (task && task.result) {
                        allKeywordResults.push(...task.result);
                    }
                }

                // Process API response and save to database (reuse logic from generate-full-report)
                const keywordResults = allKeywordResults;
                let keywordsWithData = 0;
                const keywordsToInsert: any[] = [];
                const keywordMap = new Map<string, any>();

                for (const result of keywordResults) {
                    // Count keywords with any data metric
                    if ((result.search_volume !== null && result.search_volume !== undefined) ||
                        (result.competition !== null && result.competition !== undefined) ||
                        (result.competition_index !== null && result.competition_index !== undefined) ||
                        (result.cpc !== null && result.cpc !== undefined) ||
                        (result.low_top_of_page_bid !== null && result.low_top_of_page_bid !== undefined) ||
                        (result.high_top_of_page_bid !== null && result.high_top_of_page_bid !== undefined)) {
                        keywordsWithData++;
                    }

                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const monthlyData = result.monthly_searches?.map((ms: any) => {
                        const monthName = monthNames[ms.month - 1];
                        return {
                            month: `${monthName} ${ms.year}`,
                            volume: ms.search_volume,
                            sortKey: `${ms.year}-${String(ms.month).padStart(2, '0')}`
                        };
                    }).sort((a: any, b: any) => a.sortKey.localeCompare(b.sortKey)).map(({ sortKey, ...rest }: any) => rest) || [];

                    let competitionIndex = null;
                    if (result.competition) {
                        if (result.competition === "HIGH") competitionIndex = 100;
                        else if (result.competition === "MEDIUM") competitionIndex = 50;
                        else if (result.competition === "LOW") competitionIndex = 0;
                    }

                    const avgTopPageBid = result.low_top_of_page_bid && result.high_top_of_page_bid
                        ? (result.low_top_of_page_bid + result.high_top_of_page_bid) / 2
                        : null;

                    const keywordData = {
                        keyword: result.keyword,
                        volume: result.search_volume || null,
                        competition: competitionIndex || result.competition_index || null,
                        cpc: result.cpc || null,
                        topPageBid: avgTopPageBid,
                        monthlyData: monthlyData,
                        source: "dataforseo"
                    };

                    keywordsToInsert.push(keywordData);
                    keywordMap.set(result.keyword.toLowerCase(), result);
                }

                // Add keywords without data
                for (const keyword of finalKeywords) {
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

                // Save all keywords to globalKeywords table
                const savedKeywords = await storage.createGlobalKeywords(keywordsToInsert);

                // Link keywords to project
                const allKeywordsToLink: string[] = [];
                const keywordTextToIdMap = new Map<string, string>();

                savedKeywords.forEach(kw => {
                    keywordTextToIdMap.set(kw.keyword.toLowerCase(), kw.id);
                    allKeywordsToLink.push(kw.keyword);
                });

                // Get all existing keywords that weren't in savedKeywords (already in DB)
                const allExistingKeywords = await storage.getGlobalKeywordsByTexts(finalKeywords);
                allExistingKeywords.forEach(kw => {
                    if (!keywordTextToIdMap.has(kw.keyword.toLowerCase())) {
                        keywordTextToIdMap.set(kw.keyword.toLowerCase(), kw.id);
                        allKeywordsToLink.push(kw.keyword);
                    }
                });

                const existingLinks = await storage.getProjectKeywords(projectId);
                const existingLinkIds = new Set(existingLinks.map(kw => kw.id));

                const pitch = project.pitch || "";
                const keywordIdsToLink: string[] = [];
                const similarityScoresToLink: number[] = [];

                for (const keywordText of allKeywordsToLink) {
                    const keywordId = keywordTextToIdMap.get(keywordText.toLowerCase());
                    if (keywordId && !existingLinkIds.has(keywordId)) {
                        keywordIdsToLink.push(keywordId);
                        let similarity = 0.5;
                        if (pitch.trim()) {
                            try {
                                similarity = await keywordVectorService.calculateTextSimilarity(pitch, keywordText);
                            } catch (error) {
                                console.warn(`Failed to calculate similarity for keyword "${keywordText}":`, error);
                            }
                        }
                        similarityScoresToLink.push(similarity);
                    }
                }

                if (keywordIdsToLink.length > 0) {
                    await storage.linkKeywordsToProject(projectId, keywordIdsToLink, similarityScoresToLink);
                }

                // Save progress
                await saveProgress({
                    currentStage: 'fetching-dataforseo',
                    dataForSEOFetched: true,
                    keywordsFetchedCount: keywordsWithData,
                    newKeywords: finalKeywords
                });

                sendProgress('fetching-dataforseo', {
                    message: `Fetched DataForSEO metrics: ${keywordsWithData} out of ${finalKeywords.length} keywords had data`,
                    keywordsWithData,
                    totalKeywords: finalKeywords.length
                });
            } else {
                sendProgress('fetching-dataforseo', { message: 'DataForSEO metrics already fetched, skipping...' });
            }

            // STEP 5: Generate report FIRST (before computing metrics)
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

                // Include keywords with any data metric
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
                    res.write(`data: ${JSON.stringify({
                        type: 'error',
                        stage: 'generating-report',
                        error: "No keywords with data found. Please ensure keywords have been generated and DataForSEO metrics have been fetched."
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
                res.write(`data: ${JSON.stringify({
                    type: 'complete',
                    stage: 'complete',
                    currentStage: 'complete',
                    report: {
                        aggregated: reportData.aggregated,
                        keywords: reportData.keywords,
                        totalKeywords: reportData.totalKeywords
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
                        totalKeywords: reportData.totalKeywords
                    }
                })}\n\n`);
            }

            // Close the response so user can see the report immediately
            res.end();

            // STEP 6: Compute metrics in the background (asynchronously, after sending report)
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
                                batchSize: batch.length,
                            });

                            const batchUpdates = await Promise.allSettled(
                                batch.map(async (keyword) => {
                                    if (!keyword.monthlyData || !Array.isArray(keyword.monthlyData) || keyword.monthlyData.length === 0 || keyword.volume === null) {
                                        return { keywordId: keyword.id, metrics: null, skipped: true };
                                    }

                                    try {
                                        const volatility = calculateVolatility(keyword.monthlyData);
                                        const trendStrength = calculateTrendStrength(keyword.monthlyData);
                                        const opportunityScore = (volatility + trendStrength) / 2;

                                        return {
                                            keywordId: keyword.id,
                                            metrics: {
                                                volatility: volatility.toFixed(2),
                                                trendStrength: trendStrength.toFixed(2),
                                                opportunityScore: opportunityScore.toFixed(2)
                                            },
                                            skipped: false
                                        };
                                    } catch (error) {
                                        logger.warn("Error computing metrics for keyword", {
                                            keywordId: keyword.id,
                                            error: error instanceof Error ? error.message : String(error),
                                        });
                                        return { keywordId: keyword.id, metrics: null, skipped: false, error: true };
                                    }
                                })
                            );

                            const successful = batchUpdates.filter(r => r.status === 'fulfilled' && !r.value.skipped && !r.value.error).length;
                            const skipped = batchUpdates.filter(r => r.status === 'fulfilled' && r.value.skipped).length;
                            const errors = batchUpdates.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error)).length;

                            processedCount += successful;
                            skippedCount += skipped;
                            errorCount += errors;

                            const validUpdates = batchUpdates
                                .filter(r => r.status === 'fulfilled' && r.value.metrics !== null)
                                .map(r => (r as PromiseFulfilledResult<any>).value);

                            if (validUpdates.length > 0) {
                                await storage.bulkUpdateKeywordMetrics(validUpdates);
                            }

                            const batchDuration = Date.now() - batchStartTime;
                            logger.info(`[Batch ${batchNumber}/${totalBatches}] Batch completed (background)`, {
                                batchNumber,
                                totalBatches,
                                duration: `${batchDuration}ms`,
                                successful,
                                skipped,
                                errors,
                            });
                        }

                        const metricsDuration = Date.now() - metricsStartTime;
                        logger.info("=== COMPUTE METRICS PIPELINE COMPLETE (BACKGROUND) ===", {
                            projectId,
                            duration: `${metricsDuration}ms (${(metricsDuration / 1000).toFixed(2)}s)`,
                            processed: processedCount,
                            skipped: skippedCount,
                            errors: errorCount,
                            total: totalKeywords,
                        });

                        // Save progress
                        await saveProgress({
                            currentStage: 'complete',
                            metricsComputed: true,
                            metricsProcessedCount: processedCount,
                            newKeywords: finalKeywords
                        });
                    } catch (error) {
                        logger.error("Error in background metrics computation", error, {
                            projectId,
                        });
                    }
                })();
            }
        } catch (error) {
            logger.error("Error in find-keywords-from-website endpoint", error, {
                projectId: projectIdForError,
            });

            // Try to save error state
            if (projectIdForError) {
                try {
                    const errorProgress = {
                        currentStage: 'error',
                        error: error instanceof Error ? error.message : "Unknown error",
                        newKeywords: finalKeywords || []
                    };
                    await storage.saveKeywordGenerationProgress(projectIdForError, errorProgress);
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

            if (topics !== undefined && !Array.isArray(topics)) {
                return res.status(400).json({ message: "topics must be an array" });
            }

            if (personas !== undefined && !Array.isArray(personas)) {
                return res.status(400).json({ message: "personas must be an array" });
            }

            if (painPoints !== undefined && !Array.isArray(painPoints)) {
                return res.status(400).json({ message: "painPoints must be an array" });
            }

            if (features !== undefined && !Array.isArray(features)) {
                return res.status(400).json({ message: "features must be an array" });
            }

            if (competitors !== undefined && !Array.isArray(competitors)) {
                return res.status(400).json({ message: "competitors must be an array" });
            }

            if (competitors && Array.isArray(competitors)) {
                for (const competitor of competitors) {
                    if (typeof competitor !== 'object' || competitor === null) {
                        return res.status(400).json({ message: "Each competitor must be an object" });
                    }
                    if (competitor.name !== undefined && typeof competitor.name !== 'string') {
                        return res.status(400).json({ message: "competitor.name must be a string" });
                    }
                    if (competitor.description !== undefined && typeof competitor.description !== 'string') {
                        return res.status(400).json({ message: "competitor.description must be a string" });
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

                // Update accumulated lists from progress
                // If progress._listsTruncated is false, these are full lists from collector
                // Otherwise, they're truncated for display and we accumulate them
                if (progress.newKeywords && Array.isArray(progress.newKeywords)) {
                    if (!progress._listsTruncated) {
                        // Full list from collector, replace accumulated
                        accumulatedNewKeywords = [...progress.newKeywords];
                    } else {
                        // Truncated list, merge with existing accumulated list (avoid duplicates)
                        const newSet = new Set(accumulatedNewKeywords.map(k => k.toLowerCase()));
                        progress.newKeywords.forEach(kw => {
                            if (!newSet.has(kw.toLowerCase())) {
                                accumulatedNewKeywords.push(kw);
                                newSet.add(kw.toLowerCase());
                            }
                        });
                    }
                }
                if (progress.allKeywords && Array.isArray(progress.allKeywords)) {
                    if (!progress._listsTruncated) {
                        accumulatedAllKeywords = [...progress.allKeywords];
                    } else {
                        const newSet = new Set(accumulatedAllKeywords.map(k => k.toLowerCase()));
                        progress.allKeywords.forEach(kw => {
                            if (!newSet.has(kw.toLowerCase())) {
                                accumulatedAllKeywords.push(kw);
                                newSet.add(kw.toLowerCase());
                            }
                        });
                    }
                }
                if (progress.duplicates && Array.isArray(progress.duplicates)) {
                    if (!progress._listsTruncated) {
                        accumulatedDuplicates = [...progress.duplicates];
                    } else {
                        const newSet = new Set(accumulatedDuplicates.map(k => k.toLowerCase()));
                        progress.duplicates.forEach(kw => {
                            if (!newSet.has(kw.toLowerCase())) {
                                accumulatedDuplicates.push(kw);
                                newSet.add(kw.toLowerCase());
                            }
                        });
                    }
                }
                if (progress.existingKeywords && Array.isArray(progress.existingKeywords)) {
                    if (!progress._listsTruncated) {
                        accumulatedExistingKeywords = [...progress.existingKeywords];
                    } else {
                        const newSet = new Set(accumulatedExistingKeywords.map(k => k.toLowerCase()));
                        progress.existingKeywords.forEach(kw => {
                            if (!newSet.has(kw.toLowerCase())) {
                                accumulatedExistingKeywords.push(kw);
                                newSet.add(kw.toLowerCase());
                            }
                        });
                    }
                }

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
                return res.status(500).json({ message: "No results from DataForSEO API" });
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

                // Map competition from string to number (HIGH=100, MEDIUM=50, LOW=0)
                let competitionIndex = null;
                if (result.competition) {
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
                    competition: competitionIndex || result.competition_index || null,
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
                message: error instanceof Error ? error.message : "Failed to fetch DataForSEO metrics",
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
                const sortedMonthlyData = [...monthlyData].sort((a, b) => {
                    const dateA = new Date(a.month);
                    const dateB = new Date(b.month);
                    return dateA.getTime() - dateB.getTime();
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
                return res.status(400).json({ message: "No keywords with data found. Please fetch DataForSEO metrics first." });
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

            // Recalculate similarity scores if they're missing or equal to 0.8 (old default)
            for (const link of projectLinks) {
                let similarity = link.similarityScore ? parseFloat(link.similarityScore) : null;

                // If similarity is missing or is the old default (0.8), recalculate it
                if (similarity === null || similarity === 0.8) {
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
