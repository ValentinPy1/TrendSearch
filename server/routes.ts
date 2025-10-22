import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { insertUserSchema } from "@shared/schema";
import bcrypt from "bcryptjs";
import { keywordVectorService } from "./keyword-vector-service";
import { microSaaSIdeaGenerator } from "./microsaas-idea-generator";

async function getKeywordsFromVectorDB(idea: string, topN: number = 10) {
  // Use vector similarity search to find most relevant keywords
  const similarKeywords = await keywordVectorService.findSimilarKeywords(idea, topN);
  
  // Map CSV columns (2024_10 through 2025_09) to correct month labels
  const monthMapping = [
    { key: '2024_10', label: 'Oct' },
    { key: '2024_11', label: 'Nov' },
    { key: '2024_12', label: 'Dec' },
    { key: '2025_01', label: 'Jan' },
    { key: '2025_02', label: 'Feb' },
    { key: '2025_03', label: 'Mar' },
    { key: '2025_04', label: 'Apr' },
    { key: '2025_05', label: 'May' },
    { key: '2025_06', label: 'Jun' },
    { key: '2025_07', label: 'Jul' },
    { key: '2025_08', label: 'Aug' },
    { key: '2025_09', label: 'Sep' },
  ];
  
  const keywords = similarKeywords.map(kw => {
    // Convert monthly data from CSV format to our format with correct month labels
    const monthlyData = monthMapping.map(({ key, label }) => {
      return {
        month: label,
        volume: Math.floor(kw[key as keyof typeof kw] as number || kw.search_volume || 0)
      };
    }).reverse();

    return {
      keyword: kw.keyword,
      volume: Math.floor(kw.search_volume || 0),
      competition: Math.floor(kw.competition || 0),
      cpc: (kw.cpc || 0).toFixed(2),
      topPageBid: (kw.high_top_of_page_bid || kw.low_top_of_page_bid || 0).toFixed(2),
      growth3m: (kw['3month_trend_%'] || 0).toFixed(2),
      growthYoy: (kw['yoy_trend_%'] || 0).toFixed(2),
      similarityScore: kw.similarityScore.toFixed(4),
      growthSlope: (kw.growth_slope || 0).toFixed(2),
      growthR2: (kw.growth_r2 || 0).toFixed(4),
      growthConsistency: (kw.growth_consistency || 0).toFixed(4),
      growthStability: (kw.growth_stability || 0).toFixed(4),
      sustainedGrowthScore: (kw.sustained_growth_score || 0).toFixed(4),
      monthlyData
    };
  });

  // Calculate aggregate metrics from actual data
  const avgVolume = Math.floor(keywords.reduce((sum, k) => sum + k.volume, 0) / keywords.length);
  const growth3m = (keywords.reduce((sum, k) => sum + parseFloat(k.growth3m), 0) / keywords.length).toFixed(2);
  const growthYoy = (keywords.reduce((sum, k) => sum + parseFloat(k.growthYoy), 0) / keywords.length).toFixed(2);
  const avgCompetition = Math.floor(keywords.reduce((sum, k) => sum + k.competition, 0) / keywords.length);
  const avgTopPageBid = (keywords.reduce((sum, k) => sum + parseFloat(k.topPageBid), 0) / keywords.length).toFixed(2);
  const avgCpc = (keywords.reduce((sum, k) => sum + parseFloat(k.cpc), 0) / keywords.length).toFixed(2);

  // Map competition to text for compatibility
  let competitionText = 'medium';
  if (avgCompetition < 33) competitionText = 'low';
  if (avgCompetition >= 66) competitionText = 'high';

  return {
    keywords,
    aggregates: {
      avgVolume,
      growth3m,
      growthYoy,
      competition: competitionText,
      avgTopPageBid,
      avgCpc
    }
  };
}

declare module 'express-session' {
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
    })
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
      console.log("Signup attempt:", { email: req.body?.email });
      const data = insertUserSchema.parse(req.body);
      
      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already exists" });
      }

      const hashedPassword = await bcrypt.hash(data.password, 10);
      const user = await storage.createUser({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: hashedPassword,
      });

      req.session.userId = user.id;
      res.json({ user: { id: user.id, email: user.email } });
    } catch (error) {
      console.error("Signup error:", error);
      if (error instanceof Error && 'issues' in error) {
        // Zod validation error
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: (error as any).issues 
        });
      }
      res.status(400).json({ message: "Invalid input" });
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
      res.json(ideas);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ideas" });
    }
  });

  // Generate report for an idea
  app.post("/api/generate-report", requireAuth, async (req, res) => {
    try {
      const { ideaId, keywordCount = 10 } = req.body;

      // Validate keywordCount
      const validatedCount = Math.max(1, Math.min(100, parseInt(keywordCount) || 10));

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
          keywords
        });
      }

      // Get real keyword data from vector database
      const { keywords: keywordData, aggregates } = await getKeywordsFromVectorDB(idea.generatedIdea, validatedCount);

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

      // Create keywords
      const keywordsToInsert = keywordData.map(kw => ({
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
        monthlyData: kw.monthlyData,
      }));
      
      const keywords = await storage.createKeywords(keywordsToInsert);

      res.json({ report, keywords });
    } catch (error) {
      console.error('[Generate Report Error]:', error);
      res.status(500).json({ message: "Failed to generate report", error: error instanceof Error ? error.message : String(error) });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
