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
    const checkStartTime = Date.now();
    console.log(`[KeywordChecker] Starting checkKeywords for ${keywords.length} keywords at ${new Date().toISOString()}`);
    
    if (keywords.length === 0) {
        console.log(`[KeywordChecker] No keywords to check, returning empty result`);
        return { existingKeywords: [], newKeywords: [] };
    }

    const existingKeywords: string[] = [];
    const newKeywords: string[] = [];

    // Check against vector DB service (fast path for exact matches)
    console.log(`[KeywordChecker] Checking ${keywords.length} keywords against vector DB`);
    const vectorDbStartTime = Date.now();
    
    const vectorDbChecks = await Promise.all(
        keywords.map(async (keyword, index) => {
            const keywordStartTime = Date.now();
            try {
                console.log(`[KeywordChecker] Checking keyword ${index + 1}/${keywords.length} in vector DB: "${keyword}"`);
                // Use exactMatchOnly=true for keyword generation - we don't need fuzzy matching
                // This skips the expensive similarity search (7-10 seconds per non-existing keyword)
                const exists = await keywordVectorService.isKeyword(keyword, 0.95, true);
                const keywordDuration = Date.now() - keywordStartTime;
                console.log(`[KeywordChecker] Vector DB check for "${keyword}" completed in ${keywordDuration}ms, exists=${exists}`);
                return { keyword, exists };
            } catch (error) {
                const keywordDuration = Date.now() - keywordStartTime;
                console.error(`[KeywordChecker] Vector DB check failed for "${keyword}" after ${keywordDuration}ms:`, error);
                // Treat as not existing if check fails
                return { keyword, exists: false };
            }
        })
    );
    
    const vectorDbDuration = Date.now() - vectorDbStartTime;
    console.log(`[KeywordChecker] Vector DB checks completed in ${vectorDbDuration}ms for ${keywords.length} keywords`);

    // Separate keywords that exist in vector DB
    const vectorDbExisting = vectorDbChecks
        .filter(check => check.exists)
        .map(check => check.keyword);

    console.log(`[KeywordChecker] Found ${vectorDbExisting.length} keywords in vector DB`);
    existingKeywords.push(...vectorDbExisting);

    // Check remaining keywords against global keywords table
    const remainingKeywords = keywords.filter(kw => !vectorDbExisting.includes(kw));
    console.log(`[KeywordChecker] ${remainingKeywords.length} keywords remaining to check in global DB`);
    
    if (remainingKeywords.length > 0) {
        // Batch check against global keywords table
        console.log(`[KeywordChecker] Checking ${remainingKeywords.length} keywords against global keywords table`);
        const globalDbStartTime = Date.now();
        
        const globalKeywords = await storage.getGlobalKeywordsByTexts(remainingKeywords);
        const globalDbDuration = Date.now() - globalDbStartTime;
        console.log(`[KeywordChecker] Global DB check completed in ${globalDbDuration}ms, found ${globalKeywords.length} existing keywords`);
        
        const globalKeywordsSet = new Set(globalKeywords.map(kw => kw.keyword.toLowerCase()));

        for (const keyword of remainingKeywords) {
            if (globalKeywordsSet.has(keyword.toLowerCase())) {
                existingKeywords.push(keyword);
            } else {
                newKeywords.push(keyword);
            }
        }
        
        console.log(`[KeywordChecker] Global DB check: ${existingKeywords.length - vectorDbExisting.length} existing, ${newKeywords.length} new`);
    }

    const totalDuration = Date.now() - checkStartTime;
    console.log(`[KeywordChecker] checkKeywords completed in ${totalDuration}ms: ${existingKeywords.length} existing, ${newKeywords.length} new`);
    
    return { existingKeywords, newKeywords };
}

