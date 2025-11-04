import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, decimal, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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

// Select types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Idea = typeof ideas.$inferSelect;
export type InsertIdea = z.infer<typeof insertIdeaSchema>;

export type Report = typeof reports.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;

export type Keyword = typeof keywords.$inferSelect;
export type InsertKeyword = z.infer<typeof insertKeywordSchema>;

// Combined types for frontend
export type IdeaWithReport = Idea & {
  report?: Report & {
    keywords: Keyword[];
  };
};
