import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { keywordVectorService } from "./keyword-vector-service";
import { microSaaSIdeaGenerator } from "./microsaas-idea-generator";
import { setupAuth, isAuthenticated } from "./replitAuth";

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

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup Replit Auth (handles /api/login, /api/logout, /api/callback)
  await setupAuth(app);

  // Get current user route
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Idea generation route
  app.post("/api/generate-idea", isAuthenticated, async (req: any, res) => {
    try {
      const { originalIdea } = req.body;
      const userId = req.user.claims.sub; // Get userId from Replit Auth token

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
  app.get("/api/ideas", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const ideas = await storage.getIdeasByUser(userId);
      
      // Add isKeyword flag to each idea (check if similarity >= 95%)
      const ideasWithKeywordFlag = await Promise.all(
        ideas.map(async (idea) => ({
          ...idea,
          isKeyword: await keywordVectorService.isKeyword(idea.generatedIdea, 0.95)
        }))
      );
      
      res.json(ideasWithKeywordFlag);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ideas" });
    }
  });

  // Delete an idea
  app.delete("/api/ideas/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const idea = await storage.getIdea(id);

      if (!idea) {
        return res.status(404).json({ message: "Idea not found" });
      }

      if (idea.userId !== userId) {
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
  app.post("/api/generate-report", isAuthenticated, async (req: any, res) => {
    try {
      const { ideaId, keywordCount = 10 } = req.body;
      const userId = req.user.claims.sub;

      // Validate keywordCount
      const validatedCount = Math.max(1, Math.min(100, parseInt(keywordCount) || 10));

      const idea = await storage.getIdea(ideaId);
      if (!idea) {
        return res.status(404).json({ message: "Idea not found" });
      }

      if (idea.userId !== userId) {
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
        userId,
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
