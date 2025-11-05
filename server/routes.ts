import express from "express";
import type { Express } from "express";
import { createServer } from "http";
import type { Server } from "http";
import { storage } from "./storage";
import { supabaseAdmin } from "./supabase";
import { stripe } from "./stripe";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import { db } from "./db";
import { keywordVectorService } from "./keyword-vector-service";
import { microSaaSIdeaGenerator } from "./microsaas-idea-generator";
import { calculateOpportunityScore } from "./opportunity-score";
import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";

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
) {
    let keywords: any[];

    if (filters && filters.length > 0) {
        // OPTIMIZED ALGORITHM: Similarity first, then two-phase filtering
        // Step 1: Get top-N similar keywords (candidate pool) - much faster than processing all
        const candidatePool = await keywordVectorService.findSimilarKeywords(
            idea,
            SIMILARITY_CANDIDATE_POOL_SIZE,
        );

        // Step 2: Exclude already loaded keywords (for load-more)
        let candidateKeywords = candidatePool;
        if (excludeKeywords && excludeKeywords.size > 0) {
            candidateKeywords = candidateKeywords.filter(
                (kw) => !excludeKeywords.has(kw.keyword),
            );
        }

        // Step 3: Categorize filters into raw vs processed
        const { rawFilters, processedFilters } = categorizeFilters(filters);

        // Step 4: Phase 1 - Apply raw filters on raw data (fast, no processing needed)
        let filteredRawKeywords = candidateKeywords;
        if (rawFilters.length > 0) {
            filteredRawKeywords = applyRawFilters(candidateKeywords, rawFilters);
        }

        // Step 5: If no candidates after raw filtering, return empty result
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
            };
        }

        // Step 6: Phase 2 - Process only remaining candidates and apply processed filters
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

        // Step 7: If no filtered keywords after both phases, return empty result
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
            };
        }

        // Step 8: Map similarity scores (already calculated in findSimilarKeywords)
        const similarityMap = new Map(
            candidateKeywords.map((kw) => [kw.keyword, kw.similarityScore]),
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
        hasMore: filters && filters.length > 0 ? keywords.length >= topN : undefined, // Indicate if more filtered keywords available
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
            const currentCount = existingKeywords.length;
            const newCount = currentCount + 5;

            // Always generate keywords fresh from vector service (new_keywords CSV)
            // Use excludeKeywords to avoid fetching already loaded keywords
            const { keywords: keywordData, hasMore } = await getKeywordsFromVectorDB(
                idea.generatedIdea,
                newCount,
                filters,
                existingKeywordSet, // Exclude already loaded keywords
            );

            // Get only new keywords (those not already loaded)
            const newKeywordsData = keywordData.filter(
                (kw) => !existingKeywordSet.has(kw.keyword),
            );

            // If no new filtered keywords and filters are active, indicate no more filtered results
            if (newKeywordsData.length === 0 && filters && filters.length > 0 && hasMore === false) {
                return res.status(200).json({
                    keywords: [],
                    noMoreFiltered: true,
                    message: "No more keywords match your filters. Would you like to load keywords without filters?"
                });
            }

            if (newKeywordsData.length === 0) {
                return res.status(400).json({ message: "No more keywords available" });
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

    // Generate keywords for a custom search project
    app.post("/api/custom-search/generate-keywords", requireAuth, requirePayment, async (req, res) => {
        try {
            const { projectId, pitch, topics, personas, painPoints, features } = req.body;

            // Verify project exists and user owns it
            if (projectId) {
                const project = await storage.getCustomSearchProject(projectId);
                if (!project) {
                    return res.status(404).json({ message: "Project not found" });
                }
                if (project.userId !== req.user.id) {
                    return res.status(403).json({ message: "Forbidden" });
                }
            }

            // Use provided inputs or project data
            const project = projectId ? await storage.getCustomSearchProject(projectId) : null;
            const input = {
                pitch: pitch || project?.pitch || "",
                topics: topics || project?.topics || [],
                personas: personas || project?.personas || [],
                painPoints: painPoints || project?.painPoints || [],
                features: features || project?.features || [],
                competitors: project?.competitors || [],
            };

            // Set up Server-Sent Events for progress updates
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

            // Progress callback
            const progressCallback = (progress: any) => {
                res.write(`data: ${JSON.stringify({ type: 'progress', data: progress })}\n\n`);
            };

            // Import keyword collector
            const { collectKeywords } = await import("./keyword-collector");

            // Generate keywords
            const result = await collectKeywords(input, progressCallback, 1000);

            // Send final result
            res.write(`data: ${JSON.stringify({ type: 'complete', data: { keywords: result.keywords } })}\n\n`);
            res.end();
        } catch (error) {
            console.error("Error generating keywords:", error);
            res.write(`data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : "Unknown error" })}\n\n`);
            res.end();
        }
    });

    const httpServer = createServer(app);
    return httpServer;
}
