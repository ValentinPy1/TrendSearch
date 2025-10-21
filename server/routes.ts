import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { insertUserSchema } from "@shared/schema";
import bcrypt from "bcryptjs";
import { keywordVectorService } from "./keyword-vector-service";

// Stupidity Mixer data
const PERSONAS = [
  "Busy professionals",
  "Tech-savvy millennials", 
  "Remote workers",
  "Small business owners",
  "Freelancers",
  "Students",
  "Parents",
  "Fitness enthusiasts"
];

const PROBLEMS = [
  "who struggle with time management",
  "who can't track their expenses",
  "who need better collaboration tools",
  "who want to automate repetitive tasks",
  "who find it hard to stay organized",
  "who need to learn new skills quickly",
  "who want personalized recommendations",
  "who struggle with data privacy"
];

const DELIVERY_TYPES = [
  "AI-powered",
  "Mobile-first",
  "Voice-assisted",
  "Blockchain-based",
  "Subscription-based",
  "Community-driven",
  "Gamified",
  "Real-time"
];

const APP_INSPIRATIONS = [
  "marketplace",
  "dashboard",
  "social network",
  "skill-connecting platform",
  "analytics tool",
  "scheduling assistant",
  "content creator",
  "comparison engine"
];

function generateStupidityMixerIdeas(): string[] {
  const ideas: string[] = [];
  for (let i = 0; i < 5; i++) {
    const persona = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
    const problem = PROBLEMS[Math.floor(Math.random() * PROBLEMS.length)];
    const delivery = DELIVERY_TYPES[Math.floor(Math.random() * DELIVERY_TYPES.length)];
    const app = APP_INSPIRATIONS[Math.floor(Math.random() * APP_INSPIRATIONS.length)];
    
    ideas.push(`${delivery} ${app} for ${persona} ${problem}`);
  }
  return ideas;
}

function llmFormulator(ideas: string[]): string {
  // In production, this would call an actual LLM
  // For now, we select the first idea and clean it up
  const selectedIdea = ideas[0];
  return selectedIdea.charAt(0).toUpperCase() + selectedIdea.slice(1);
}

async function getKeywordsFromVectorDB(idea: string) {
  // Use vector similarity search to find most relevant keywords
  const similarKeywords = await keywordVectorService.findSimilarKeywords(idea, 10);
  
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const keywords = similarKeywords.map(kw => {
    // Convert monthly data from CSV format to our format
    const monthlyData = months.map((month, idx) => {
      const monthKey = ['2024_10', '2024_11', '2024_12', '2025_01', '2025_02', '2025_03', '2025_04', '2025_05', '2025_06', '2025_07', '2025_08', '2025_09'][idx];
      return {
        month,
        volume: Math.floor(kw[monthKey as keyof typeof kw] as number || kw.search_volume || 0)
      };
    });

    return {
      keyword: kw.keyword,
      volume: Math.floor(kw.search_volume || 0),
      competition: Math.floor(kw.competition || 0),
      cpc: (kw.cpc || 0).toFixed(2),
      topPageBid: (kw.high_top_of_page_bid || kw.low_top_of_page_bid || 0).toFixed(2),
      growth3m: (kw['3month_trend_%'] || 0).toFixed(2),
      growthYoy: (kw['yoy_trend_%'] || 0).toFixed(2),
      similarityScore: kw.similarityScore.toFixed(4),
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

      // Stupidity Mixer generates 5 candidate ideas
      const candidateIdeas = generateStupidityMixerIdeas();
      
      // LLM Formulator selects and reformulates the best idea
      const generatedIdea = llmFormulator(candidateIdeas);

      const idea = await storage.createIdea({
        userId,
        originalIdea: originalIdea || null,
        generatedIdea,
      });

      res.json({ idea });
    } catch (error) {
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
      const { ideaId } = req.body;

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
      const { keywords: keywordData, aggregates } = await getKeywordsFromVectorDB(idea.generatedIdea);

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
        monthlyData: kw.monthlyData,
      }));
      
      const keywords = await storage.createKeywords(keywordsToInsert);

      res.json({ report, keywords });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
