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
    log(`[KeywordChecker] Starting checkKeywords for ${keywords.length} keywords at ${new Date().toISOString()}`);
    
    if (keywords.length === 0) {
        log(`[KeywordChecker] No keywords to check, returning empty result`);
        return { existingKeywords: [], newKeywords: [] };
    }

    const existingKeywords: string[] = [];
    const newKeywords: string[] = [];

    // Check against vector DB service (fast path for exact matches)
    log(`[KeywordChecker] Checking ${keywords.length} keywords against vector DB`);
    const vectorDbStartTime = Date.now();
    
    // Helper function for retry with exponential backoff
    const retryWithBackoff = async <T>(
        fn: () => Promise<T>,
        maxRetries: number = 2,
        initialDelay: number = 1000
    ): Promise<T> => {
        let lastError: Error | undefined;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (attempt < maxRetries) {
                    const delay = initialDelay * Math.pow(2, attempt);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        throw lastError || new Error("Retry failed");
    };

    const vectorDbChecks = await Promise.all(
        keywords.map(async (keyword, index) => {
            const keywordStartTime = Date.now();
            try {
                log(`[KeywordChecker] Checking keyword ${index + 1}/${keywords.length} in vector DB: "${keyword}"`);
                // Use exactMatchOnly=true for keyword generation - we don't need fuzzy matching
                // This skips the expensive similarity search (7-10 seconds per non-existing keyword)
                // Add retry logic for resilience
                const exists = await retryWithBackoff(
                    () => keywordVectorService.isKeyword(keyword, 0.95, true),
                    2,
                    1000
                );
                const keywordDuration = Date.now() - keywordStartTime;
                log(`[KeywordChecker] Vector DB check for "${keyword}" completed in ${keywordDuration}ms, exists=${exists}`);
                return { keyword, exists };
            } catch (error) {
                const keywordDuration = Date.now() - keywordStartTime;
                logError(`[KeywordChecker] Vector DB check failed for "${keyword}" after ${keywordDuration}ms after retries:`, error);
                // Treat as not existing if check fails after retries
                return { keyword, exists: false };
            }
        })
    );
    
    const vectorDbDuration = Date.now() - vectorDbStartTime;
    log(`[KeywordChecker] Vector DB checks completed in ${vectorDbDuration}ms for ${keywords.length} keywords`);

    // Separate keywords that exist in vector DB
    const vectorDbExisting = vectorDbChecks
        .filter(check => check.exists)
        .map(check => check.keyword);

    log(`[KeywordChecker] Found ${vectorDbExisting.length} keywords in vector DB`);
    existingKeywords.push(...vectorDbExisting);

    // Check remaining keywords against global keywords table
    const remainingKeywords = keywords.filter(kw => !vectorDbExisting.includes(kw));
    log(`[KeywordChecker] ${remainingKeywords.length} keywords remaining to check in global DB`);
    
    if (remainingKeywords.length > 0) {
        // Batch check against global keywords table
        log(`[KeywordChecker] Checking ${remainingKeywords.length} keywords against global keywords table`);
        const globalDbStartTime = Date.now();
        
        const globalKeywords = await storage.getGlobalKeywordsByTexts(remainingKeywords);
        const globalDbDuration = Date.now() - globalDbStartTime;
        log(`[KeywordChecker] Global DB check completed in ${globalDbDuration}ms, found ${globalKeywords.length} existing keywords`);
        
        const globalKeywordsSet = new Set(globalKeywords.map(kw => kw.keyword.toLowerCase()));

        for (const keyword of remainingKeywords) {
            if (globalKeywordsSet.has(keyword.toLowerCase())) {
                existingKeywords.push(keyword);
            } else {
                newKeywords.push(keyword);
            }
        }
        
        log(`[KeywordChecker] Global DB check: ${existingKeywords.length - vectorDbExisting.length} existing, ${newKeywords.length} new`);
    }

    const totalDuration = Date.now() - checkStartTime;
    log(`[KeywordChecker] checkKeywords completed in ${totalDuration}ms: ${existingKeywords.length} existing, ${newKeywords.length} new`);
    
    return { existingKeywords, newKeywords };
}

