import { keywordVectorService } from "./keyword-vector-service";
import OpenAI from 'openai';
import { logger } from "./utils/logger";
import {
    MAX_RETRY_ATTEMPTS,
    RETRY_INITIAL_DELAY_MS,
    RETRY_MAX_DELAY_MS,
} from "./config/keyword-generation";

export interface SeedGenerationInput {
    pitch: string;
    topics: string[];
    personas: string[];
    painPoints: string[];
    features: string[];
    competitors: Array<{ name: string; description: string; url?: string | null }>;
}

export interface SeedWithSimilarity {
    seed: string;
    similarityScore: number;
}

const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

/**
 * Generate seed prompts from custom search inputs using a single LLM prompt
 * Seeds are ranked by semantic similarity to the pitch
 */
export async function generateSeeds(input: SeedGenerationInput): Promise<SeedWithSimilarity[]> {
    const { pitch, topics, personas, painPoints, features, competitors } = input;

    if (!pitch || !pitch.trim()) {
        throw new Error("Pitch is required to generate seeds");
    }

    // Collect all list items
    const allItems: string[] = [
        ...topics,
        ...personas,
        ...painPoints,
        ...features,
        ...competitors.map(c => c.name),
        ...competitors.map(c => c.description).filter(d => d),
    ].filter(item => item && item.trim().length > 0);

    // Build context for LLM
    const contextParts: string[] = [];
    if (topics.length > 0) {
        contextParts.push(`Topics: ${topics.join(', ')}`);
    }
    if (personas.length > 0) {
        contextParts.push(`Personas: ${personas.join(', ')}`);
    }
    if (painPoints.length > 0) {
        contextParts.push(`Pain Points: ${painPoints.join(', ')}`);
    }
    if (features.length > 0) {
        contextParts.push(`Features: ${features.join(', ')}`);
    }
    if (competitors.length > 0) {
        const competitorNames = competitors.map(c => c.name).join(', ');
        contextParts.push(`Competitors: ${competitorNames}`);
    }

    const context = contextParts.length > 0 ? `\n\nAdditional context:\n${contextParts.join('\n')}` : '';

    // Generate 50 seed prompts using LLM
    const prompt = `Generate exactly 50 diverse, SHORT seed prompts for keyword generation based on this idea pitch and context:

Idea Pitch: "${pitch}"${context}

CRITICAL REQUIREMENTS:
- Each seed prompt must be 2-4 words maximum (prefer 2-3 words)
- Keep prompts concise and direct - they will be expanded into keywords
- Avoid long phrases like "how to choose..." or "features to look for in..."

Focus on:
- Buyer intent: "best [product]", "[product] price", "buy [product]"
- Comparison: "[product] vs [competitor]", "[product] alternative"
- Problem-solving: "[product] solution", "[problem] tool"
- Feature-focused: "[product] features", "[product] benefits"
- Use case: "[product] for [persona]"

Examples of GOOD seeds (short):
- "trend analysis tool"
- "competitor analysis"
- "market research pricing"

Examples of BAD seeds (too long):
- "features to look for in trend discovery tools"
- "how to choose competitive intelligence tools"

Return ONLY the 50 seed prompts, one per line, without numbers, bullets, or explanations.
Do not include quotes around the prompts.
Each seed must be 2-4 words only.`;

    // Retry helper with exponential backoff
    const retryWithBackoff = async <T>(
        fn: () => Promise<T>,
        maxAttempts: number = MAX_RETRY_ATTEMPTS,
        initialDelay: number = RETRY_INITIAL_DELAY_MS,
        maxDelay: number = RETRY_MAX_DELAY_MS
    ): Promise<T> => {
        let lastError: Error | unknown;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                if (attempt < maxAttempts - 1) {
                    // Ensure delay is at least 1ms to prevent negative timeout warnings
                    const delay = Math.max(1, Math.min(initialDelay * Math.pow(2, attempt), maxDelay));
                    logger.debug(`Retry attempt ${attempt + 1}/${maxAttempts} after ${delay}ms`, { error: error instanceof Error ? error.message : String(error) });
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        throw lastError || new Error("Retry failed");
    };

    try {
        const response = await retryWithBackoff(
            () => openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a keyword research expert. Generate diverse seed prompts for keyword generation.',
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

        const content = response.choices[0]?.message?.content || '';
        if (!content) {
            logger.warn("Empty response from LLM", {});
            return [];
        }

        // Parse seeds from response
        const seeds = content
            .split('\n')
            .map(line => line.trim())
            .map(line => {
                // Remove leading numbers, bullets, dashes, etc.
                return line
                    .replace(/^\d+[\.\)]\s*/, '')
                    .replace(/^[-*•]\s*/, '')
                    .replace(/^["']|["']$/g, '')
                    .trim();
            })
            .filter(seed => {
                // Filter for short seeds (2-4 words, max 50 characters)
                if (seed.length === 0 || seed.length > 50) return false;
                const wordCount = seed.split(/\s+/).length;
                return wordCount >= 2 && wordCount <= 4;
            });

        if (seeds.length === 0) {
            logger.warn("No seeds parsed from LLM response", {});
            return [];
        }

        logger.debug("Seeds parsed from LLM", { count: seeds.length });

        // Rank seeds by semantic similarity to pitch (parallelized)
        const similarityPromises = seeds.map(async (seed) => {
            try {
                const similarityScore = await keywordVectorService.calculateTextSimilarity(pitch, seed);
                return { seed, similarityScore };
            } catch (error) {
                logger.warn("Failed to calculate similarity for seed", { seed, error });
                return { seed, similarityScore: 0.5 };
            }
        });
        const seedsWithSimilarity = await Promise.all(similarityPromises);

        // Sort by similarity score (highest first)
        seedsWithSimilarity.sort((a, b) => b.similarityScore - a.similarityScore);

        logger.info("Seeds generated and ranked", { count: seedsWithSimilarity.length });
        return seedsWithSimilarity;
    } catch (error) {
        logger.error("Failed to generate seeds", error, {});
        throw error;
    }
}

