import { eq, desc } from "drizzle-orm";
import { db } from "./db";
import { 
  users, ideas, reports, keywords,
  type User, type InsertUser,
  type Idea, type InsertIdea,
  type Report, type InsertReport,
  type Keyword, type InsertKeyword,
  type IdeaWithReport
} from "@shared/schema";

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
  createKeyword(keyword: InsertKeyword): Promise<Keyword>;
  createKeywords(keywords: InsertKeyword[]): Promise<Keyword[]>;
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
    const userIdeas = await db
      .select()
      .from(ideas)
      .where(eq(ideas.userId, userId))
      .orderBy(desc(ideas.createdAt));

    const ideasWithReports: IdeaWithReport[] = [];
    
    for (const idea of userIdeas) {
      const report = await this.getReportByIdeaId(idea.id);
      if (report) {
        const keywordsList = await this.getKeywordsByReportId(report.id);
        ideasWithReports.push({
          ...idea,
          report: {
            ...report,
            keywords: keywordsList
          }
        });
      } else {
        ideasWithReports.push(idea);
      }
    }
    
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

  async createKeyword(insertKeyword: InsertKeyword): Promise<Keyword> {
    const result = await db.insert(keywords).values(insertKeyword as any).returning();
    return result[0];
  }

  async createKeywords(insertKeywords: InsertKeyword[]): Promise<Keyword[]> {
    if (insertKeywords.length === 0) return [];
    const result = await db.insert(keywords).values(insertKeywords as any).returning();
    return result;
  }
}

export const storage = new DatabaseStorage();
