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
    newKeywords?: string[]; // Track new keywords for saving
}

export interface KeywordGenerationProgress {
    stage: string; // 'generating-seeds' | 'generating-keywords' | 'selecting-top-keywords' | 'complete'
    seedsGenerated: number;
    keywordsGenerated: number;
    duplicatesFound: number;
    existingKeywordsFound: number;
    newKeywordsCollected: number;
    seeds?: string[];
    allKeywords?: string[];
    duplicates?: string[];
    existingKeywords?: string[];
    newKeywords?: string[]; // Final list of new keywords
    completedAt?: string; // ISO timestamp
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
    targetCount: number = 1000,
    resumeFromProgress?: KeywordGenerationProgress
): Promise<KeywordCollectionResult> {
    // If resuming, restore state from saved progress
    let progress: ProgressUpdate;
    let seedsWithSimilarity: Array<{ seed: string; similarityScore: number }>;
    let allGeneratedKeywords: string[];
    let seenKeywords: Set<string>;
    let allKeywordsList: string[];
    let duplicatesList: string[];
    let existingKeywordsList: string[];
    let startSeedIndex = 0;

    if (resumeFromProgress) {
        // Restore from saved progress
        progress = {
            stage: resumeFromProgress.stage,
            seedsGenerated: resumeFromProgress.seedsGenerated,
            keywordsGenerated: resumeFromProgress.keywordsGenerated,
            duplicatesFound: resumeFromProgress.duplicatesFound,
            existingKeywordsFound: resumeFromProgress.existingKeywordsFound,
            newKeywordsCollected: resumeFromProgress.newKeywordsCollected,
            seeds: resumeFromProgress.seeds || [],
            allKeywords: resumeFromProgress.allKeywords || [],
            duplicates: resumeFromProgress.duplicates || [],
            existingKeywords: resumeFromProgress.existingKeywords || [],
        };

        // Restore lists
        allGeneratedKeywords = resumeFromProgress.newKeywords ? [...resumeFromProgress.newKeywords] : [];
        seenKeywords = new Set(allGeneratedKeywords.map(kw => kw.toLowerCase()));
        allKeywordsList = resumeFromProgress.allKeywords ? [...resumeFromProgress.allKeywords] : [];
        duplicatesList = resumeFromProgress.duplicates ? [...resumeFromProgress.duplicates] : [];
        existingKeywordsList = resumeFromProgress.existingKeywords ? [...resumeFromProgress.existingKeywords] : [];

        // Create seeds from saved list (we'll need to regenerate similarity scores or use saved ones)
        seedsWithSimilarity = (resumeFromProgress.seeds || []).map(seed => ({
            seed,
            similarityScore: 0.8, // Default score when resuming
        }));

        // Find where to resume (skip seeds that were already processed)
        // We'll estimate based on how many keywords we've collected
        // This is approximate - we'll continue from where we left off
        startSeedIndex = Math.floor((resumeFromProgress.newKeywordsCollected || 0) / 50);

        progress.stage = 'generating-keywords'; // Resume in keyword generation stage
        progressCallback?.(progress);
    } else {
        // Fresh start
        progress = {
            stage: 'initializing',
            seedsGenerated: 0,
            keywordsGenerated: 0,
            duplicatesFound: 0,
            existingKeywordsFound: 0,
            newKeywordsCollected: 0,
        };

        allGeneratedKeywords = [];
        seenKeywords = new Set<string>();
        allKeywordsList = [];
        duplicatesList = [];
        existingKeywordsList = [];

        // Step 1: Generate seeds with similarity ranking
        progress.stage = 'generating-seeds';
        progressCallback?.(progress);
        
        seedsWithSimilarity = await generateSeeds(input);
        progress.seedsGenerated = seedsWithSimilarity.length;
        progress.seeds = seedsWithSimilarity.map(s => s.seed);
        progressCallback?.(progress);
    }

    // Step 2: Collect keywords from seeds (or continue from resume point)
    progress.stage = 'generating-keywords';

    for (let i = startSeedIndex; i < seedsWithSimilarity.length; i++) {
        const { seed, similarityScore } = seedsWithSimilarity[i];
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
            progress.newKeywords = [...allGeneratedKeywords]; // Track new keywords for saving

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

/**
 * Convert ProgressUpdate to KeywordGenerationProgress for saving
 */
export function progressToSaveFormat(progress: ProgressUpdate, newKeywords: string[]): KeywordGenerationProgress {
    return {
        stage: progress.stage,
        seedsGenerated: progress.seedsGenerated,
        keywordsGenerated: progress.keywordsGenerated,
        duplicatesFound: progress.duplicatesFound,
        existingKeywordsFound: progress.existingKeywordsFound,
        newKeywordsCollected: progress.newKeywordsCollected,
        seeds: progress.seeds,
        allKeywords: progress.allKeywords,
        duplicates: progress.duplicates,
        existingKeywords: progress.existingKeywords,
        newKeywords: newKeywords,
        completedAt: progress.stage === 'complete' ? new Date().toISOString() : undefined,
    };
}

