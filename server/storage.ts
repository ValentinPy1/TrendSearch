import { eq, desc, inArray, sql, or, and } from "drizzle-orm";
import { db } from "./db";
import {
    users, ideas, reports, keywords, customSearchProjects, globalKeywords, customSearchProjectKeywords, pipelineExecutions, feedback,
    type User, type InsertUser,
    type Idea, type InsertIdea,
    type Report, type InsertReport,
    type Keyword, type InsertKeyword,
    type IdeaWithReport,
    type CustomSearchProject, type InsertCustomSearchProject,
    type GlobalKeyword, type InsertGlobalKeyword,
    type CustomSearchProjectKeyword, type InsertCustomSearchProjectKeyword,
    type KeywordGenerationProgress,
    type PipelineExecution, type InsertPipelineExecution,
    type Feedback, type InsertFeedback
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
    getCustomSearchProjectsPaginated(userId: string, page: number, limit: number): Promise<{ projects: CustomSearchProject[]; total: number }>;
    getCustomSearchProject(id: string): Promise<CustomSearchProject | undefined>;
    createCustomSearchProject(project: InsertCustomSearchProject): Promise<CustomSearchProject>;
    updateCustomSearchProject(id: string, project: Partial<InsertCustomSearchProject>): Promise<CustomSearchProject>;
    deleteCustomSearchProject(id: string): Promise<void>;

    // Global Keywords methods
    getGlobalKeywordByText(keyword: string): Promise<GlobalKeyword | undefined>;
    getGlobalKeywordsByTexts(keywords: string[]): Promise<GlobalKeyword[]>;
    createGlobalKeywords(keywords: InsertGlobalKeyword[]): Promise<GlobalKeyword[]>;
    linkKeywordsToProject(projectId: string, keywordIds: string[], similarityScores: number[], sourceWebsites?: string[]): Promise<void>;
    getProjectKeywords(projectId: string): Promise<Array<GlobalKeyword & { sourceWebsites: string[] }>>;
    getProjectKeywordCounts(projectIds: string[]): Promise<Map<string, number>>;
    updateKeywordLinkSourceWebsites(projectId: string, keywordId: string, sourceWebsites: string[]): Promise<void>;
    updateKeywordMetrics(keywordId: string, metrics: Partial<GlobalKeyword>): Promise<void>;
    bulkUpdateKeywordMetrics(updates: Array<{ keywordId: string; metrics: Partial<GlobalKeyword> }>): Promise<void>;

    // Keyword Generation Progress methods
    saveKeywordGenerationProgress(projectId: string, progress: KeywordGenerationProgress): Promise<void>;

    // Pipeline execution methods
    createPipelineExecution(execution: InsertPipelineExecution): Promise<PipelineExecution>;
    getPipelineExecution(id: string): Promise<PipelineExecution | undefined>;
    getPipelineExecutionsByProject(projectId: string, status?: string): Promise<PipelineExecution[]>;
    getPipelineExecutionByWebsiteMonth(projectId: string, normalizedWebsite: string, year: number, month: number): Promise<PipelineExecution | undefined>;
    updatePipelineExecution(id: string, update: Partial<PipelineExecution>): Promise<PipelineExecution>;
    getQueriedWebsites(projectId: string): Promise<string[]>; // Derived from completed pipeline states

    // Credit management methods
    deductCredits(userId: string, amount: number): Promise<User>;
    getUserCredits(userId: string): Promise<number>;
    addCredits(userId: string, amount: number): Promise<User>;

    // Feedback methods
    createFeedback(feedback: InsertFeedback): Promise<Feedback>;

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
        const result = await db.insert(users).values({
            ...insertUser,
            credits: 3, // Give 5 credits by default on account creation
        } as typeof users.$inferInsert).returning();
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

    async getCustomSearchProjectsPaginated(userId: string, page: number, limit: number): Promise<{ projects: CustomSearchProject[]; total: number }> {
        const offset = (page - 1) * limit;

        // Split into two queries for better performance:
        // 1. Fast COUNT query (uses index, doesn't need to fetch data)
        // 2. Fast SELECT query with LIMIT (only fetches what we need)
        // This is faster than window function which scans all rows

        // Run queries in parallel for better performance
        const queryStartTime = Date.now();
        const [totalResult, projects] = await Promise.all([
            db
                .select({ count: sql<number>`count(*)::int` })
                .from(customSearchProjects)
                .where(eq(customSearchProjects.userId, userId)),
            db
                .select()
                .from(customSearchProjects)
                .where(eq(customSearchProjects.userId, userId))
                .orderBy(desc(customSearchProjects.updatedAt))
                .limit(limit)
                .offset(offset)
        ]);
        const queryTime = Date.now() - queryStartTime;

        console.log(`[Storage] Both queries completed in parallel: ${queryTime}ms`);

        const total = Number(totalResult[0]?.count || 0);

        return { projects, total };
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
        // Use SQL IN clause with case-insensitive comparison for efficient querying
        const lowerKeywords = keywordTexts.map(kw => kw.toLowerCase());
        // Use inArray with case-insensitive comparison
        // We need to use sql template to do case-insensitive comparison
        // Format array properly for PostgreSQL ANY operator
        // Create a safe array literal by properly escaping and quoting values
        const escapedKeywords = lowerKeywords.map(kw => kw.replace(/'/g, "''"));
        // Use sql template with proper array casting for PostgreSQL
        // The array needs to be properly formatted as a PostgreSQL array literal
        // Build the array literal string with proper escaping
        const arrayLiteral = `ARRAY[${escapedKeywords.map(kw => `'${kw}'`).join(',')}]::text[]`;
        return await db
            .select()
            .from(globalKeywords)
            .where(sql`LOWER(${globalKeywords.keyword}) = ANY(${sql.raw(arrayLiteral)})`);
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

    async linkKeywordsToProject(projectId: string, keywordIds: string[], similarityScores: number[], sourceWebsites?: string[]): Promise<void> {
        if (keywordIds.length === 0) return;
        if (keywordIds.length !== similarityScores.length) {
            throw new Error("keywordIds and similarityScores arrays must have the same length");
        }

        const defaultSourceWebsites = sourceWebsites || [];
        const links: InsertCustomSearchProjectKeyword[] = keywordIds.map((keywordId, index) => ({
            customSearchProjectId: projectId,
            globalKeywordId: keywordId,
            similarityScore: similarityScores[index] ? similarityScores[index].toString() : null,
            sourceWebsites: defaultSourceWebsites.length > 0 ? defaultSourceWebsites : [],
        }));

        await db.insert(customSearchProjectKeywords).values(links as any);
    }

    async getProjectKeywords(projectId: string): Promise<Array<GlobalKeyword & { sourceWebsites: string[] }>> {
        // Join customSearchProjectKeywords with globalKeywords to get all keywords for a project
        const result = await db
            .select({
                keyword: globalKeywords,
                sourceWebsites: customSearchProjectKeywords.sourceWebsites,
            })
            .from(customSearchProjectKeywords)
            .innerJoin(globalKeywords, eq(customSearchProjectKeywords.globalKeywordId, globalKeywords.id))
            .where(eq(customSearchProjectKeywords.customSearchProjectId, projectId));

        return result.map(r => ({
            ...r.keyword,
            sourceWebsites: (r.sourceWebsites as string[]) || [],
        }));
    }

    async getProjectKeywordCounts(projectIds: string[]): Promise<Map<string, number>> {
        if (projectIds.length === 0) {
            return new Map();
        }

        // Batch query to get keyword counts for multiple projects at once
        const counts = await db
            .select({
                projectId: customSearchProjectKeywords.customSearchProjectId,
                count: sql<number>`count(*)::int`,
            })
            .from(customSearchProjectKeywords)
            .where(inArray(customSearchProjectKeywords.customSearchProjectId, projectIds))
            .groupBy(customSearchProjectKeywords.customSearchProjectId);

        const countMap = new Map<string, number>();
        // Initialize all project IDs with 0
        projectIds.forEach(id => countMap.set(id, 0));
        // Update with actual counts
        counts.forEach(row => {
            countMap.set(row.projectId, Number(row.count));
        });

        return countMap;
    }

    async updateKeywordLinkSourceWebsites(projectId: string, keywordId: string, sourceWebsites: string[]): Promise<void> {
        await db
            .update(customSearchProjectKeywords)
            .set({ sourceWebsites: sourceWebsites })
            .where(
                sql`${customSearchProjectKeywords.customSearchProjectId} = ${projectId} AND ${customSearchProjectKeywords.globalKeywordId} = ${keywordId}`
            );
    }

    async updateKeywordMetrics(keywordId: string, metrics: Partial<GlobalKeyword>): Promise<void> {
        await db
            .update(globalKeywords)
            .set(metrics as any)
            .where(eq(globalKeywords.id, keywordId));
    }

    async bulkUpdateKeywordMetrics(updates: Array<{ keywordId: string; metrics: Partial<GlobalKeyword> }>): Promise<void> {
        if (updates.length === 0) return;

        // Optimize: Use sequential updates in smaller batches instead of parallel updates
        // This reduces lock contention and is faster for bulk operations
        const batchSize = 50; // Process 50 updates at a time

        for (let i = 0; i < updates.length; i += batchSize) {
            const batch = updates.slice(i, i + batchSize);

            // Use a transaction for each batch
            await db.transaction(async (tx) => {
                // Process updates sequentially within the transaction (faster than parallel for bulk)
                for (const update of batch) {
                    await tx.update(globalKeywords)
                        .set(update.metrics as any)
                        .where(eq(globalKeywords.id, update.keywordId));
                }
            });
        }
    }

    async saveKeywordGenerationProgress(projectId: string, progress: KeywordGenerationProgress): Promise<void> {
        await db
            .update(customSearchProjects)
            .set({
                keywordGenerationProgress: progress as any,
                updatedAt: sql`now()`,
            })
            .where(eq(customSearchProjects.id, projectId));
    }

    async createPipelineExecution(execution: InsertPipelineExecution): Promise<PipelineExecution> {
        const result = await db.insert(pipelineExecutions).values(execution).returning();
        return result[0];
    }

    async getPipelineExecution(id: string): Promise<PipelineExecution | undefined> {
        const result = await db.select().from(pipelineExecutions).where(eq(pipelineExecutions.id, id));
        return result[0];
    }

    async getPipelineExecutionsByProject(projectId: string, status?: string): Promise<PipelineExecution[]> {
        const conditions = [eq(pipelineExecutions.customSearchProjectId, projectId)];
        if (status) {
            conditions.push(eq(pipelineExecutions.status, status));
        }

        return await db
            .select()
            .from(pipelineExecutions)
            .where(and(...conditions))
            .orderBy(desc(pipelineExecutions.createdAt));
    }

    async getPipelineExecutionByWebsiteMonth(
        projectId: string,
        normalizedWebsite: string,
        year: number,
        month: number
    ): Promise<PipelineExecution | undefined> {
        const result = await db
            .select()
            .from(pipelineExecutions)
            .where(
                sql`${pipelineExecutions.customSearchProjectId} = ${projectId} 
                    AND ${pipelineExecutions.normalizedWebsite} = ${normalizedWebsite}
                    AND ${pipelineExecutions.year} = ${year}
                    AND ${pipelineExecutions.month} = ${month}`
            )
            .limit(1);
        return result[0];
    }

    async updatePipelineExecution(id: string, update: Partial<PipelineExecution>): Promise<PipelineExecution> {
        const result = await db
            .update(pipelineExecutions)
            .set({
                ...update,
                updatedAt: sql`now()`,
            } as any)
            .where(eq(pipelineExecutions.id, id))
            .returning();
        return result[0];
    }

    async getQueriedWebsites(projectId: string): Promise<string[]> {
        const completedExecutions = await db
            .select({
                normalizedWebsite: pipelineExecutions.normalizedWebsite,
            })
            .from(pipelineExecutions)
            .where(
                sql`${pipelineExecutions.customSearchProjectId} = ${projectId} 
                    AND ${pipelineExecutions.status} = 'complete'`
            );

        const uniqueWebsites = new Set<string>();
        completedExecutions.forEach(exec => {
            if (exec.normalizedWebsite) {
                uniqueWebsites.add(exec.normalizedWebsite);
            }
        });

        return Array.from(uniqueWebsites);
    }

    async deductCredits(userId: string, amount: number): Promise<User> {
        const result = await db
            .update(users)
            .set({ credits: sql`GREATEST(0, ${users.credits} - ${amount})` })
            .where(eq(users.id, userId))
            .returning();

        if (!result[0]) {
            throw new Error(`User ${userId} not found`);
        }

        return result[0];
    }

    async getUserCredits(userId: string): Promise<number> {
        const user = await this.getUser(userId);
        if (!user) {
            throw new Error(`User ${userId} not found`);
        }
        return user.credits ?? 0;
    }

    async addCredits(userId: string, amount: number): Promise<User> {
        const result = await db
            .update(users)
            .set({ credits: sql`${users.credits} + ${amount}` })
            .where(eq(users.id, userId))
            .returning();

        if (!result[0]) {
            throw new Error(`User ${userId} not found`);
        }

        return result[0];
    }

    async createFeedback(insertFeedback: InsertFeedback): Promise<Feedback> {
        const result = await db.insert(feedback).values(insertFeedback).returning();
        return result[0];
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
