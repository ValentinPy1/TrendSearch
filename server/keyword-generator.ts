import OpenAI from 'openai';

class KeywordGenerator {
    private openai: OpenAI;

    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
            baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        });
    }

    /**
     * Generate commercial keywords from a seed prompt
     * Returns approximately 50 keywords per seed
     */
    async generateKeywordsFromSeed(seed: string, targetCount: number = 50): Promise<string[]> {
        const prompt = `Generate ${targetCount} commercial keywords related to: "${seed}"

Focus on:
- Buyer intent keywords (e.g., "buy", "best", "review", "pricing")
- Comparison queries (e.g., "vs", "alternative", "compare")
- Problem-solving keywords (e.g., "how to", "solution", "fix")
- Commercial and transactional terms

Return ONLY the keywords, one per line, without numbers, bullets, or explanations.
Do not include quotes around keywords.
Each keyword should be a single search query phrase (2-5 words typically).
Ensure keywords are diverse and cover different angles of the topic.`;

        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a keyword research expert. Generate commercial keywords that users would search for when looking to buy, compare, or solve problems related to a topic.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.8,
                max_tokens: 2000,
            });

            const content = response.choices[0]?.message?.content || '';
            if (!content) {
                console.warn(`[KeywordGenerator] Empty response for seed: ${seed}`);
                return [];
            }

            // Parse keywords from response
            const keywords = this.parseKeywords(content);
            return keywords;
        } catch (error) {
            console.error(`[KeywordGenerator] Failed to generate keywords for seed: ${seed}`, error);
            throw error;
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
                console.warn(`[KeywordGenerator] Failed to generate ${variation.angle} keywords for seed: ${seed}`, error);
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

            if (cleaned.length > 0 && cleaned.length < 100) { // Reasonable keyword length
                keywords.push(cleaned);
            }
        }

        return keywords;
    }
}

export const keywordGenerator = new KeywordGenerator();

