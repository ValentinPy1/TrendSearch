import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable("users", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull().unique(),
    password: text("password").notNull(),
    createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

export const ideas = sqliteTable("ideas", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
    originalIdea: text("original_idea"),
    generatedIdea: text("generated_idea").notNull(),
    createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

export const reports = sqliteTable("reports", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    ideaId: text("idea_id").notNull().references(() => ideas.id, { onDelete: 'cascade' }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
    // Aggregated metrics
    avgVolume: integer("avg_volume"),
    growth3m: real("growth_3m"),
    growthYoy: real("growth_yoy"),
    competition: text("competition"), // low, medium, high
    avgTopPageBid: real("avg_top_page_bid"),
    avgCpc: real("avg_cpc"),
    createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

export const keywords = sqliteTable("keywords", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    reportId: text("report_id").notNull().references(() => reports.id, { onDelete: 'cascade' }),
    keyword: text("keyword").notNull(),
    volume: integer("volume"),
    competition: integer("competition"),
    cpc: real("cpc"),
    topPageBid: real("top_page_bid"),
    growth3m: real("growth_3m"),
    growthYoy: real("growth_yoy"),
    similarityScore: real("similarity_score"),
    // Additional growth metrics from dataset
    growthSlope: real("growth_slope"),
    growthR2: real("growth_r2"),
    growthConsistency: real("growth_consistency"),
    growthStability: real("growth_stability"),
    sustainedGrowthScore: real("sustained_growth_score"),
    // New derived metrics
    volatility: real("volatility"),
    trendStrength: real("trend_strength"),
    bidEfficiency: real("bid_efficiency"),
    tac: real("tac"),
    sac: real("sac"),
    // Opportunity Score (comprehensive metric using new formula)
    opportunityScore: real("opportunity_score"),
    // Monthly search volume data (12 months) - stored as JSON string
    monthlyData: text("monthly_data", { mode: 'json' }).$type<{ month: string; volume: number }[]>(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
    id: true,
    createdAt: true,
}).extend({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
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
export type LoginUser = z.infer<typeof loginSchema>;

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
