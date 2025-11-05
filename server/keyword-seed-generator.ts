import { keywordVectorService } from "./keyword-vector-service";

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

/**
 * Generate seed prompts from custom search inputs
 * Seeds are ranked by semantic similarity to the pitch
 */
export async function generateSeeds(input: SeedGenerationInput): Promise<SeedWithSimilarity[]> {
    const { pitch, topics, personas, painPoints, features, competitors } = input;

    // Collect all list items
    const allItems: string[] = [
        ...topics,
        ...personas,
        ...painPoints,
        ...features,
        ...competitors.map(c => c.name),
        ...competitors.map(c => c.description).filter(d => d),
    ].filter(item => item && item.trim().length > 0);

    // Generate systematic seed combinations
    const seeds: string[] = [];

    // 1. Single elements
    if (pitch && pitch.trim()) {
        seeds.push(pitch.trim());
    }
    allItems.forEach(item => {
        seeds.push(item.trim());
    });

    // 2. Two-element combinations: pitch + item
    if (pitch && pitch.trim()) {
        allItems.forEach(item => {
            seeds.push(`${pitch.trim()} ${item.trim()}`);
        });
    }

    // 3. Two-element combinations: item + item
    for (let i = 0; i < allItems.length; i++) {
        for (let j = i + 1; j < allItems.length; j++) {
            seeds.push(`${allItems[i].trim()} ${allItems[j].trim()}`);
        }
    }

    // 4. Three-element combinations: pitch + item + item
    if (pitch && pitch.trim() && allItems.length >= 2) {
        for (let i = 0; i < allItems.length; i++) {
            for (let j = i + 1; j < allItems.length; j++) {
                seeds.push(`${pitch.trim()} ${allItems[i].trim()} ${allItems[j].trim()}`);
            }
        }
    }

    // Fallback: If not enough seeds (less than 20), generate pitch-only variations
    if (seeds.length < 20) {
        const pitchOnlySeeds = generatePitchOnlySeeds(pitch || "");
        seeds.push(...pitchOnlySeeds);
    }

    // Rank seeds by semantic similarity to pitch
    if (!pitch || !pitch.trim()) {
        // If no pitch, return seeds as-is with similarity score 0
        return seeds.map(seed => ({ seed, similarityScore: 0 }));
    }

    // Calculate similarity scores for each seed using embeddings
    const seedsWithSimilarity: SeedWithSimilarity[] = [];
    for (const seed of seeds) {
        try {
            // Use the vector service's calculateTextSimilarity method
            const similarityScore = await keywordVectorService.calculateTextSimilarity(pitch, seed);
            seedsWithSimilarity.push({ seed, similarityScore });
        } catch (error) {
            // If similarity calculation fails, assign score 0.5 as default
            console.warn(`[SeedGenerator] Failed to calculate similarity for seed: ${seed}`, error);
            seedsWithSimilarity.push({ seed, similarityScore: 0.5 });
        }
    }

    // Sort by similarity score (highest first)
    seedsWithSimilarity.sort((a, b) => b.similarityScore - a.similarityScore);

    return seedsWithSimilarity;
}

/**
 * Generate pitch-only seed variations when user doesn't provide enough list items
 */
function generatePitchOnlySeeds(pitch: string): string[] {
    if (!pitch || !pitch.trim()) return [];

    const seeds: string[] = [
        `buyer intent keywords for ${pitch}`,
        `comparison keywords for ${pitch}`,
        `problem-solving keywords for ${pitch}`,
        `${pitch} alternatives`,
        `${pitch} vs competitors`,
        `${pitch} best`,
        `${pitch} review`,
        `${pitch} pricing`,
        `${pitch} features`,
        `${pitch} benefits`,
        `${pitch} use cases`,
        `${pitch} tutorial`,
        `${pitch} guide`,
        `${pitch} comparison`,
        `${pitch} vs`,
        `best ${pitch}`,
        `${pitch} software`,
        `${pitch} tool`,
        `${pitch} solution`,
        `${pitch} platform`,
        `how to use ${pitch}`,
        `why use ${pitch}`,
        `${pitch} pros and cons`,
        `${pitch} alternatives`,
        `${pitch} for business`,
        `${pitch} for startups`,
        `${pitch} integration`,
        `${pitch} api`,
        `${pitch} support`,
        `cheap ${pitch}`,
    ];

    return seeds;
}

