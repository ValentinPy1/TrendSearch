import { eq, desc, inArray } from "drizzle-orm";
import { db } from "./db-sqlite";
import {
    users, ideas, reports, keywords,
    type User, type InsertUser,
    type Idea, type InsertIdea,
    type Report, type InsertReport,
    type Keyword, type InsertKeyword,
    type IdeaWithReport
} from "@shared/schema-sqlite";

export interface IStorage {
    // User methods
    getUser(id: string): Promise<User | undefined>;
    getUserByEmail(email: string): Promise<User | undefined>;
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

        // Extract report IDs for batch keyword fetching
        const reportIds = ideasWithReportsData
            .map(row => row.report?.id)
            .filter((id): id is string => id != null); // Filters out both null and undefined

        // Query 2: Batch fetch all keywords for all reports at once
        const allKeywords = reportIds.length > 0
            ? await db.select().from(keywords).where(inArray(keywords.reportId, reportIds))
            : [];

        // Group keywords by reportId for efficient lookup
        const keywordsByReportId = new Map<string, Keyword[]>();
        allKeywords.forEach(keyword => {
            const list = keywordsByReportId.get(keyword.reportId) || [];
            list.push(keyword);
            keywordsByReportId.set(keyword.reportId, list);
        });

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
        return await db.select().from(keywords).where(eq(keywords.reportId, reportId));
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
