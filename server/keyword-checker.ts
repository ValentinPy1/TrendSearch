import { keywordVectorService } from "./keyword-vector-service";
import { storage } from "./storage";
import { logger } from "./utils/logger";
import {
    MAX_RETRY_ATTEMPTS,
    RETRY_INITIAL_DELAY_MS,
    RETRY_MAX_DELAY_MS,
} from "./config/keyword-generation";

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
    logger.debug("Starting keyword check", { keywordCount: keywords.length, timestamp: new Date().toISOString() });

    if (keywords.length === 0) {
        logger.debug("No keywords to check, returning empty result", {});
        return { existingKeywords: [], newKeywords: [] };
    }

    const existingKeywords: string[] = [];
    const newKeywords: string[] = [];

    // Check against vector DB service (fast path for exact matches)
    const vectorDbStartTime = Date.now();

    // Helper function for retry with exponential backoff
    const retryWithBackoff = async <T>(
        fn: () => Promise<T>,
        maxRetries: number = MAX_RETRY_ATTEMPTS,
        initialDelay: number = RETRY_INITIAL_DELAY_MS,
        maxDelay: number = RETRY_MAX_DELAY_MS
    ): Promise<T> => {
        let lastError: Error | unknown;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                if (attempt < maxRetries - 1) {
                    // Ensure delay is at least 1ms to prevent negative timeout warnings
                    const delay = Math.max(1, Math.min(initialDelay * Math.pow(2, attempt), maxDelay));
                    logger.debug(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, { error: error instanceof Error ? error.message : String(error) });
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
                // Use exactMatchOnly=true for keyword generation - we don't need fuzzy matching
                // This skips the expensive similarity search (7-10 seconds per non-existing keyword)
                // Add retry logic for resilience
                const exists = await retryWithBackoff(
                    () => keywordVectorService.isKeyword(keyword, 0.95, true)
                );
                const keywordDuration = Date.now() - keywordStartTime;
                // Only log individual keyword checks at trace level (not used) to reduce noise
                // Summary will be logged once for the whole batch below
                return { keyword, exists, duration: keywordDuration };
            } catch (error) {
                const keywordDuration = Date.now() - keywordStartTime;
                logger.error("Vector DB check failed after retries", error, { keyword, duration: keywordDuration });
                // Treat as not existing if check fails after retries
                return { keyword, exists: false, duration: keywordDuration };
            }
        })
    );

    const vectorDbDuration = Date.now() - vectorDbStartTime;
    const existingCount = vectorDbChecks.filter(c => c.exists).length;
    const newCount = vectorDbChecks.filter(c => !c.exists).length;
    const avgDuration = vectorDbChecks.reduce((sum, c) => sum + (c.duration || 0), 0) / vectorDbChecks.length;

    logger.debug("Vector DB checks completed", {
        duration: vectorDbDuration,
        keywordCount: keywords.length,
        existing: existingCount,
        new: newCount,
        avgDurationPerKeyword: Math.round(avgDuration),
    });

    // Separate keywords that exist in vector DB
    const vectorDbExisting = vectorDbChecks
        .filter(check => check.exists)
        .map(check => check.keyword);

    logger.debug("Keywords found in vector DB", { count: vectorDbExisting.length });
    existingKeywords.push(...vectorDbExisting);

    // Check remaining keywords against global keywords table
    const remainingKeywords = keywords.filter(kw => !vectorDbExisting.includes(kw));
    logger.debug("Remaining keywords to check in global DB", { count: remainingKeywords.length });

    if (remainingKeywords.length > 0) {
        // Batch check against global keywords table
        const globalDbStartTime = Date.now();

        const globalKeywords = await storage.getGlobalKeywordsByTexts(remainingKeywords);
        const globalDbDuration = Date.now() - globalDbStartTime;
        logger.debug("Global DB check completed", { duration: globalDbDuration, found: globalKeywords.length });

        const globalKeywordsSet = new Set(globalKeywords.map(kw => kw.keyword.toLowerCase()));

        for (const keyword of remainingKeywords) {
            if (globalKeywordsSet.has(keyword.toLowerCase())) {
                existingKeywords.push(keyword);
            } else {
                newKeywords.push(keyword);
            }
        }

        logger.debug("Global DB check results", { existing: existingKeywords.length - vectorDbExisting.length, new: newKeywords.length });
    }

    const totalDuration = Date.now() - checkStartTime;
    logger.info("Keyword check completed", { duration: totalDuration, existing: existingKeywords.length, new: newKeywords.length });

    return { existingKeywords, newKeywords };
}

