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
    currentStage: string; // 'generating-seeds' | 'generating-keywords' | 'fetching-dataforseo' | 'computing-metrics' | 'generating-report' | 'complete'
    stage: string; // Legacy field for backward compatibility
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
    // New fields for full pipeline tracking
    dataForSEOFetched?: boolean;
    metricsComputed?: boolean;
    reportGenerated?: boolean;
    keywordsFetchedCount?: number;
    metricsProcessedCount?: number;
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

    // Step 2: Collect keywords from seeds (or continue from resume point) with concurrent processing
    progress.stage = 'generating-keywords';

    const CONCURRENT_BATCH_SIZE = 20; // Process 20 seeds concurrently

    // Process seeds in batches of 20 concurrently
    for (let batchStart = startSeedIndex; batchStart < seedsWithSimilarity.length; batchStart += CONCURRENT_BATCH_SIZE) {
        if (progress.newKeywordsCollected >= targetCount) {
            break; // We have enough new keywords
        }

        const batchEnd = Math.min(batchStart + CONCURRENT_BATCH_SIZE, seedsWithSimilarity.length);
        const batch = seedsWithSimilarity.slice(batchStart, batchEnd);

        // Process all seeds in this batch concurrently
        const batchPromises = batch.map(async ({ seed, similarityScore }) => {
            try {
                // Generate keywords from this seed (~50 per seed)
                const generatedKeywords = await keywordGenerator.generateKeywordsFromSeed(seed, 50);
                
                // Deduplicate within this batch
                const deduplicated = deduplicateKeywords(generatedKeywords);
                const duplicatesInBatch = generatedKeywords.filter(kw => {
                    const normalized = kw.toLowerCase();
                    return !deduplicated.some(d => d.toLowerCase() === normalized);
                });

                // Check for existing keywords (vector DB + global DB)
                const checkResult = await checkKeywords(deduplicated);

                return {
                    seed,
                    generatedKeywords,
                    deduplicated,
                    duplicatesInBatch,
                    checkResult,
                    success: true,
                };
            } catch (error) {
                console.error(`[KeywordCollector] Failed to generate keywords from seed: ${seed}`, error);
                return {
                    seed,
                    generatedKeywords: [],
                    deduplicated: [],
                    duplicatesInBatch: [],
                    checkResult: { existingKeywords: [], newKeywords: [] },
                    success: false,
                };
            }
        });

        // Wait for all seeds in batch to complete, with timeout protection
        let batchResults;
        try {
            batchResults = await Promise.allSettled(batchPromises);
            // Convert settled results to regular results format
            batchResults = batchResults.map((result, index) => {
                if (result.status === 'fulfilled') {
                    return result.value;
                } else {
                    const seed = batch[index]?.seed || 'unknown';
                    console.error(`[KeywordCollector] Promise rejected for seed: ${seed}`, result.reason);
                    return {
                        seed,
                        generatedKeywords: [],
                        deduplicated: [],
                        duplicatesInBatch: [],
                        checkResult: { existingKeywords: [], newKeywords: [] },
                        success: false,
                    };
                }
            });
        } catch (error) {
            console.error(`[KeywordCollector] Error processing batch starting at ${batchStart}:`, error);
            // Create failed results for all seeds in batch
            batchResults = batch.map(({ seed }) => ({
                seed,
                generatedKeywords: [],
                deduplicated: [],
                duplicatesInBatch: [],
                checkResult: { existingKeywords: [], newKeywords: [] },
                success: false,
            }));
        }

        // Process results and update progress
        for (const result of batchResults) {
            if (progress.newKeywordsCollected >= targetCount) {
                break; // We have enough new keywords
            }

            if (!result.success) {
                continue; // Skip failed seeds
            }

            progress.currentSeed = result.seed;
            progress.keywordsGenerated += result.generatedKeywords.length;
            allKeywordsList.push(...result.generatedKeywords);

            progress.duplicatesFound += result.duplicatesInBatch.length;
            duplicatesList.push(...result.duplicatesInBatch);

            progress.existingKeywordsFound += result.checkResult.existingKeywords.length;
            existingKeywordsList.push(...result.checkResult.existingKeywords);

            // Add new keywords to collection
            const newKeywords = result.checkResult.newKeywords.filter(kw => {
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

            // Call progress callback with error handling
            try {
                progressCallback?.(progress);
            } catch (callbackError) {
                console.error(`[KeywordCollector] Error in progress callback:`, callbackError);
                // Continue processing even if callback fails
            }

            // If we have enough, break early
            if (progress.newKeywordsCollected >= targetCount) {
                break;
            }
        }
        
        // Send progress update after each batch completes
        try {
            progressCallback?.(progress);
        } catch (callbackError) {
            console.error(`[KeywordCollector] Error in progress callback after batch:`, callbackError);
        }

        // If we have enough, break out of batch loop
        if (progress.newKeywordsCollected >= targetCount) {
            break;
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
        currentStage: progress.stage,
        stage: progress.stage, // Legacy field for backward compatibility
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

