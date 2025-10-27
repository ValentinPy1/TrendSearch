import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { insertUserSchema } from "@shared/schema";
import bcrypt from "bcryptjs";
import { keywordVectorService } from "./keyword-vector-service";
import { microSaaSIdeaGenerator } from "./microsaas-idea-generator";
import { calculateOpportunityScore } from "./opportunity-score";

async function getKeywordsFromVectorDB(idea: string, topN: number = 10) {
  // Use vector similarity search to find most relevant keywords
  const similarKeywords = await keywordVectorService.findSimilarKeywords(
    idea,
    topN,
  );

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

  const keywords = similarKeywords.map((kw) => {
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

    return {
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
  });

  // Calculate aggregate metrics from actual data
  const avgVolume = Math.floor(
    keywords.reduce((sum, k) => sum + k.volume, 0) / keywords.length,
  );
  const growth3m = (
    keywords.reduce((sum, k) => sum + parseFloat(k.growth3m), 0) /
    keywords.length
  ).toFixed(2);
  const growthYoy = (
    keywords.reduce((sum, k) => sum + parseFloat(k.growthYoy), 0) /
    keywords.length
  ).toFixed(2);
  const avgCompetition = Math.floor(
    keywords.reduce((sum, k) => sum + k.competition, 0) / keywords.length,
  );
  const avgTopPageBid = (
    keywords.reduce((sum, k) => sum + parseFloat(k.topPageBid), 0) /
    keywords.length
  ).toFixed(2);
  const avgCpc = (
    keywords.reduce((sum, k) => sum + parseFloat(k.cpc), 0) / keywords.length
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

      // Add isKeyword flag to each idea (check if similarity >= 95%)
      const ideasWithKeywordFlag = await Promise.all(
        ideas.map(async (idea) => ({
          ...idea,
          isKeyword: await keywordVectorService.isKeyword(
            idea.generatedIdea,
            0.95,
          ),
        })),
      );

      res.json(ideasWithKeywordFlag);
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
      const { ideaId, keywordCount = 20 } = req.body;

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

      // Get real keyword data from vector database
      const { keywords: keywordData, aggregates } =
        await getKeywordsFromVectorDB(idea.generatedIdea, validatedCount);

      // Create report
      const report = await storage.createReport({
        ideaId,
        userId: req.session.userId!,
        avgVolume: aggregates.avgVolume,
        growth3m: aggregates.growth3m,
        growthYoy: aggregates.growthYoy,
        competition: aggregates.competition,
        avgTopPageBid: aggregates.avgTopPageBid,
        avgCpc: aggregates.avgCpc,
      });

      // Create keywords with opportunity scores
      const keywordsToInsert = keywordData.map((kw) => {
        // Calculate opportunity score for each keyword
        const { opportunityScore } = calculateOpportunityScore({
          volume: kw.volume || 0,
          competition: kw.competition || 0,
          cpc: parseFloat(kw.cpc?.toString() || "0"),
          topPageBid: parseFloat(kw.topPageBid?.toString() || "0"),
          growth3m: parseFloat(kw.growth3m?.toString() || "0"),
          growthYoy: parseFloat(kw.growthYoy?.toString() || "0"),
          growthConsistency: parseFloat(kw.growthConsistency?.toString() || "0"),
          growthStability: parseFloat(kw.growthStability?.toString() || "0"),
          growthR2: parseFloat(kw.growthR2?.toString() || "0"),
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
          opportunityScore,
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

      // Fetch 5 more keywords
      const newCount = currentCount + 5;
      const { keywords: keywordData } = await getKeywordsFromVectorDB(
        idea.generatedIdea,
        newCount,
      );

      // Get the last 5 keywords
      const newKeywordsData = keywordData.slice(currentCount);

      if (newKeywordsData.length === 0) {
        return res.status(400).json({ message: "No more keywords available" });
      }

      // Filter out any duplicates
      const existingKeywordSet = new Set(existingKeywords.map((k) => k.keyword));
      const uniqueNewKeywords = newKeywordsData.filter(
        (kw) => !existingKeywordSet.has(kw.keyword),
      );

      if (uniqueNewKeywords.length === 0) {
        return res.status(400).json({ message: "No more unique keywords available" });
      }

      // Create the new keywords with opportunity scores
      const keywordsToInsert = uniqueNewKeywords.map((kw) => {
        // Calculate opportunity score for each keyword
        const { opportunityScore } = calculateOpportunityScore({
          volume: kw.volume || 0,
          competition: kw.competition || 0,
          cpc: parseFloat(kw.cpc?.toString() || "0"),
          topPageBid: parseFloat(kw.topPageBid?.toString() || "0"),
          growth3m: parseFloat(kw.growth3m?.toString() || "0"),
          growthYoy: parseFloat(kw.growthYoy?.toString() || "0"),
          growthConsistency: parseFloat(kw.growthConsistency?.toString() || "0"),
          growthStability: parseFloat(kw.growthStability?.toString() || "0"),
          growthR2: parseFloat(kw.growthR2?.toString() || "0"),
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
          opportunityScore,
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

  const httpServer = createServer(app);
  return httpServer;
}
