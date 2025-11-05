import { keywordVectorService } from "./keyword-vector-service";
import { storage } from "./storage";

export interface KeywordCheckResult {
    existingKeywords: string[];
    newKeywords: string[];
}

/**
 * Check keywords against existing databases
 * Returns keywords that already exist and keywords that are new
 */
export async function checkKeywords(keywords: string[]): Promise<KeywordCheckResult> {
    if (keywords.length === 0) {
        return { existingKeywords: [], newKeywords: [] };
    }

    const existingKeywords: string[] = [];
    const newKeywords: string[] = [];

    // Check against vector DB service (fast path for exact matches)
    const vectorDbChecks = await Promise.all(
        keywords.map(async (keyword) => {
            const exists = await keywordVectorService.isKeyword(keyword, 0.95);
            return { keyword, exists };
        })
    );

    // Separate keywords that exist in vector DB
    const vectorDbExisting = vectorDbChecks
        .filter(check => check.exists)
        .map(check => check.keyword);

    existingKeywords.push(...vectorDbExisting);

    // Check remaining keywords against global keywords table
    const remainingKeywords = keywords.filter(kw => !vectorDbExisting.includes(kw));
    
    if (remainingKeywords.length > 0) {
        // Batch check against global keywords table
        const globalKeywords = await storage.getGlobalKeywordsByTexts(remainingKeywords);
        const globalKeywordsSet = new Set(globalKeywords.map(kw => kw.keyword.toLowerCase()));

        for (const keyword of remainingKeywords) {
            if (globalKeywordsSet.has(keyword.toLowerCase())) {
                existingKeywords.push(keyword);
            } else {
                newKeywords.push(keyword);
            }
        }
    }

    return { existingKeywords, newKeywords };
}

