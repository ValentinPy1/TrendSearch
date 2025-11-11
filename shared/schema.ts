import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, decimal, boolean, customType } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Define custom vector type for pgvector
const vector = customType<{ data: number[]; driverData: string }>({
    dataType: () => 'vector(384)',
    toDriver: (value: number[]): string => {
        return `[${value.join(',')}]`;
    },
    fromDriver: (value: string): number[] => {
        // Parse vector string like "[1,2,3]" to array
        return JSON.parse(value);
    },
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  supabaseUserId: text("supabase_user_id").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  // One-time payment fields
  hasPaid: boolean("has_paid").default(false).notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  paymentDate: timestamp("payment_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ideas = pgTable("ideas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  originalIdea: text("original_idea"),
  generatedIdea: text("generated_idea").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ideaId: varchar("idea_id").notNull().references(() => ideas.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Aggregated metrics
  avgVolume: integer("avg_volume"),
  growth3m: decimal("growth_3m", { precision: 10, scale: 2 }),
  growthYoy: decimal("growth_yoy", { precision: 10, scale: 2 }),
  competition: text("competition"), // low, medium, high
  avgTopPageBid: decimal("avg_top_page_bid", { precision: 10, scale: 2 }),
  avgCpc: decimal("avg_cpc", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const keywords = pgTable("keywords", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: varchar("report_id").notNull().references(() => reports.id, { onDelete: 'cascade' }),
  keyword: text("keyword").notNull(),
  volume: integer("volume"),
  competition: integer("competition"),
  cpc: decimal("cpc", { precision: 10, scale: 2 }),
  topPageBid: decimal("top_page_bid", { precision: 10, scale: 2 }),
  growth3m: decimal("growth_3m", { precision: 10, scale: 2 }),
  growthYoy: decimal("growth_yoy", { precision: 10, scale: 2 }),
  similarityScore: decimal("similarity_score", { precision: 5, scale: 4 }),
  // Additional growth metrics from dataset
  growthSlope: decimal("growth_slope", { precision: 10, scale: 2 }),
  growthR2: decimal("growth_r2", { precision: 10, scale: 4 }),
  growthConsistency: decimal("growth_consistency", { precision: 10, scale: 4 }),
  growthStability: decimal("growth_stability", { precision: 10, scale: 4 }),
  sustainedGrowthScore: decimal("sustained_growth_score", { precision: 10, scale: 4 }),
  // New derived metrics
  volatility: decimal("volatility", { precision: 10, scale: 4 }),
  trendStrength: decimal("trend_strength", { precision: 10, scale: 4 }),
  bidEfficiency: decimal("bid_efficiency", { precision: 10, scale: 4 }),
  tac: decimal("tac", { precision: 15, scale: 2 }),
  sac: decimal("sac", { precision: 15, scale: 2 }),
  // Opportunity Score (comprehensive metric using new formula)
  opportunityScore: decimal("opportunity_score", { precision: 10, scale: 4 }),
  // Monthly search volume data (12 months)
  monthlyData: jsonb("monthly_data").$type<{ month: string; volume: number }[]>(),
});

export interface KeywordGenerationProgress {
  currentStage: string; // 'calling-api' | 'fetching-dataforseo' | 'computing-metrics' | 'generating-report' | 'complete' | 'generating-seeds' | 'generating-keywords' (legacy)
  stage: string; // Legacy field for backward compatibility
  seedsGenerated: number; // Legacy field
  keywordsGenerated: number; // Legacy field
  duplicatesFound: number; // Legacy field
  existingKeywordsFound: number; // Legacy field
  newKeywordsCollected: number;
  queryKeywords?: string[]; // Query keywords used for keywords_for_keywords API (1-20 keywords)
  seeds?: string[]; // Legacy field
  allKeywords?: string[]; // Legacy field
  duplicates?: string[]; // Legacy field
  existingKeywords?: string[]; // Legacy field
  newKeywords?: string[]; // Final list of new keywords
  completedAt?: string; // ISO timestamp
  // New fields for full pipeline tracking
  dataForSEOFetched?: boolean; // Flag to track if DataForSEO fetch completed
  metricsComputed?: boolean; // Flag to track if metrics computation completed
  reportGenerated?: boolean; // Flag to track if report generation completed
  keywordsFetchedCount?: number; // Number of keywords fetched from DataForSEO
  metricsProcessedCount?: number; // Number of keywords with metrics computed
  taskId?: string; // DataForSEO task ID for resuming interrupted tasks
  dataForSEOResults?: Array<{
    keyword: string;
    spell: string | null;
    location_code: number;
    language_code: string;
    search_partners: boolean;
    competition: string | null;
    competition_index: number | null;
    search_volume: number | null;
    low_top_of_page_bid: number | null;
    high_top_of_page_bid: number | null;
    cpc: number | null;
    monthly_searches: Array<{ year: number; month: number; search_volume: number }>;
  }>; // Full DataForSEO API response from keywords_for_keywords
  dataForSEOSiteResults?: Array<{
    keyword: string;
    spell: string | null;
    location_code: number;
    language_code: string;
    search_partners: boolean;
    competition: string | null;
    competition_index: number | null;
    search_volume: number | null;
    low_top_of_page_bid: number | null;
    high_top_of_page_bid: number | null;
    cpc: number | null;
    monthly_searches: Array<{ year: number; month: number; search_volume: number }>;
  }>; // Full DataForSEO API response from keywords_for_site
  target?: string; // Website URL/domain used for keywords_for_site API (e.g., "dataforseo.com")
  // Fields for accurate resume (legacy)
  processedSeeds?: string[]; // Track which seeds were processed (legacy)
  seedSimilarities?: Record<string, number>; // Persist similarity scores (legacy)
}

export const customSearchProjects = pgTable("custom_search_projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text("name"),
  pitch: text("pitch"),
  topics: jsonb("topics").$type<string[]>().default([]),
  personas: jsonb("personas").$type<string[]>().default([]),
  painPoints: jsonb("pain_points").$type<string[]>().default([]),
  features: jsonb("features").$type<string[]>().default([]),
  competitors: jsonb("competitors").$type<Array<{ name: string; description: string; url?: string | null }>>().default([]),
  keywordGenerationProgress: jsonb("keyword_generation_progress").$type<KeywordGenerationProgress | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const globalKeywords = pgTable("global_keywords", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  keyword: text("keyword").notNull(),
  volume: integer("volume"),
  competition: integer("competition"),
  cpc: decimal("cpc", { precision: 10, scale: 2 }),
  topPageBid: decimal("top_page_bid", { precision: 10, scale: 2 }),
  growth3m: decimal("growth_3m", { precision: 10, scale: 2 }),
  growthYoy: decimal("growth_yoy", { precision: 10, scale: 2 }),
  similarityScore: decimal("similarity_score", { precision: 5, scale: 4 }),
  // Additional growth metrics
  growthSlope: decimal("growth_slope", { precision: 10, scale: 2 }),
  growthR2: decimal("growth_r2", { precision: 10, scale: 4 }),
  growthConsistency: decimal("growth_consistency", { precision: 10, scale: 4 }),
  growthStability: decimal("growth_stability", { precision: 10, scale: 4 }),
  sustainedGrowthScore: decimal("sustained_growth_score", { precision: 10, scale: 4 }),
  // Derived metrics
  volatility: decimal("volatility", { precision: 10, scale: 4 }),
  trendStrength: decimal("trend_strength", { precision: 10, scale: 4 }),
  bidEfficiency: decimal("bid_efficiency", { precision: 10, scale: 4 }),
  tac: decimal("tac", { precision: 15, scale: 2 }),
  sac: decimal("sac", { precision: 15, scale: 2 }),
  opportunityScore: decimal("opportunity_score", { precision: 10, scale: 4 }),
  // Monthly search volume data (48 months)
  monthlyData: jsonb("monthly_data").$type<{ month: string; volume: number }[]>(),
  source: text("source"), // "dataforseo", "vector_db", etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const customSearchProjectKeywords = pgTable("custom_search_project_keywords", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customSearchProjectId: varchar("custom_search_project_id").notNull().references(() => customSearchProjects.id, { onDelete: 'cascade' }),
  globalKeywordId: varchar("global_keyword_id").notNull().references(() => globalKeywords.id, { onDelete: 'cascade' }),
  similarityScore: decimal("similarity_score", { precision: 5, scale: 4 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Keyword embeddings table with vector support (using customType for vector)
export const keywordEmbeddings = pgTable("keyword_embeddings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  keyword: text("keyword").notNull(),
  // Use customType for vector type since drizzle doesn't natively support it
  embedding: vector("embedding").notNull(),
  searchVolume: integer("search_volume"),
  competition: integer("competition"),
  lowTopOfPageBid: decimal("low_top_of_page_bid", { precision: 10, scale: 2 }),
  highTopOfPageBid: decimal("high_top_of_page_bid", { precision: 10, scale: 2 }),
  cpc: decimal("cpc", { precision: 10, scale: 2 }),
  monthlyData: jsonb("monthly_data").$type<{ month: string; volume: number }[]>(),
  growth3m: decimal("growth_3m", { precision: 10, scale: 2 }),
  growthYoy: decimal("growth_yoy", { precision: 10, scale: 2 }),
  volatility: decimal("volatility", { precision: 10, scale: 4 }),
  trendStrength: decimal("trend_strength", { precision: 10, scale: 4 }),
  avgTopPageBid: decimal("avg_top_page_bid", { precision: 10, scale: 2 }),
  bidEfficiency: decimal("bid_efficiency", { precision: 10, scale: 4 }),
  tac: decimal("tac", { precision: 15, scale: 2 }),
  sac: decimal("sac", { precision: 15, scale: 2 }),
  opportunityScore: decimal("opportunity_score", { precision: 10, scale: 4 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  hasPaid: true,
  stripeCustomerId: true,
  stripePaymentIntentId: true,
  paymentDate: true,
}).extend({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  supabaseUserId: z.string().min(1, "Supabase user ID is required"),
});

export const insertIdeaSchema = createInsertSchema(ideas).omit({
  id: true,
  createdAt: true,
});

export const insertReportSchema = createInsertSchema(reports).omit({
  id: true,
  createdAt: true,
});

export const insertKeywordSchema = createInsertSchema(keywords).omit({
  id: true,
});

export const insertCustomSearchProjectSchema = createInsertSchema(customSearchProjects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  topics: z.array(z.string()).default([]),
  personas: z.array(z.string()).default([]),
  painPoints: z.array(z.string()).default([]),
  features: z.array(z.string()).default([]),
  competitors: z.array(z.object({
    name: z.string(),
    description: z.string(),
    url: z.string().nullable().optional(),
  })).default([]),
});

export const insertGlobalKeywordSchema = createInsertSchema(globalKeywords).omit({
  id: true,
  createdAt: true,
});

export const insertCustomSearchProjectKeywordSchema = createInsertSchema(customSearchProjectKeywords).omit({
  id: true,
  createdAt: true,
});

export const insertKeywordEmbeddingSchema = createInsertSchema(keywordEmbeddings).omit({
  id: true,
  createdAt: true,
});

// Select types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Idea = typeof ideas.$inferSelect;
export type InsertIdea = z.infer<typeof insertIdeaSchema>;

export type Report = typeof reports.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;

export type Keyword = typeof keywords.$inferSelect;
export type InsertKeyword = z.infer<typeof insertKeywordSchema>;

export type CustomSearchProject = typeof customSearchProjects.$inferSelect;
export type InsertCustomSearchProject = z.infer<typeof insertCustomSearchProjectSchema>;

export type GlobalKeyword = typeof globalKeywords.$inferSelect;
export type InsertGlobalKeyword = z.infer<typeof insertGlobalKeywordSchema>;

export type CustomSearchProjectKeyword = typeof customSearchProjectKeywords.$inferSelect;
export type InsertCustomSearchProjectKeyword = z.infer<typeof insertCustomSearchProjectKeywordSchema>;

export type KeywordEmbedding = typeof keywordEmbeddings.$inferSelect;
export type InsertKeywordEmbedding = z.infer<typeof insertKeywordEmbeddingSchema>;

// Combined types for frontend
export type IdeaWithReport = Idea & {
  report?: Report & {
    keywords: Keyword[];
  };
};
