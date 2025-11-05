import { eq, desc, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import {
    users, ideas, reports, keywords, customSearchProjects, globalKeywords, customSearchProjectKeywords,
    type User, type InsertUser,
    type Idea, type InsertIdea,
    type Report, type InsertReport,
    type Keyword, type InsertKeyword,
    type IdeaWithReport,
    type CustomSearchProject, type InsertCustomSearchProject,
    type GlobalKeyword, type InsertGlobalKeyword,
    type CustomSearchProjectKeyword, type InsertCustomSearchProjectKeyword
} from "@shared/schema";

export interface IStorage {
    // User methods
    getUser(id: string): Promise<User | undefined>;
    getUserByEmail(email: string): Promise<User | undefined>;
    getUserBySupabaseUserId(supabaseUserId: string): Promise<User | undefined>;
    createUser(user: InsertUser): Promise<User>;

    // Idea methods
    getIdea(id: string): Promise<Idea | undefined>;
    getIdeasByUser(userId: string): Promise<IdeaWithReport[]>;
    createIdea(idea: InsertIdea): Promise<Idea>;
    deleteIdea(id: string): Promise<void>;

    // Report methods
    getReport(id: string): Promise<Report | undefined>;
    getReportByIdeaId(ideaId: string): Promise<Report | undefined>;
    createReport(report: InsertReport): Promise<Report>;

    // Keyword methods
    getKeywordsByReportId(reportId: string): Promise<Keyword[]>;
    getKeyword(id: string): Promise<Keyword | undefined>;
    createKeyword(keyword: InsertKeyword): Promise<Keyword>;
    createKeywords(keywords: InsertKeyword[]): Promise<Keyword[]>;
    deleteKeyword(id: string): Promise<void>;

    // Custom Search Project methods
    getCustomSearchProjects(userId: string): Promise<CustomSearchProject[]>;
    getCustomSearchProject(id: string): Promise<CustomSearchProject | undefined>;
    createCustomSearchProject(project: InsertCustomSearchProject): Promise<CustomSearchProject>;
    updateCustomSearchProject(id: string, project: Partial<InsertCustomSearchProject>): Promise<CustomSearchProject>;
    deleteCustomSearchProject(id: string): Promise<void>;

    // Global Keywords methods
    getGlobalKeywordByText(keyword: string): Promise<GlobalKeyword | undefined>;
    getGlobalKeywordsByTexts(keywords: string[]): Promise<GlobalKeyword[]>;
    createGlobalKeywords(keywords: InsertGlobalKeyword[]): Promise<GlobalKeyword[]>;
    linkKeywordsToProject(projectId: string, keywordIds: string[], similarityScores: number[]): Promise<void>;

    // Health check
    healthCheck(): Promise<{ connected: boolean; tablesExist: boolean }>;
}

export class DatabaseStorage implements IStorage {
    async getUser(id: string): Promise<User | undefined> {
        const result = await db.select().from(users).where(eq(users.id, id));
        return result[0];
    }

    async getUserByEmail(email: string): Promise<User | undefined> {
        const result = await db.select().from(users).where(eq(users.email, email));
        return result[0];
    }

    async getUserBySupabaseUserId(supabaseUserId: string): Promise<User | undefined> {
        const result = await db.select().from(users).where(eq(users.supabaseUserId, supabaseUserId));
        return result[0];
    }

    async createUser(insertUser: InsertUser): Promise<User> {
        const result = await db.insert(users).values(insertUser).returning();
        return result[0];
    }

    async getIdea(id: string): Promise<Idea | undefined> {
        const result = await db.select().from(ideas).where(eq(ideas.id, id));
        return result[0];
    }

    async getIdeasByUser(userId: string): Promise<IdeaWithReport[]> {
        // OPTIMIZED: Use joins to fetch all data in 2 queries instead of N+1

        // Query 1: Get all ideas with their reports in a single query using LEFT JOIN
        const ideasWithReportsData = await db
            .select({
                idea: ideas,
                report: reports,
            })
            .from(ideas)
            .leftJoin(reports, eq(ideas.id, reports.ideaId))
            .where(eq(ideas.userId, userId))
            .orderBy(desc(ideas.createdAt));

        // Skip loading keywords from database - always generate fresh from vector service
        // This avoids loading old incomplete data and ensures we always use the new_keywords CSV
        const keywordsByReportId = new Map<string, Keyword[]>();

        // Construct the final result structure
        const ideasWithReports: IdeaWithReport[] = ideasWithReportsData.map(({ idea, report }) => {
            if (report) {
                const keywordsList = keywordsByReportId.get(report.id) || [];
                return {
                    ...idea,
                    report: {
                        ...report,
                        keywords: keywordsList
                    }
                };
            } else {
                // Explicitly include report property as undefined for ideas without reports
                return {
                    ...idea,
                    report: undefined
                };
            }
        });

        return ideasWithReports;
    }

    async createIdea(insertIdea: InsertIdea): Promise<Idea> {
        const result = await db.insert(ideas).values(insertIdea).returning();
        return result[0];
    }

    async deleteIdea(id: string): Promise<void> {
        // Delete associated keywords first (via reports)
        const report = await this.getReportByIdeaId(id);
        if (report) {
            await db.delete(keywords).where(eq(keywords.reportId, report.id));
            await db.delete(reports).where(eq(reports.id, report.id));
        }
        // Delete the idea
        await db.delete(ideas).where(eq(ideas.id, id));
    }

    async getReport(id: string): Promise<Report | undefined> {
        const result = await db.select().from(reports).where(eq(reports.id, id));
        return result[0];
    }

    async getReportByIdeaId(ideaId: string): Promise<Report | undefined> {
        const result = await db.select().from(reports).where(eq(reports.ideaId, ideaId));
        return result[0];
    }

    async createReport(insertReport: InsertReport): Promise<Report> {
        const result = await db.insert(reports).values(insertReport).returning();
        return result[0];
    }

    async getKeywordsByReportId(reportId: string): Promise<Keyword[]> {
        const allKeywords = await db.select().from(keywords).where(eq(keywords.reportId, reportId));
        // Filter out keywords with incomplete data (less than 48 months)
        const filteredKeywords = allKeywords.filter(keyword => {
            if (!keyword.monthlyData) {
                console.warn(`[Storage] Keyword ${keyword.id} has no monthlyData`);
                return false;
            }
            if (!Array.isArray(keyword.monthlyData)) {
                console.warn(`[Storage] Keyword ${keyword.id} monthlyData is not an array:`, typeof keyword.monthlyData);
                return false;
            }
            if (keyword.monthlyData.length < 47) {
                console.warn(`[Storage] Keyword ${keyword.id} has only ${keyword.monthlyData.length} months of data (expected 47)`);
                return false;
            }
            return true;
        });
        
        if (allKeywords.length > 0 && filteredKeywords.length === 0) {
            console.warn(`[Storage] All ${allKeywords.length} keywords were filtered out for report ${reportId}`);
        }
        
        return filteredKeywords;
    }

    async getKeyword(id: string): Promise<Keyword | undefined> {
        const result = await db.select().from(keywords).where(eq(keywords.id, id));
        return result[0];
    }

    async createKeyword(insertKeyword: InsertKeyword): Promise<Keyword> {
        const result = await db.insert(keywords).values(insertKeyword as any).returning();
        return result[0];
    }

    async createKeywords(insertKeywords: InsertKeyword[]): Promise<Keyword[]> {
        if (insertKeywords.length === 0) return [];
        const result = await db.insert(keywords).values(insertKeywords as any).returning();
        return result;
    }

    async deleteKeyword(id: string): Promise<void> {
        await db.delete(keywords).where(eq(keywords.id, id));
    }

    async getCustomSearchProjects(userId: string): Promise<CustomSearchProject[]> {
        const result = await db
            .select()
            .from(customSearchProjects)
            .where(eq(customSearchProjects.userId, userId))
            .orderBy(desc(customSearchProjects.updatedAt));
        return result;
    }

    async getCustomSearchProject(id: string): Promise<CustomSearchProject | undefined> {
        const result = await db
            .select()
            .from(customSearchProjects)
            .where(eq(customSearchProjects.id, id));
        return result[0];
    }

    async createCustomSearchProject(insertProject: InsertCustomSearchProject): Promise<CustomSearchProject> {
        const result = await db.insert(customSearchProjects).values(insertProject).returning();
        return result[0];
    }

    async updateCustomSearchProject(id: string, updateData: Partial<InsertCustomSearchProject>): Promise<CustomSearchProject> {
        const result = await db
            .update(customSearchProjects)
            .set({
                ...updateData,
                updatedAt: sql`now()`,
            })
            .where(eq(customSearchProjects.id, id))
            .returning();
        return result[0];
    }

    async deleteCustomSearchProject(id: string): Promise<void> {
        await db.delete(customSearchProjects).where(eq(customSearchProjects.id, id));
    }

    async getGlobalKeywordByText(keywordText: string): Promise<GlobalKeyword | undefined> {
        // Case-insensitive lookup using LOWER()
        const result = await db
            .select()
            .from(globalKeywords)
            .where(sql`LOWER(${globalKeywords.keyword}) = LOWER(${keywordText})`)
            .limit(1);
        return result[0];
    }

    async getGlobalKeywordsByTexts(keywordTexts: string[]): Promise<GlobalKeyword[]> {
        if (keywordTexts.length === 0) return [];
        // Case-insensitive lookup for multiple keywords
        // For now, we'll fetch all and filter (can be optimized later with raw SQL)
        // This is acceptable for the initial implementation since global keywords table will start small
        const allKeywords = await db.select().from(globalKeywords);
        const lowerKeywords = new Set(keywordTexts.map(kw => kw.toLowerCase()));
        return allKeywords.filter(kw => lowerKeywords.has(kw.keyword.toLowerCase()));
    }

    async createGlobalKeywords(insertKeywords: InsertGlobalKeyword[]): Promise<GlobalKeyword[]> {
        if (insertKeywords.length === 0) return [];
        // Filter out keywords that already exist (case-insensitive)
        const keywordTexts = insertKeywords.map(kw => kw.keyword);
        const existingKeywords = await this.getGlobalKeywordsByTexts(keywordTexts);
        const existingKeywordsSet = new Set(existingKeywords.map(kw => kw.keyword.toLowerCase()));
        
        const newKeywords = insertKeywords.filter(kw => !existingKeywordsSet.has(kw.keyword.toLowerCase()));
        
        if (newKeywords.length === 0) return [];
        
        // Insert only new keywords
        const result = await db
            .insert(globalKeywords)
            .values(newKeywords as any)
            .returning();
        return result;
    }

    async linkKeywordsToProject(projectId: string, keywordIds: string[], similarityScores: number[]): Promise<void> {
        if (keywordIds.length === 0) return;
        if (keywordIds.length !== similarityScores.length) {
            throw new Error("keywordIds and similarityScores arrays must have the same length");
        }

        const links: InsertCustomSearchProjectKeyword[] = keywordIds.map((keywordId, index) => ({
            customSearchProjectId: projectId,
            globalKeywordId: keywordId,
            similarityScore: similarityScores[index] ? similarityScores[index].toString() : null,
        }));

        await db.insert(customSearchProjectKeywords).values(links as any);
    }

    async healthCheck(): Promise<{ connected: boolean; tablesExist: boolean }> {
        try {
            // Try to query the users table to verify database connectivity and schema
            await db.select().from(users).limit(1);
            return { connected: true, tablesExist: true };
        } catch (error) {
            console.error("Health check failed:", error);
            return {
                connected: false,
                tablesExist: false
            };
        }
    }
}

export const storage = new DatabaseStorage();
