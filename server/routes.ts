import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { insertUserSchema } from "@shared/schema-sqlite";
import bcrypt from "bcryptjs";
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

declare module "express-session" {
    interface SessionData {
        userId?: string;
    }
}

export async function registerRoutes(app: Express): Promise<Server> {
    // Session middleware
    app.use(
        session({
            secret: process.env.SESSION_SECRET || "pioneer-idea-finder-secret-key",
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: process.env.NODE_ENV === "production",
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000, // 24 hours
            },
        }),
    );

    // Auth middleware
    const requireAuth = (req: any, res: any, next: any) => {
        if (!req.session.userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        next();
    };

    // Auth routes
    app.post("/api/auth/signup", async (req, res) => {
        try {
            console.log("Signup attempt:", {
                email: req.body?.email,
                hasFirstName: !!req.body?.firstName,
                hasLastName: !!req.body?.lastName,
                hasPassword: !!req.body?.password,
                bodyKeys: Object.keys(req.body || {}),
            });

            const data = insertUserSchema.parse(req.body);

            console.log("Checking for existing user...");
            const existingUser = await storage.getUserByEmail(data.email);
            if (existingUser) {
                console.log("User already exists");
                return res.status(400).json({ message: "Email already exists" });
            }

            console.log("Hashing password...");
            const hashedPassword = await bcrypt.hash(data.password, 10);

            console.log("Creating user in database...");
            const user = await storage.createUser({
                firstName: data.firstName,
                lastName: data.lastName,
                email: data.email,
                password: hashedPassword,
            });

            console.log("User created successfully:", user.id);
            req.session.userId = user.id;
            res.json({ user: { id: user.id, email: user.email } });
        } catch (error) {
            console.error("Signup error:", error);
            console.error("Error type:", error?.constructor?.name);

            // Handle database connection errors
            if (
                error &&
                typeof error === "object" &&
                "type" in error &&
                error.type === "error"
            ) {
                console.error("Database connection error detected");
                return res.status(500).json({
                    message: "Database connection failed. Please try again.",
                });
            }

            if (error instanceof Error && "issues" in error) {
                // Zod validation error
                const zodError = error as any;
                console.error("Zod validation issues:", zodError.issues);
                return res.status(400).json({
                    message: zodError.issues?.[0]?.message || "Validation failed",
                    errors: zodError.issues,
                });
            }

            res.status(500).json({
                message:
                    error instanceof Error
                        ? error.message
                        : "Failed to create account. Please try again.",
            });
        }
    });

    app.post("/api/auth/login", async (req, res) => {
        try {
            const { email, password } = req.body;

            const user = await storage.getUserByEmail(email);
            if (!user) {
                return res.status(401).json({ message: "Invalid credentials" });
            }

            const isValid = await bcrypt.compare(password, user.password);
            if (!isValid) {
                return res.status(401).json({ message: "Invalid credentials" });
            }

            req.session.userId = user.id;
            res.json({ user: { id: user.id, email: user.email } });
        } catch (error) {
            res.status(400).json({ message: "Login failed" });
        }
    });

    app.get("/api/auth/me", async (req, res) => {
        if (!req.session.userId) {
            return res.json({ user: null });
        }

        const user = await storage.getUser(req.session.userId);
        if (!user) {
            return res.json({ user: null });
        }

        res.json({ user: { id: user.id, email: user.email } });
    });

    app.post("/api/auth/logout", (req, res) => {
        req.session.destroy(() => {
            res.json({ success: true });
        });
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
            const userId = req.session.userId!; // Use session userId instead of client-provided

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
            const ideas = await storage.getIdeasByUser(req.session.userId!);

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

            if (idea.userId !== req.session.userId) {
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

            // Validate keywordCount (preload 20 keywords by default)
            const validatedCount = Math.max(
                1,
                Math.min(100, parseInt(keywordCount) || 20),
            );

            const idea = await storage.getIdea(ideaId);
            if (!idea) {
                return res.status(404).json({ message: "Idea not found" });
            }

            if (idea.userId !== req.session.userId) {
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
                userId: req.session.userId!,
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

            if (report.userId !== req.session.userId) {
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

            if (report.userId !== req.session.userId) {
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

    // Get aggregated sector metrics
    app.get("/api/sectors/aggregated", async (req, res) => {
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
