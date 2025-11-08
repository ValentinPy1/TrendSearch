import { generateSeeds, type SeedGenerationInput } from "./keyword-seed-generator";
import { deduplicateKeywords } from "./keyword-deduplicator";
import { keywordGenerator } from "./keyword-generator";
import { checkKeywords } from "./keyword-checker";
import { keywordVectorService } from "./keyword-vector-service";

// Conditional logging based on environment
const DEBUG = process.env.NODE_ENV === 'development';
const log = DEBUG ? console.log : () => { };
const logError = console.error; // Always log errors

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
    processedSeeds?: string[]; // Track which seeds were processed
    seedSimilarities?: Record<string, number>; // Persist similarity scores
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
    // Fields for accurate resume
    processedSeeds?: string[]; // Track which seeds were processed
    seedSimilarities?: Record<string, number>; // Persist similarity scores
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
            processedSeeds: resumeFromProgress.processedSeeds || [],
        };

        // Restore lists
        allGeneratedKeywords = resumeFromProgress.newKeywords ? [...resumeFromProgress.newKeywords] : [];
        seenKeywords = new Set(allGeneratedKeywords.map(kw => kw.toLowerCase()));
        allKeywordsList = resumeFromProgress.allKeywords ? [...resumeFromProgress.allKeywords] : [];
        duplicatesList = resumeFromProgress.duplicates ? [...resumeFromProgress.duplicates] : [];
        existingKeywordsList = resumeFromProgress.existingKeywords ? [...resumeFromProgress.existingKeywords] : [];

        // Restore processed seeds
        const processedSeedsSet = new Set(resumeFromProgress.processedSeeds || []);

        // Restore similarity scores from saved progress
        if (resumeFromProgress.seedSimilarities && resumeFromProgress.seeds) {
            seedsWithSimilarity = resumeFromProgress.seeds.map(seed => ({
                seed,
                similarityScore: resumeFromProgress.seedSimilarities![seed] || 0.8,
            }));
        } else {
            // Fallback: create seeds with default scores
            seedsWithSimilarity = (resumeFromProgress.seeds || []).map(seed => ({
                seed,
                similarityScore: 0.8, // Default score when resuming
            }));
        }

        // Find first unprocessed seed
        startSeedIndex = seedsWithSimilarity.findIndex(s => !processedSeedsSet.has(s.seed));
        if (startSeedIndex === -1) startSeedIndex = 0;

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
        progress.processedSeeds = [];

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
    log(`[KeywordCollector] Starting keyword collection: ${seedsWithSimilarity.length} seeds, targetCount=${targetCount}, startSeedIndex=${startSeedIndex}`);
    log(`[KeywordCollector] Current progress: newKeywordsCollected=${progress.newKeywordsCollected}, keywordsGenerated=${progress.keywordsGenerated}`);

    const CONCURRENT_BATCH_SIZE = 20; // Process 20 seeds concurrently
    const SEED_TIMEOUT_MS = 60000; // 60 seconds per seed
    let lastCallbackTime = 0; // Track last callback time for throttling

    // Helper function to process seed with timeout protection
    const processSeedWithTimeout = async ({ seed, similarityScore }: { seed: string; similarityScore: number }) => {
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Seed timeout: ${seed}`)), SEED_TIMEOUT_MS)
        );

        const seedPromise = (async () => {
            const seedStartTime = Date.now();
            log(`[KeywordCollector] Starting seed processing: "${seed}" at ${new Date().toISOString()}`);

            try {
                // Generate keywords from this seed (~50 per seed)
                log(`[KeywordCollector] Calling generateKeywordsFromSeed for: "${seed}"`);
                const generateStartTime = Date.now();
                const generatedKeywords = await keywordGenerator.generateKeywordsFromSeed(seed, 50);
                const generateDuration = Date.now() - generateStartTime;
                log(`[KeywordCollector] generateKeywordsFromSeed completed for "${seed}" in ${generateDuration}ms, got ${generatedKeywords.length} keywords`);

                // Deduplicate within this batch
                const deduplicated = deduplicateKeywords(generatedKeywords);
                const duplicatesInBatch = generatedKeywords.filter(kw => {
                    const normalized = kw.toLowerCase();
                    return !deduplicated.some(d => d.toLowerCase() === normalized);
                });
                log(`[KeywordCollector] Deduplication for "${seed}": ${generatedKeywords.length} -> ${deduplicated.length} (${duplicatesInBatch.length} duplicates)`);

                // Check for existing keywords (vector DB + global DB)
                log(`[KeywordCollector] Checking existing keywords for "${seed}", ${deduplicated.length} keywords to check`);
                const checkStartTime = Date.now();
                const checkResult = await checkKeywords(deduplicated);
                const checkDuration = Date.now() - checkStartTime;
                log(`[KeywordCollector] checkKeywords completed for "${seed}" in ${checkDuration}ms: ${checkResult.newKeywords.length} new, ${checkResult.existingKeywords.length} existing`);

                const seedDuration = Date.now() - seedStartTime;
                log(`[KeywordCollector] Seed processing complete for "${seed}" in ${seedDuration}ms`);

                return {
                    seed,
                    generatedKeywords,
                    deduplicated,
                    duplicatesInBatch,
                    checkResult,
                    success: true,
                };
            } catch (error) {
                const seedDuration = Date.now() - seedStartTime;
                console.error(`[KeywordCollector] Failed to generate keywords from seed: "${seed}" after ${seedDuration}ms`, error);
                if (error instanceof Error) {
                    console.error(`[KeywordCollector] Error details: ${error.message}, stack: ${error.stack}`);
                }
                return {
                    seed,
                    generatedKeywords: [],
                    deduplicated: [],
                    duplicatesInBatch: [],
                    checkResult: { existingKeywords: [], newKeywords: [] },
                    success: false,
                };
            }
        })();

        return Promise.race([seedPromise, timeoutPromise]);
    };

    // Process seeds in batches of 20 concurrently
    for (let batchStart = startSeedIndex; batchStart < seedsWithSimilarity.length; batchStart += CONCURRENT_BATCH_SIZE) {
        const batchStartTime = Date.now();
        log(`[KeywordCollector] Starting batch: batchStart=${batchStart}, batchEnd=${Math.min(batchStart + CONCURRENT_BATCH_SIZE, seedsWithSimilarity.length)}, remaining=${seedsWithSimilarity.length - batchStart} seeds`);

        if (progress.newKeywordsCollected >= targetCount) {
            log(`[KeywordCollector] Target count reached: ${progress.newKeywordsCollected} >= ${targetCount}, breaking`);
            break; // We have enough new keywords
        }

        const batchEnd = Math.min(batchStart + CONCURRENT_BATCH_SIZE, seedsWithSimilarity.length);
        const batch = seedsWithSimilarity.slice(batchStart, batchEnd);
        log(`[KeywordCollector] Processing batch of ${batch.length} seeds: ${batch.map(b => b.seed).join(', ')}`);

        // Process all seeds in this batch concurrently with timeout protection
        const batchPromises = batch.map(({ seed, similarityScore }) => {
            return processSeedWithTimeout({ seed, similarityScore }).catch((error) => {
                logError(`[KeywordCollector] Seed processing failed with timeout or error: "${seed}"`, error);
                return {
                    seed,
                    generatedKeywords: [],
                    deduplicated: [],
                    duplicatesInBatch: [],
                    checkResult: { existingKeywords: [], newKeywords: [] },
                    success: false,
                };
            });
        });

        // Wait for all seeds in batch to complete, with timeout protection
        log(`[KeywordCollector] Waiting for batch promises to settle (${batchPromises.length} promises) at ${new Date().toISOString()}`);
        const settleStartTime = Date.now();

        let batchResults;
        try {
            batchResults = await Promise.allSettled(batchPromises);
            const settleDuration = Date.now() - settleStartTime;
            log(`[KeywordCollector] Promise.allSettled completed in ${settleDuration}ms: ${batchResults.length} results`);

            // Convert settled results to regular results format
            batchResults = batchResults.map((result, index) => {
                if (result.status === 'fulfilled') {
                    log(`[KeywordCollector] Promise ${index} fulfilled for seed: "${result.value.seed}", success=${result.value.success}`);
                    return result.value;
                } else {
                    const seed = batch[index]?.seed || 'unknown';
                    logError(`[KeywordCollector] Promise ${index} rejected for seed: "${seed}"`, result.reason);
                    if (result.reason instanceof Error) {
                        logError(`[KeywordCollector] Rejection error: ${result.reason.message}, stack: ${result.reason.stack}`);
                    }
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

            const successful = batchResults.filter(r => r.success).length;
            const failed = batchResults.filter(r => !r.success).length;
            log(`[KeywordCollector] Batch results: ${successful} successful, ${failed} failed`);
        } catch (error) {
            const settleDuration = Date.now() - settleStartTime;
            logError(`[KeywordCollector] Error processing batch starting at ${batchStart} after ${settleDuration}ms:`, error);
            if (error instanceof Error) {
                logError(`[KeywordCollector] Batch error details: ${error.message}, stack: ${error.stack}`);
            }
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
        log(`[KeywordCollector] Processing ${batchResults.length} batch results`);
        for (let i = 0; i < batchResults.length; i++) {
            const result = batchResults[i];
            log(`[KeywordCollector] Processing result ${i + 1}/${batchResults.length} for seed: "${result.seed}", success=${result.success}`);

            if (progress.newKeywordsCollected >= targetCount) {
                log(`[KeywordCollector] Target count reached during result processing: ${progress.newKeywordsCollected} >= ${targetCount}`);
                break; // We have enough new keywords
            }

            if (!result.success) {
                log(`[KeywordCollector] Skipping failed seed: "${result.seed}"`);
                continue; // Skip failed seeds
            }

            // Track processed seed
            if (!progress.processedSeeds) {
                progress.processedSeeds = [];
            }
            progress.processedSeeds.push(result.seed);

            progress.currentSeed = result.seed;
            const beforeCount = progress.keywordsGenerated;
            progress.keywordsGenerated += result.generatedKeywords.length;
            allKeywordsList.push(...result.generatedKeywords);

            progress.duplicatesFound += result.duplicatesInBatch.length;
            duplicatesList.push(...result.duplicatesInBatch);

            progress.existingKeywordsFound += result.checkResult.existingKeywords.length;
            existingKeywordsList.push(...result.checkResult.existingKeywords);

            // Remove redundant deduplication - checkKeywords already handles deduplication
            allGeneratedKeywords.push(...result.checkResult.newKeywords);
            progress.newKeywordsCollected = allGeneratedKeywords.length;

            // Update seenKeywords set for future deduplication
            result.checkResult.newKeywords.forEach(kw => {
                seenKeywords.add(kw.toLowerCase());
            });

            log(`[KeywordCollector] Seed "${result.seed}": generated=${result.generatedKeywords.length}, new=${result.checkResult.newKeywords.length}, totalNew=${progress.newKeywordsCollected}, keywordsGenerated=${beforeCount} -> ${progress.keywordsGenerated}`);

            // Update lists in progress (limit array sizes to reduce memory usage)
            progress.allKeywords = allKeywordsList.slice(-500); // Last 500 only
            progress.duplicates = duplicatesList.slice(-500); // Last 500 only
            progress.existingKeywords = existingKeywordsList.slice(-500); // Last 500 only
            progress.newKeywords = allGeneratedKeywords.slice(-200); // Last 200 new keywords

            // Throttle progress callbacks to once per second
            const now = Date.now();
            const CALLBACK_THROTTLE_MS = 1000; // 1 second
            if (!lastCallbackTime || (now - lastCallbackTime > CALLBACK_THROTTLE_MS)) {
                // Build progress with seed similarities
                const progressWithSeeds = {
                    ...progress,
                    processedSeeds: progress.processedSeeds,
                    seedSimilarities: seedsWithSimilarity.reduce((acc, { seed, similarityScore }) => {
                        acc[seed] = similarityScore;
                        return acc;
                    }, {} as Record<string, number>),
                };

                try {
                    log(`[KeywordCollector] Calling progress callback for seed "${result.seed}"`);
                    progressCallback?.(progressWithSeeds);
                    lastCallbackTime = now;
                } catch (callbackError) {
                    logError(`[KeywordCollector] Error in progress callback for seed "${result.seed}":`, callbackError);
                    // Continue processing even if callback fails
                }
            }

            // If we have enough, break early
            if (progress.newKeywordsCollected >= targetCount) {
                log(`[KeywordCollector] Target count reached: ${progress.newKeywordsCollected} >= ${targetCount}`);
                break;
            }
        }

        // Send progress update after each batch completes
        const batchDuration = Date.now() - batchStartTime;
        log(`[KeywordCollector] Batch completed in ${batchDuration}ms: newKeywordsCollected=${progress.newKeywordsCollected}, keywordsGenerated=${progress.keywordsGenerated}`);

        try {
            log(`[KeywordCollector] Calling progress callback after batch completion`);
            progressCallback?.(progress);
        } catch (callbackError) {
            logError(`[KeywordCollector] Error in progress callback after batch:`, callbackError);
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

        // Only calculate similarity if we have significantly more than targetCount
        const pitch = input.pitch || "";
        if (pitch.trim() && allGeneratedKeywords.length > targetCount * 1.2) {
            // Process in batches of 100 to avoid overwhelming the system
            const BATCH_SIZE = 100;
            const keywordsWithSimilarity: Array<{ keyword: string; similarity: number }> = [];

            for (let i = 0; i < allGeneratedKeywords.length; i += BATCH_SIZE) {
                const batch = allGeneratedKeywords.slice(i, i + BATCH_SIZE);
                const batchResults = await Promise.all(
                    batch.map(async (keyword) => {
                        try {
                            const similarity = await keywordVectorService.calculateTextSimilarity(pitch, keyword);
                            return { keyword, similarity };
                        } catch (error) {
                            log(`[KeywordCollector] Failed to calculate similarity for keyword: ${keyword}`, error);
                            return { keyword, similarity: 0.5 }; // Default score
                        }
                    })
                );
                keywordsWithSimilarity.push(...batchResults);
            }

            // Sort by similarity (highest first) and take top targetCount
            keywordsWithSimilarity.sort((a, b) => b.similarity - a.similarity);
            finalKeywords = keywordsWithSimilarity
                .slice(0, targetCount)
                .map(item => item.keyword);
        } else {
            // No pitch or not enough keywords to justify similarity calculation, just take first targetCount
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

