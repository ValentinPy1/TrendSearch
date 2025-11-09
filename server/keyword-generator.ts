import OpenAI from 'openai';
import { logger } from "./utils/logger";
import {
    MAX_RETRY_ATTEMPTS,
    RETRY_INITIAL_DELAY_MS,
    RETRY_MAX_DELAY_MS,
} from "./config/keyword-generation";

// Circuit breaker pattern for API failures
class CircuitBreaker {
    private failures: number = 0;
    private lastFailureTime: number = 0;
    private readonly failureThreshold: number = 5;
    private readonly resetTimeout: number = 60000; // 1 minute
    private state: 'closed' | 'open' | 'half-open' = 'closed';

    canAttempt(): boolean {
        const now = Date.now();
        if (this.state === 'open') {
            if (now - this.lastFailureTime > this.resetTimeout) {
                this.state = 'half-open';
                logger.info("Circuit breaker transitioning to half-open", {});
                return true;
            }
            return false;
        }
        return true;
    }

    recordSuccess(): void {
        this.failures = 0;
        this.state = 'closed';
    }

    recordFailure(): void {
        this.failures++;
        this.lastFailureTime = Date.now();
        if (this.failures >= this.failureThreshold) {
            this.state = 'open';
            logger.warn("Circuit breaker opened due to too many failures", { failures: this.failures });
        }
    }
}

class KeywordGenerator {
    private openai: OpenAI;
    private circuitBreaker: CircuitBreaker;

    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
            baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        });
        this.circuitBreaker = new CircuitBreaker();
    }

    // Retry helper with exponential backoff
    private async retryWithBackoff<T>(
        fn: () => Promise<T>,
        maxAttempts: number = MAX_RETRY_ATTEMPTS,
        initialDelay: number = RETRY_INITIAL_DELAY_MS,
        maxDelay: number = RETRY_MAX_DELAY_MS
    ): Promise<T> {
        let lastError: Error | unknown;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const result = await fn();
                this.circuitBreaker.recordSuccess();
                return result;
            } catch (error) {
                lastError = error;
                if (attempt < maxAttempts - 1) {
                    // Ensure delay is at least 1ms to prevent negative timeout warnings
                    const delay = Math.max(1, Math.min(initialDelay * Math.pow(2, attempt), maxDelay));
                    logger.debug(`Retry attempt ${attempt + 1}/${maxAttempts} after ${delay}ms`, { error: error instanceof Error ? error.message : String(error) });
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    this.circuitBreaker.recordFailure();
                }
            }
        }
        throw lastError || new Error("Retry failed");
    }

    /**
     * Generate commercial keywords from a seed prompt
     * Returns approximately 50 keywords per seed
     */
    async generateKeywordsFromSeed(seed: string, targetCount: number = 50): Promise<string[]> {
        const prompt = `Generate ${targetCount} short, commercial keywords related to: "${seed}"

CRITICAL REQUIREMENTS:
- Each keyword must be 2-4 words maximum (prefer 2-3 words)
- Focus on high-volume, commercial keywords that people actually search for
- Avoid long-tail phrases like "features to look for in..." or "how to choose..."
- Prefer direct, concise search terms

Focus on:
- Buyer intent: "best [product]", "[product] price", "buy [product]", "[product] review"
- Comparison: "[product] vs [competitor]", "[product] alternative", "compare [product]"
- Problem-solving: "[product] solution", "[problem] tool", "[product] for [use case]"
- Commercial terms: "[product] pricing", "[product] cost", "[product] features"

Examples of GOOD keywords (short):
- "trend analysis tool"
- "competitor analysis software"
- "best market research tool"
- "keyword research pricing"

Examples of BAD keywords (too long):
- "features to look for in trend discovery tools"
- "how to choose competitive intelligence tools"
- "what are the best features of market research platforms"

Return ONLY the keywords, one per line, without numbers, bullets, or explanations.
Do not include quotes around keywords.
Each keyword must be 2-4 words only.`;

        const apiCallStartTime = Date.now();
        logger.debug("Starting API call for seed", { seed, timestamp: new Date().toISOString() });

        // Check circuit breaker
        if (!this.circuitBreaker.canAttempt()) {
            logger.warn("Circuit breaker is open, skipping API call", { seed });
            throw new Error("API circuit breaker is open - too many recent failures");
        }

        try {
            const response = await this.retryWithBackoff(
                () => this.openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a keyword research expert. Generate SHORT commercial keywords (2-4 words max) that users actually search for. Focus on high-volume, transactional keywords. Avoid long-tail phrases.',
                        },
                        {
                            role: 'user',
                            content: prompt,
                        },
                    ],
                    temperature: 0.8,
                    max_tokens: 2000,
                })
            );

            const apiCallDuration = Date.now() - apiCallStartTime;
            logger.debug("API call completed", { seed, duration: apiCallDuration });

            const content = response.choices[0]?.message?.content || '';
            if (!content) {
                logger.warn("Empty response from API", { seed });
                return [];
            }

            // Parse keywords from response
            const keywords = this.parseKeywords(content);
            logger.debug("Keywords parsed", { seed, count: keywords.length });
            return keywords;
        } catch (error) {
            const apiCallDuration = Date.now() - apiCallStartTime;
            logger.error("Failed to generate keywords for seed", error, { seed, duration: apiCallDuration });
            // Don't throw - return empty array for graceful degradation
            // The caller can handle empty results
            return [];
        }
    }

    /**
     * Generate keywords using multiple prompt variations for diversity
     */
    async generateKeywordsWithVariations(seed: string, targetCount: number = 50): Promise<string[]> {
        const promptVariations = [
            {
                angle: 'buyer intent',
                prompt: `Generate ${targetCount} buyer intent keywords for: "${seed}"
Focus on commercial and transactional terms like "buy", "best", "review", "pricing", "cost", "deal".
Return keywords one per line, no numbers or bullets.`,
            },
            {
                angle: 'comparison',
                prompt: `Generate ${targetCount} comparison keywords for: "${seed}"
Focus on comparison queries like "vs", "alternative", "compare", "better than".
Return keywords one per line, no numbers or bullets.`,
            },
            {
                angle: 'problem-solving',
                prompt: `Generate ${targetCount} problem-solving keywords for: "${seed}"
Focus on how-to queries, solutions, tutorials, guides like "how to", "solution", "fix", "guide".
Return keywords one per line, no numbers or bullets.`,
            },
        ];

        const allKeywords: string[] = [];
        const keywordsPerVariation = Math.ceil(targetCount / promptVariations.length);

        for (const variation of promptVariations) {
            try {
                const response = await this.openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a keyword research expert. Generate commercial keywords.',
                        },
                        {
                            role: 'user',
                            content: variation.prompt,
                        },
                    ],
                    temperature: 0.8,
                    max_tokens: 1500,
                });

                const content = response.choices[0]?.message?.content || '';
                if (content) {
                    const keywords = this.parseKeywords(content);
                    allKeywords.push(...keywords);
                }
            } catch (error) {
                logger.warn("Failed to generate variation keywords", { seed, angle: variation.angle, error });
                // Continue with other variations
            }
        }

        // Deduplicate and return
        const uniqueKeywords = Array.from(new Set(allKeywords.map(kw => kw.toLowerCase().trim())))
            .filter(kw => kw.length > 0);

        return uniqueKeywords.slice(0, targetCount);
    }

    /**
     * Parse keywords from LLM response text
     */
    private parseKeywords(content: string): string[] {
        // Split by newlines and filter
        const lines = content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        const keywords: string[] = [];

        for (const line of lines) {
            // Remove leading numbers, bullets, dashes, etc.
            const cleaned = line
                .replace(/^\d+[\.\)]\s*/, '') // Remove "1. ", "1) ", etc.
                .replace(/^[-*•]\s*/, '') // Remove "- ", "* ", "• ", etc.
                .replace(/^["']|["']$/g, '') // Remove surrounding quotes
                .trim();

            // Filter for short keywords (2-4 words, max 50 characters)
            const wordCount = cleaned.split(/\s+/).length;
            if (cleaned.length > 0 && cleaned.length <= 50 && wordCount >= 2 && wordCount <= 4) {
                keywords.push(cleaned);
            }
        }

        return keywords;
    }
}

export const keywordGenerator = new KeywordGenerator();

