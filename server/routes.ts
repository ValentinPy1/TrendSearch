import express from "express";
import type { Express } from "express";
import { createServer } from "http";
import type { Server } from "http";
import { storage } from "./storage";
import { insertUserSchema } from "@shared/schema";
import { supabaseAdmin } from "./supabase";
import { stripe } from "./stripe";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import { db } from "./db";
import { keywordVectorService } from "./keyword-vector-service";
import { microSaaSIdeaGenerator } from "./microsaas-idea-generator";
import { calculateOpportunityScore } from "./opportunity-score";
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
        // Convert monthly data from CSV format to our format with correct month labels
        // Recharts displays data in the order provided, so keep chronological order
        const monthlyData = monthMapping.map(({ key, label }) => {
            return {
                month: label,
                volume: Math.floor(
                    (kw[key as keyof typeof kw] as number) || kw.search_volume || 0,
                ),
            };
        });

        // Calculate growth from chronologically ordered monthlyData
        // 3M Growth: Compare last month (Sep) to 3 months ago (Jun)
        let growth3m = 0;
        if (monthlyData.length >= 4) {
            const currentVolume = monthlyData[monthlyData.length - 1].volume; // Sep (index 11)
            const threeMonthsAgo = monthlyData[monthlyData.length - 4].volume; // Jun (index 8)
            if (threeMonthsAgo !== 0) {
                growth3m = ((currentVolume - threeMonthsAgo) / threeMonthsAgo) * 100;
            }
        }

        // YoY Growth: Compare last month (Sep) to first month (Oct)
        let growthYoy = 0;
        if (monthlyData.length >= 12) {
            const currentVolume = monthlyData[monthlyData.length - 1].volume; // Sep (index 11)
            const oneYearAgo = monthlyData[0].volume; // Oct (index 0)
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
                try {
                    localUser = await storage.createUser({
                        supabaseUserId: user.id,
                        firstName: user.user_metadata?.first_name || "",
                        lastName: user.user_metadata?.last_name || "",
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
            const updateResult = await db.update(users)
                .set({
                    hasPaid: true,
                    paymentDate: new Date(),
                    stripePaymentIntentId: session.payment_intent as string || null,
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
                    .set({ stripeCustomerId: session.customer as string })
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
                        stripePaymentIntentId: session.payment_intent as string || null,
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
            const { originalIdea } = req.body;
            const userId = req.user.id; // Use authenticated user ID

            let generatedIdea: string;

            // If user provided their own idea, use it directly
            if (originalIdea && originalIdea.trim().length > 0) {
                generatedIdea = originalIdea.trim();
            } else {
                // Otherwise, use GPT-4o-mini to generate microSaaS idea
                generatedIdea = await microSaaSIdeaGenerator.generateIdea();
            }

            const idea = await storage.createIdea({
                userId,
                originalIdea: originalIdea || null,
                generatedIdea,
            });

            res.json({ idea });
        } catch (error) {
            console.error("Error generating idea:", error);
            res.status(500).json({ message: "Failed to generate idea" });
        }
    });

    // Get user's ideas
    app.get("/api/ideas", requireAuth, async (req, res) => {
        try {
            const ideas = await storage.getIdeasByUser(req.user.id);

            // OPTIMIZATION: Removed expensive isKeyword check that was adding 12+ seconds
            // The isKeyword badge is not critical for initial page load
            // If needed, this can be computed lazily or cached in the database
            res.json(ideas);
        } catch (error) {
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
            if (existingReport) {
                const keywords = await storage.getKeywordsByReportId(existingReport.id);
                return res.json({
                    report: existingReport,
                    keywords,
                });
            }

            // Get real keyword data from vector database with filters
            const { keywords: keywordData, aggregates } =
                await getKeywordsFromVectorDB(idea.generatedIdea, validatedCount, filters);

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
            const keywordsToInsert = keywordData.map((kw) => {
                // Calculate all metrics including opportunity score
                const metrics = calculateOpportunityScore({
                    volume: kw.volume || 0,
                    competition: kw.competition || 0,
                    cpc: parseFloat(kw.cpc?.toString() || "0"),
                    topPageBid: parseFloat(kw.topPageBid?.toString() || "0"),
                    growthYoy: parseFloat(kw.growthYoy?.toString() || "0"),
                    monthlyData: kw.monthlyData || [],
                });

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
                    volatility: metrics.volatility,
                    trendStrength: metrics.trendStrength,
                    bidEfficiency: metrics.bidEfficiency,
                    tac: metrics.tac,
                    sac: metrics.sac,
                    opportunityScore: metrics.opportunityScore,
                    monthlyData: kw.monthlyData,
                };
            });

            const keywords = await storage.createKeywords(keywordsToInsert);

            res.json({ report, keywords });
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

            // Get current keyword count
            const existingKeywords = await storage.getKeywordsByReportId(reportId);
            const currentCount = existingKeywords.length;
            const existingKeywordSet = new Set(existingKeywords.map((k) => k.keyword));

            // Fetch 5 more keywords (with filters if provided)
            const { filters = [] } = req.body;
            
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
            
            const newCount = currentCount + 5;

            // Use excludeKeywords to avoid fetching already loaded keywords
            const { keywords: keywordData, hasMore } = await getKeywordsFromVectorDB(
                idea.generatedIdea,
                newCount,
                filters,
                existingKeywordSet, // Exclude already loaded keywords
            );

            // Get only new keywords (those not already in database)
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

            // Create the new keywords with opportunity scores and derived metrics
            const keywordsToInsert = newKeywordsData.map((kw: any) => {
                // Calculate all metrics including opportunity score
                const metrics = calculateOpportunityScore({
                    volume: kw.volume || 0,
                    competition: kw.competition || 0,
                    cpc: parseFloat(kw.cpc?.toString() || "0"),
                    topPageBid: parseFloat(kw.topPageBid?.toString() || "0"),
                    growthYoy: parseFloat(kw.growthYoy?.toString() || "0"),
                    monthlyData: kw.monthlyData || [],
                });

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
                    volatility: metrics.volatility,
                    trendStrength: metrics.trendStrength,
                    bidEfficiency: metrics.bidEfficiency,
                    tac: metrics.tac,
                    sac: metrics.sac,
                    opportunityScore: metrics.opportunityScore,
                    monthlyData: kw.monthlyData,
                };
            });

            const newKeywords = await storage.createKeywords(keywordsToInsert);

            res.json({ keywords: newKeywords });
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

    const httpServer = createServer(app);
    return httpServer;
}
