import { generateSeeds, type SeedGenerationInput } from "./keyword-seed-generator";
import { deduplicateKeywords } from "./keyword-deduplicator";
import { keywordGenerator } from "./keyword-generator";
import { checkKeywords } from "./keyword-checker";
import { keywordVectorService } from "./keyword-vector-service";

export interface ProgressUpdate {
    stage: string;
    seedsGenerated: number;
    keywordsGenerated: number;
    duplicatesFound: number;
    existingKeywordsFound: number;
    newKeywordsCollected: number;
    currentSeed?: string;
    // Actual lists for display
    seeds?: string[];
    allKeywords?: string[];
    duplicates?: string[];
    existingKeywords?: string[];
}

export interface KeywordCollectionResult {
    keywords: string[];
    progress: ProgressUpdate;
}

/**
 * Collect 1000 unique new keywords from custom search inputs
 * Uses semantic similarity to prioritize most relevant seeds and keywords
 */
export async function collectKeywords(
    input: SeedGenerationInput,
    progressCallback?: (progress: ProgressUpdate) => void,
    targetCount: number = 1000
): Promise<KeywordCollectionResult> {
    const progress: ProgressUpdate = {
        stage: 'initializing',
        seedsGenerated: 0,
        keywordsGenerated: 0,
        duplicatesFound: 0,
        existingKeywordsFound: 0,
        newKeywordsCollected: 0,
    };

    // Step 1: Generate seeds with similarity ranking
    progress.stage = 'generating-seeds';
    progressCallback?.(progress);
    
    const seedsWithSimilarity = await generateSeeds(input);
    progress.seedsGenerated = seedsWithSimilarity.length;
    progress.seeds = seedsWithSimilarity.map(s => s.seed);
    progressCallback?.(progress);

    // Step 2: Collect keywords from seeds
    progress.stage = 'generating-keywords';
    const allGeneratedKeywords: string[] = [];
    const seenKeywords = new Set<string>(); // Track duplicates
    const allKeywordsList: string[] = []; // Track all keywords generated
    const duplicatesList: string[] = []; // Track all duplicates
    const existingKeywordsList: string[] = []; // Track all existing keywords

    for (const { seed, similarityScore } of seedsWithSimilarity) {
        if (progress.newKeywordsCollected >= targetCount) {
            break; // We have enough new keywords
        }

        progress.currentSeed = seed;
        progressCallback?.(progress);

        try {
            // Generate keywords from this seed (~50 per seed)
            const generatedKeywords = await keywordGenerator.generateKeywordsFromSeed(seed, 50);
            progress.keywordsGenerated += generatedKeywords.length;
            allKeywordsList.push(...generatedKeywords);

            // Deduplicate within this batch
            const deduplicated = deduplicateKeywords(generatedKeywords);
            const duplicatesInBatch = generatedKeywords.filter(kw => {
                const normalized = kw.toLowerCase();
                return !deduplicated.some(d => d.toLowerCase() === normalized);
            });
            progress.duplicatesFound += duplicatesInBatch.length;
            duplicatesList.push(...duplicatesInBatch);

            // Check for existing keywords (vector DB + global DB)
            const checkResult = await checkKeywords(deduplicated);
            progress.existingKeywordsFound += checkResult.existingKeywords.length;
            existingKeywordsList.push(...checkResult.existingKeywords);

            // Add new keywords to collection
            const newKeywords = checkResult.newKeywords.filter(kw => {
                const normalized = kw.toLowerCase();
                if (!seenKeywords.has(normalized)) {
                    seenKeywords.add(normalized);
                    return true;
                }
                progress.duplicatesFound++;
                duplicatesList.push(kw);
                return false;
            });

            allGeneratedKeywords.push(...newKeywords);
            progress.newKeywordsCollected = allGeneratedKeywords.length;

            // Update lists in progress
            progress.allKeywords = [...allKeywordsList];
            progress.duplicates = [...duplicatesList];
            progress.existingKeywords = [...existingKeywordsList];

            progressCallback?.(progress);

            // If we have enough, break early
            if (progress.newKeywordsCollected >= targetCount) {
                break;
            }
        } catch (error) {
            console.error(`[KeywordCollector] Failed to generate keywords from seed: ${seed}`, error);
            // Continue with next seed
        }
    }

    // Step 3: If we have more than targetCount, select top keywords by similarity
    let finalKeywords = allGeneratedKeywords;
    if (allGeneratedKeywords.length > targetCount) {
        progress.stage = 'selecting-top-keywords';
        progressCallback?.(progress);

        // Calculate similarity scores for all keywords against the pitch
        const pitch = input.pitch || "";
        if (pitch.trim()) {
            const keywordsWithSimilarity = await Promise.all(
                allGeneratedKeywords.map(async (keyword) => {
                    try {
                        const similarity = await keywordVectorService.calculateTextSimilarity(pitch, keyword);
                        return { keyword, similarity };
                    } catch (error) {
                        console.warn(`[KeywordCollector] Failed to calculate similarity for keyword: ${keyword}`, error);
                        return { keyword, similarity: 0.5 }; // Default score
                    }
                })
            );

            // Sort by similarity (highest first) and take top targetCount
            keywordsWithSimilarity.sort((a, b) => b.similarity - a.similarity);
            finalKeywords = keywordsWithSimilarity
                .slice(0, targetCount)
                .map(item => item.keyword);
        } else {
            // No pitch, just take first targetCount
            finalKeywords = allGeneratedKeywords.slice(0, targetCount);
        }
    }

    progress.stage = 'complete';
    progress.newKeywordsCollected = finalKeywords.length;
    progressCallback?.(progress);

    return {
        keywords: finalKeywords,
        progress,
    };
}

