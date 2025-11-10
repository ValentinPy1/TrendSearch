import { generateSeeds, type SeedGenerationInput } from "./keyword-seed-generator";
import { deduplicateKeywords } from "./keyword-deduplicator";
import { keywordGenerator } from "./keyword-generator";
import { checkKeywords } from "./keyword-checker";
import { keywordVectorService } from "./keyword-vector-service";
import { logger } from "./utils/logger";
import {
    CONCURRENT_BATCH_SIZE,
    SEED_TIMEOUT_MS,
    TARGET_KEYWORD_COUNT,
    KEYWORDS_PER_SEED,
    MAX_KEYWORDS_IN_MEMORY,
    PROGRESS_UPDATE_BATCH_SIZE,
    MEMORY_FLUSH_THRESHOLD,
    PROGRESS_CALLBACK_THROTTLE_MS,
    SIMILARITY_BATCH_SIZE,
    SIMILARITY_THRESHOLD_MULTIPLIER,
    MAX_RETRY_ATTEMPTS,
    RETRY_INITIAL_DELAY_MS,
    RETRY_MAX_DELAY_MS,
} from "./config/keyword-generation";

// Performance metrics tracking
interface PerformanceMetric {
    stage: string;
    duration: number;
    details?: Record<string, number>;
    timestamp: number;
}

const performanceMetrics: PerformanceMetric[] = [];

// Helper function to time async operations
async function timeStage<T>(
    stageName: string,
    fn: () => Promise<T>,
    details?: Record<string, number>
): Promise<T> {
    const start = Date.now();
    try {
        const result = await fn();
        const duration = Date.now() - start;
        performanceMetrics.push({
            stage: stageName,
            duration,
            details,
            timestamp: Date.now(),
        });
        logger.perf(stageName, duration, details);
        return result;
    } catch (error) {
        const duration = Date.now() - start;
        logger.error(`[PERF-ERROR] ${stageName} failed after ${duration}ms`, error, { stage: stageName, duration });
        throw error;
    }
}

// Retry helper with exponential backoff
async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxAttempts: number = MAX_RETRY_ATTEMPTS,
    initialDelay: number = RETRY_INITIAL_DELAY_MS,
    maxDelay: number = RETRY_MAX_DELAY_MS
): Promise<T> {
    let lastError: Error | unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt < maxAttempts - 1) {
                const delay = Math.max(1, Math.min(initialDelay * Math.pow(2, attempt), maxDelay));
                logger.debug(`Retry attempt ${attempt + 1}/${maxAttempts} after ${delay}ms`, { error: error instanceof Error ? error.message : String(error) });
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError || new Error("Retry failed");
}

export interface ProgressUpdate {
    stage: string;
    seedsGenerated: number;
    keywordsGenerated: number;
    duplicatesFound: number;
    existingKeywordsFound: number;
    newKeywordsCollected: number;
    currentSeed?: string;
    // Actual lists for display (may be truncated for memory efficiency)
    seeds?: string[];
    allKeywords?: string[]; // Last N items only (for progress display)
    duplicates?: string[]; // Last N items only (for progress display)
    existingKeywords?: string[]; // Last N items only (for progress display)
    newKeywords?: string[]; // Last N items only (for progress display)
    processedSeeds?: string[]; // Track which seeds were processed
    seedSimilarities?: Record<string, number>; // Persist similarity scores
    // Flags to indicate if lists are truncated
    _listsTruncated?: boolean; // Indicates if in-memory lists are truncated
}

export interface KeywordGenerationProgress {
    currentStage: string; // 'generating-seeds' | 'generating-keywords' | 'fetching-dataforseo' | 'computing-metrics' | 'generating-report' | 'complete'
    stage: string; // Legacy field for backward compatibility
    seedsGenerated: number;
    keywordsGenerated: number;
    duplicatesFound: number;
    existingKeywordsFound: number;
    newKeywordsCollected: number;
    seeds?: string[]; // Full list stored in database
    allKeywords?: string[]; // Full list stored in database
    duplicates?: string[]; // Full list stored in database
    existingKeywords?: string[]; // Full list stored in database
    newKeywords?: string[]; // Full list of new keywords stored in database
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
    targetCount: number = TARGET_KEYWORD_COUNT,
    resumeFromProgress?: KeywordGenerationProgress
): Promise<KeywordCollectionResult> {
    // Track overall pipeline start time
    const pipelineStartTime = Date.now();

    logger.info("=== KEYWORD COLLECTION PIPELINE START ===", {
        targetCount,
        hasResumeState: !!resumeFromProgress,
        pitch: input.pitch?.substring(0, 50) + (input.pitch?.length > 50 ? '...' : ''),
        topicsCount: input.topics?.length || 0,
        personasCount: input.personas?.length || 0,
        painPointsCount: input.painPoints?.length || 0,
        featuresCount: input.features?.length || 0,
        competitorsCount: input.competitors?.length || 0,
    });

    // Clear performance metrics for this run
    performanceMetrics.length = 0;

    // If resuming, restore state from saved progress
    let progress: ProgressUpdate;
    let seedsWithSimilarity: Array<{ seed: string; similarityScore: number }> | undefined = undefined;
    let allGeneratedKeywords: string[];
    let seenKeywords: Set<string>;
    let allKeywordsList: string[];
    let duplicatesList: string[];
    let existingKeywordsList: string[];
    let startSeedIndex = 0;

    if (resumeFromProgress) {
        logger.info("Resuming from saved progress", {
            stage: resumeFromProgress.stage,
            seedsGenerated: resumeFromProgress.seedsGenerated,
            keywordsGenerated: resumeFromProgress.keywordsGenerated,
            newKeywordsCollected: resumeFromProgress.newKeywordsCollected,
            processedSeedsCount: resumeFromProgress.processedSeeds?.length || 0,
        });

        // Validate resume state - be lenient for backward compatibility
        // If required fields are missing, log a warning and start fresh instead of throwing
        let shouldResume = true;
        if (!resumeFromProgress.seeds || !Array.isArray(resumeFromProgress.seeds)) {
            logger.warn("Resume state missing seeds array, starting fresh", {});
            shouldResume = false;
        } else if (!resumeFromProgress.processedSeeds || !Array.isArray(resumeFromProgress.processedSeeds)) {
            logger.warn("Resume state missing processedSeeds array, starting fresh", {});
            shouldResume = false;
        } else if (!resumeFromProgress.seedSimilarities || typeof resumeFromProgress.seedSimilarities !== 'object') {
            logger.warn("Resume state missing seedSimilarities, using defaults", {});
            // Continue with resume but use defaults for seedSimilarities
        }

        // Restore from saved progress (only if we have valid resume state)
        if (shouldResume && resumeFromProgress) {
            logger.info("Restoring resume state", {
                seedsCount: resumeFromProgress.seeds?.length || 0,
                processedSeedsCount: resumeFromProgress.processedSeeds?.length || 0,
                newKeywordsCount: resumeFromProgress.newKeywords?.length || 0,
                allKeywordsCount: resumeFromProgress.allKeywords?.length || 0,
            });
            progress = {
                stage: resumeFromProgress.stage || 'generating-keywords',
                seedsGenerated: resumeFromProgress.seedsGenerated || 0,
                keywordsGenerated: resumeFromProgress.keywordsGenerated || 0,
                duplicatesFound: resumeFromProgress.duplicatesFound || 0,
                existingKeywordsFound: resumeFromProgress.existingKeywordsFound || 0,
                newKeywordsCollected: resumeFromProgress.newKeywordsCollected || 0,
                seeds: resumeFromProgress.seeds || [],
                allKeywords: resumeFromProgress.allKeywords ? [...resumeFromProgress.allKeywords].slice(-MAX_KEYWORDS_IN_MEMORY) : [],
                duplicates: resumeFromProgress.duplicates ? [...resumeFromProgress.duplicates].slice(-MAX_KEYWORDS_IN_MEMORY) : [],
                existingKeywords: resumeFromProgress.existingKeywords ? [...resumeFromProgress.existingKeywords].slice(-MAX_KEYWORDS_IN_MEMORY) : [],
                processedSeeds: resumeFromProgress.processedSeeds || [],
                _listsTruncated: true, // Indicate lists are truncated for display
            };

            // Restore full lists from database (for processing)
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
                logger.warn("Resume state missing seedSimilarities, using default scores", {});
                seedsWithSimilarity = (resumeFromProgress.seeds || []).map(seed => ({
                    seed,
                    similarityScore: 0.8, // Default score when resuming
                }));
            }

            // Find first unprocessed seed
            startSeedIndex = seedsWithSimilarity.findIndex(s => !processedSeedsSet.has(s.seed));
            if (startSeedIndex === -1) {
                logger.info("All seeds already processed, starting from beginning", {});
                startSeedIndex = 0;
            } else {
                logger.info("Found unprocessed seed index", { startSeedIndex, totalSeeds: seedsWithSimilarity.length });
            }

            progress.stage = 'generating-keywords'; // Resume in keyword generation stage
            progressCallback?.(progress);
        } // Close inner if (shouldResume && resumeFromProgress) block
    }

    // If we didn't resume (either no resume state or invalid resume state), start fresh
    if (!seedsWithSimilarity) {
        // Fresh start
        logger.info("Starting fresh keyword collection", {});

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
        logger.info("STEP 1: Generating seeds with similarity ranking", {});
        progress.stage = 'generating-seeds';
        progressCallback?.(progress);

        const seedGenStartTime = Date.now();
        seedsWithSimilarity = await timeStage('generate-seeds', () => generateSeeds(input));
        const seedGenDuration = Date.now() - seedGenStartTime;

        progress.seedsGenerated = seedsWithSimilarity.length;
        progress.seeds = seedsWithSimilarity.map(s => s.seed);

        logger.info("Seeds generated successfully", {
            count: seedsWithSimilarity.length,
            duration: seedGenDuration,
            topSeeds: seedsWithSimilarity.slice(0, 5).map(s => ({ seed: s.seed, similarity: s.similarityScore.toFixed(3) })),
        });

        progressCallback?.(progress);
    }

    // Step 2: Collect keywords from seeds (or continue from resume point) with concurrent processing
    // Ensure seedsWithSimilarity is initialized
    if (!seedsWithSimilarity || seedsWithSimilarity.length === 0) {
        throw new Error("seedsWithSimilarity is not initialized or empty");
    }

    logger.info("STEP 2: Collecting keywords from seeds", {
        seedsCount: seedsWithSimilarity.length,
        targetCount,
        startSeedIndex,
        newKeywordsCollected: progress.newKeywordsCollected,
        keywordsGenerated: progress.keywordsGenerated,
        processedSeedsCount: progress.processedSeeds?.length || 0,
        concurrentBatchSize: CONCURRENT_BATCH_SIZE,
        seedTimeout: SEED_TIMEOUT_MS,
    });

    progress.stage = 'generating-keywords';

    let lastCallbackTime = 0; // Track last callback time for throttling
    let failedSeeds: Array<{ seed: string; error: string }> = []; // Track failed seeds for debugging

    // Helper function to process seed with timeout protection
    const processSeedWithTimeout = async ({ seed, similarityScore }: { seed: string; similarityScore: number }) => {
        // Validate timeout value to prevent negative timeout warnings
        const timeoutMs = Math.max(1, SEED_TIMEOUT_MS); // Ensure at least 1ms
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Seed timeout: ${seed}`)), timeoutMs)
        );

        const seedPromise = (async () => {
            const seedStartTime = Date.now();
            const seedIndex = seedsWithSimilarity.findIndex(s => s.seed === seed);
            logger.info(`[Seed ${seedIndex + 1}/${seedsWithSimilarity.length}] Processing seed`, {
                seed,
                similarityScore: similarityScore.toFixed(3),
                timestamp: new Date().toISOString()
            });

            try {
                // Generate keywords from this seed with retry logic
                logger.debug(`[Seed ${seedIndex + 1}] Generating keywords from seed`, { seed, targetCount: KEYWORDS_PER_SEED });
                const generatedKeywords = await retryWithBackoff(
                    () => timeStage(
                        `generateKeywordsFromSeed:${seed}`,
                        () => keywordGenerator.generateKeywordsFromSeed(seed, KEYWORDS_PER_SEED),
                        { seedIndex }
                    )
                );
                logger.info(`[Seed ${seedIndex + 1}] Keywords generated`, {
                    seed,
                    count: generatedKeywords.length,
                    sample: generatedKeywords.slice(0, 3),
                });

                // Deduplicate within this batch to reduce work for checkKeywords
                // This is NOT redundant - it removes duplicates within the seed's generated keywords
                // before checking against the database, which is more efficient.
                // checkKeywords then checks against the global database and seen keywords.
                const dedupStartTime = Date.now();
                const deduplicated = deduplicateKeywords(generatedKeywords);
                const duplicatesInBatch = generatedKeywords.filter(kw => {
                    const normalized = kw.toLowerCase();
                    return !deduplicated.some(d => d.toLowerCase() === normalized);
                });
                const dedupDuration = Date.now() - dedupStartTime;
                logger.debug(`[Seed ${seedIndex + 1}] Deduplication complete`, {
                    seed,
                    original: generatedKeywords.length,
                    deduplicated: deduplicated.length,
                    duplicatesInBatch: duplicatesInBatch.length,
                    duration: dedupDuration,
                });

                // Check for existing keywords (vector DB + global DB) with retry logic
                logger.debug(`[Seed ${seedIndex + 1}] Checking keywords against database`, { seed, count: deduplicated.length });
                const checkResult = await retryWithBackoff(
                    () => timeStage(
                        `checkKeywords:${seed}`,
                        () => checkKeywords(deduplicated),
                        { keywordCount: deduplicated.length }
                    )
                );
                logger.info(`[Seed ${seedIndex + 1}] Keywords checked`, {
                    seed,
                    new: checkResult.newKeywords.length,
                    existing: checkResult.existingKeywords.length,
                    newSample: checkResult.newKeywords.slice(0, 3),
                });

                const seedDuration = Date.now() - seedStartTime;
                logger.info(`[Seed ${seedIndex + 1}] Seed processing complete`, {
                    seed,
                    duration: seedDuration,
                    generated: generatedKeywords.length,
                    new: checkResult.newKeywords.length,
                    existing: checkResult.existingKeywords.length,
                });

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
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.error(`[Seed ${seedIndex + 1}] Failed to generate keywords from seed`, error, {
                    seed,
                    duration: seedDuration,
                    errorType: error instanceof Error ? error.constructor.name : typeof error,
                });
                failedSeeds.push({ seed, error: errorMessage });
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

    // Process seeds in batches concurrently
    let batchNumber = 0;
    const totalBatches = Math.ceil((seedsWithSimilarity.length - startSeedIndex) / CONCURRENT_BATCH_SIZE);

    for (let batchStart = startSeedIndex; batchStart < seedsWithSimilarity.length; batchStart += CONCURRENT_BATCH_SIZE) {
        batchNumber++;
        const batchStartTime = Date.now();
        const batchEnd = Math.min(batchStart + CONCURRENT_BATCH_SIZE, seedsWithSimilarity.length);

        logger.info(`[Batch ${batchNumber}/${totalBatches}] Starting batch`, {
            batchNumber,
            totalBatches,
            batchStart,
            batchEnd,
            batchSize: batchEnd - batchStart,
            remaining: seedsWithSimilarity.length - batchStart,
            currentProgress: {
                newKeywordsCollected: progress.newKeywordsCollected,
                keywordsGenerated: progress.keywordsGenerated,
                duplicatesFound: progress.duplicatesFound,
                existingKeywordsFound: progress.existingKeywordsFound,
            },
        });

        if (progress.newKeywordsCollected >= targetCount) {
            logger.info("Target count reached, stopping batch processing", {
                newKeywordsCollected: progress.newKeywordsCollected,
                targetCount,
                batchesProcessed: batchNumber - 1,
            });
            break; // We have enough new keywords
        }

        const batch = seedsWithSimilarity.slice(batchStart, batchEnd);
        logger.debug(`[Batch ${batchNumber}] Processing batch`, {
            batchNumber,
            seeds: batch.map((b, idx) => `${batchStart + idx + 1}. ${b.seed} (sim: ${b.similarityScore.toFixed(3)})`),
        });

        // Process all seeds in this batch concurrently with timeout protection
        const batchPromises = batch.map(({ seed, similarityScore }) => {
            return processSeedWithTimeout({ seed, similarityScore }).catch((error) => {
                logger.error("Seed processing failed with timeout or error", error, { seed });
                failedSeeds.push({ seed, error: error instanceof Error ? error.message : String(error) });
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
        const settleStartTime = Date.now();
        let batchResults;
        try {
            const settledResults = await Promise.allSettled(batchPromises);
            const settleDuration = Date.now() - settleStartTime;
            logger.debug("Batch promises settled", { batchNumber, duration: settleDuration, count: settledResults.length });

            // Convert settled results to regular results format
            batchResults = settledResults.map((result, index) => {
                if (result.status === 'fulfilled') {
                    return result.value;
                } else {
                    const seed = batch[index]?.seed || 'unknown';
                    logger.error("Promise rejected for seed", result.reason, { seed, batchNumber });
                    failedSeeds.push({ seed, error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
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
            const totalGenerated = batchResults.reduce((sum, r) => sum + r.generatedKeywords.length, 0);
            const totalNew = batchResults.reduce((sum, r) => sum + r.checkResult.newKeywords.length, 0);
            const totalExisting = batchResults.reduce((sum, r) => sum + r.checkResult.existingKeywords.length, 0);

            logger.info(`[Batch ${batchNumber}] Batch results`, {
                batchNumber,
                successful,
                failed,
                totalGenerated,
                totalNew,
                totalExisting,
                failedSeeds: failed > 0 ? batchResults.filter(r => !r.success).map(r => r.seed) : undefined,
            });
        } catch (error) {
            const settleDuration = Date.now() - settleStartTime;
            logger.error("Error processing batch", error, { batchNumber, batchStart, duration: settleDuration });
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
        logger.debug(`[Batch ${batchNumber}] Processing batch results`, { batchNumber, resultCount: batchResults.length });
        for (let i = 0; i < batchResults.length; i++) {
            const result = batchResults[i];

            if (progress.newKeywordsCollected >= targetCount) {
                logger.info("Target count reached during result processing", {
                    newKeywordsCollected: progress.newKeywordsCollected,
                    targetCount,
                    batchNumber,
                    processedInBatch: i,
                });
                break; // We have enough new keywords
            }

            if (!result.success) {
                logger.debug(`[Batch ${batchNumber}] Skipping failed seed`, { seed: result.seed, index: i + 1 });
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

            // Add new keywords (checkKeywords already handles deduplication)
            allGeneratedKeywords.push(...result.checkResult.newKeywords);
            progress.newKeywordsCollected = allGeneratedKeywords.length;

            // Update seenKeywords set for future deduplication
            result.checkResult.newKeywords.forEach(kw => {
                seenKeywords.add(kw.toLowerCase());
            });

            // Early stopping check after each seed
            if (progress.newKeywordsCollected >= targetCount) {
                logger.info("Target count reached after processing seed", {
                    newKeywordsCollected: progress.newKeywordsCollected,
                    targetCount,
                    batchNumber,
                    seedIndex: i + 1,
                    seed: result.seed,
                });
                break; // Stop processing remaining seeds in batch
            }

            logger.info(`[Batch ${batchNumber}] Seed processed successfully`, {
                seed: result.seed,
                generated: result.generatedKeywords.length,
                new: result.checkResult.newKeywords.length,
                existing: result.checkResult.existingKeywords.length,
                duplicates: result.duplicatesInBatch.length,
                totalNew: progress.newKeywordsCollected,
                totalGenerated: progress.keywordsGenerated,
                totalDuplicates: progress.duplicatesFound,
                totalExisting: progress.existingKeywordsFound,
                progress: `${progress.newKeywordsCollected}/${targetCount} (${((progress.newKeywordsCollected / targetCount) * 100).toFixed(1)}%)`,
            });

            // Flush to database if memory threshold reached
            if (allKeywordsList.length > MEMORY_FLUSH_THRESHOLD) {
                logger.debug("Memory threshold reached, lists will be truncated in progress update", {
                    allKeywordsCount: allKeywordsList.length,
                    threshold: MEMORY_FLUSH_THRESHOLD,
                });
            }

            // Update lists in progress (keep only recent N items for display, full lists stored in DB)
            progress.allKeywords = allKeywordsList.slice(-MAX_KEYWORDS_IN_MEMORY);
            progress.duplicates = duplicatesList.slice(-MAX_KEYWORDS_IN_MEMORY);
            progress.existingKeywords = existingKeywordsList.slice(-MAX_KEYWORDS_IN_MEMORY);
            progress.newKeywords = allGeneratedKeywords.slice(-MAX_KEYWORDS_IN_MEMORY);
            progress._listsTruncated = allKeywordsList.length > MAX_KEYWORDS_IN_MEMORY;

            // Throttle progress callbacks globally
            const now = Date.now();
            if (!lastCallbackTime || (now - lastCallbackTime > PROGRESS_CALLBACK_THROTTLE_MS)) {
                // Build progress with seed similarities
                const progressWithSeeds: ProgressUpdate = {
                    ...progress,
                    processedSeeds: progress.processedSeeds,
                    seedSimilarities: seedsWithSimilarity.reduce((acc, { seed, similarityScore }) => {
                        acc[seed] = similarityScore;
                        return acc;
                    }, {} as Record<string, number>),
                };

                try {
                    progressCallback?.(progressWithSeeds);
                    lastCallbackTime = now;
                } catch (callbackError) {
                    logger.error("Error in progress callback", callbackError, { seed: result.seed });
                    // Continue processing even if callback fails
                }
            }

            // If we have enough, break early
            if (progress.newKeywordsCollected >= targetCount) {
                logger.info("Target count reached", { newKeywordsCollected: progress.newKeywordsCollected, targetCount });
                break;
            }
        }

        // Send progress update after each batch completes
        const batchDuration = Date.now() - batchStartTime;
        const batchSize = batchEnd - batchStart;
        const avgTimePerSeed = batchSize > 0 ? batchDuration / batchSize : 0;
        const successfulInBatch = batchResults.filter(r => r.success).length;
        const newInBatch = batchResults.reduce((sum, r) => sum + r.checkResult.newKeywords.length, 0);

        logger.info(`[Batch ${batchNumber}] Batch completed`, {
            batchNumber,
            totalBatches,
            duration: `${batchDuration}ms (${(batchDuration / 1000).toFixed(2)}s)`,
            avgTimePerSeed: `${Math.round(avgTimePerSeed)}ms`,
            successful: `${successfulInBatch}/${batchSize}`,
            newKeywordsInBatch: newInBatch,
            cumulativeProgress: {
                newKeywordsCollected: progress.newKeywordsCollected,
                keywordsGenerated: progress.keywordsGenerated,
                duplicatesFound: progress.duplicatesFound,
                existingKeywordsFound: progress.existingKeywordsFound,
                progressPercent: `${((progress.newKeywordsCollected / targetCount) * 100).toFixed(1)}%`,
            },
            remaining: targetCount - progress.newKeywordsCollected,
        });

        // Log batch performance
        await timeStage(
            `batch-${batchNumber}`,
            async () => Promise.resolve(),
            {
                batchSize,
                duration: batchDuration,
                avgTimePerSeed: Math.round(avgTimePerSeed),
                newKeywords: progress.newKeywordsCollected,
                keywordsGenerated: progress.keywordsGenerated
            }
        );

        // Update progress with full lists for database storage (but truncated for display)
        progress.allKeywords = allKeywordsList.slice(-MAX_KEYWORDS_IN_MEMORY);
        progress.duplicates = duplicatesList.slice(-MAX_KEYWORDS_IN_MEMORY);
        progress.existingKeywords = existingKeywordsList.slice(-MAX_KEYWORDS_IN_MEMORY);
        progress.newKeywords = allGeneratedKeywords.slice(-MAX_KEYWORDS_IN_MEMORY);
        progress._listsTruncated = allKeywordsList.length > MAX_KEYWORDS_IN_MEMORY;

        try {
            progressCallback?.(progress);
        } catch (callbackError) {
            logger.error("Error in progress callback after batch", callbackError, { batchNumber });
        }

        // If we have enough, break out of batch loop
        if (progress.newKeywordsCollected >= targetCount) {
            break;
        }
    }

    // Log failed seeds summary
    if (failedSeeds.length > 0) {
        logger.warn("Some seeds failed during processing", {
            failedCount: failedSeeds.length,
            totalSeeds: seedsWithSimilarity.length,
            failureRate: `${((failedSeeds.length / seedsWithSimilarity.length) * 100).toFixed(1)}%`,
            failedSeeds: failedSeeds.map(f => ({ seed: f.seed, error: f.error.substring(0, 100) })),
        });
    }

    logger.info("STEP 2 COMPLETE: Keyword collection from seeds finished", {
        totalSeedsProcessed: progress.processedSeeds?.length || 0,
        totalSeeds: seedsWithSimilarity.length,
        keywordsGenerated: progress.keywordsGenerated,
        newKeywordsCollected: progress.newKeywordsCollected,
        duplicatesFound: progress.duplicatesFound,
        existingKeywordsFound: progress.existingKeywordsFound,
        targetCount,
        needsSelection: allGeneratedKeywords.length > targetCount,
    });

    // Step 3: If we have more than targetCount, select top keywords by similarity
    let finalKeywords = allGeneratedKeywords;
    if (allGeneratedKeywords.length > targetCount) {
        logger.info("STEP 3: Selecting top keywords by similarity", {
            totalKeywords: allGeneratedKeywords.length,
            targetCount,
            excess: allGeneratedKeywords.length - targetCount,
        });

        progress.stage = 'selecting-top-keywords';
        progressCallback?.(progress);

        // Only calculate similarity if we have significantly more than targetCount
        const pitch = input.pitch || "";
        if (pitch.trim() && allGeneratedKeywords.length > targetCount * SIMILARITY_THRESHOLD_MULTIPLIER) {
            logger.info("Calculating similarity scores for keyword selection", {
                keywordCount: allGeneratedKeywords.length,
                targetCount,
                threshold: targetCount * SIMILARITY_THRESHOLD_MULTIPLIER,
                batchSize: SIMILARITY_BATCH_SIZE,
                totalBatches: Math.ceil(allGeneratedKeywords.length / SIMILARITY_BATCH_SIZE),
            });

            // Process in batches to avoid overwhelming the system
            const keywordsWithSimilarity: Array<{ keyword: string; similarity: number }> = [];
            const similarityStartTime = Date.now();

            finalKeywords = await timeStage(
                'select-top-keywords-by-similarity',
                async () => {
                    // Process all keywords in parallel batches
                    let batchNum = 0;
                    for (let i = 0; i < allGeneratedKeywords.length; i += SIMILARITY_BATCH_SIZE) {
                        batchNum++;
                        const batch = allGeneratedKeywords.slice(i, i + SIMILARITY_BATCH_SIZE);
                        const batchStartTime = Date.now();

                        logger.debug(`[Similarity Batch ${batchNum}] Calculating similarities`, {
                            batchNum,
                            batchStart: i + 1,
                            batchEnd: Math.min(i + SIMILARITY_BATCH_SIZE, allGeneratedKeywords.length),
                            batchSize: batch.length,
                        });

                        // Process batch in parallel - all similarity calculations run concurrently
                        const batchResults = await Promise.all(
                            batch.map(async (keyword) => {
                                try {
                                    const similarity = await keywordVectorService.calculateTextSimilarity(pitch, keyword);
                                    return { keyword, similarity };
                                } catch (error) {
                                    logger.warn("Failed to calculate similarity for keyword", { keyword, error });
                                    return { keyword, similarity: 0.5 }; // Default score
                                }
                            })
                        );

                        // Send progress update during similarity calculation
                        if (progressCallback) {
                            const progressUpdate: ProgressUpdate = {
                                stage: 'selecting-top-keywords',
                                seedsGenerated: progress.seedsGenerated || 0,
                                keywordsGenerated: progress.keywordsGenerated || 0,
                                duplicatesFound: progress.duplicatesFound || 0,
                                existingKeywordsFound: progress.existingKeywordsFound || 0,
                                newKeywordsCollected: progress.newKeywordsCollected || 0,
                                currentSeed: `Calculating similarity for batch ${batchNum}/${Math.ceil(allGeneratedKeywords.length / SIMILARITY_BATCH_SIZE)}`,
                            };
                            progressCallback(progressUpdate);
                        }
                        keywordsWithSimilarity.push(...batchResults);

                        const batchDuration = Date.now() - batchStartTime;
                        logger.debug(`[Similarity Batch ${batchNum}] Completed`, {
                            batchNum,
                            duration: batchDuration,
                            avgTimePerKeyword: Math.round(batchDuration / batch.length),
                        });
                    }

                    // Sort by similarity (highest first) and take top targetCount
                    logger.info("Sorting keywords by similarity", {
                        totalKeywords: keywordsWithSimilarity.length,
                        targetCount,
                    });

                    keywordsWithSimilarity.sort((a, b) => b.similarity - a.similarity);

                    const topKeywords = keywordsWithSimilarity.slice(0, targetCount);
                    const similarityDuration = Date.now() - similarityStartTime;

                    logger.info("Similarity calculation complete", {
                        duration: similarityDuration,
                        topSimilarity: topKeywords[0]?.similarity.toFixed(3),
                        bottomSimilarity: topKeywords[topKeywords.length - 1]?.similarity.toFixed(3),
                        avgSimilarity: (topKeywords.reduce((sum, k) => sum + k.similarity, 0) / topKeywords.length).toFixed(3),
                    });

                    return topKeywords.map(item => item.keyword);
                },
                {
                    totalKeywords: allGeneratedKeywords.length,
                    targetCount,
                    batches: Math.ceil(allGeneratedKeywords.length / SIMILARITY_BATCH_SIZE)
                }
            );
        } else {
            // No pitch or not enough keywords to justify similarity calculation, just take first targetCount
            logger.info("Skipping similarity calculation, taking first N keywords", {
                hasPitch: !!pitch.trim(),
                keywordCount: allGeneratedKeywords.length,
                threshold: targetCount * SIMILARITY_THRESHOLD_MULTIPLIER,
                reason: !pitch.trim() ? "No pitch provided" : `Not enough keywords (need ${targetCount * SIMILARITY_THRESHOLD_MULTIPLIER}, have ${allGeneratedKeywords.length})`,
            });
            finalKeywords = allGeneratedKeywords.slice(0, targetCount);
        }
    }

    progress.stage = 'complete';
    progress.newKeywordsCollected = finalKeywords.length;

    logger.info("STEP 3 COMPLETE: Final keyword selection finished", {
        finalCount: finalKeywords.length,
        targetCount,
        originalCount: allGeneratedKeywords.length,
        selectionMethod: allGeneratedKeywords.length > targetCount ? "similarity-based" : "all keywords",
    });

    // Update progress with full lists for final save (but truncated for display)
    progress.allKeywords = allKeywordsList.slice(-MAX_KEYWORDS_IN_MEMORY);
    progress.duplicates = duplicatesList.slice(-MAX_KEYWORDS_IN_MEMORY);
    progress.existingKeywords = existingKeywordsList.slice(-MAX_KEYWORDS_IN_MEMORY);
    progress.newKeywords = finalKeywords.slice(-MAX_KEYWORDS_IN_MEMORY);
    progress._listsTruncated = allKeywordsList.length > MAX_KEYWORDS_IN_MEMORY;

    progressCallback?.(progress);

    // Generate performance summary
    const totalPipelineTime = Date.now() - pipelineStartTime;
    const processedSeedsCount = progress.processedSeeds?.length || 0;
    const avgTimePerSeed = processedSeedsCount > 0 ? totalPipelineTime / processedSeedsCount : 0;

    // Group metrics by stage type
    const metricsByStage: Record<string, PerformanceMetric[]> = {};
    performanceMetrics.forEach(metric => {
        const stageType = metric.stage.split(':')[0]; // Get base stage name
        if (!metricsByStage[stageType]) {
            metricsByStage[stageType] = [];
        }
        metricsByStage[stageType].push(metric);
    });

    // Calculate totals per stage
    const stageTotals: Record<string, number> = {};
    Object.keys(metricsByStage).forEach(stage => {
        stageTotals[stage] = metricsByStage[stage].reduce((sum, m) => sum + m.duration, 0);
    });

    // Log comprehensive performance summary (always log, not just in DEBUG mode)
    logger.info("=== KEYWORD COLLECTION PIPELINE COMPLETE ===", {
        totalPipelineTime: `${totalPipelineTime}ms (${(totalPipelineTime / 1000).toFixed(2)}s)`,
        seedsProcessed: `${processedSeedsCount} / ${seedsWithSimilarity.length}`,
        keywordsGenerated: progress.keywordsGenerated,
        newKeywordsCollected: progress.newKeywordsCollected,
        duplicatesFound: progress.duplicatesFound,
        existingKeywordsFound: progress.existingKeywordsFound,
        avgTimePerSeed: processedSeedsCount > 0 ? `${avgTimePerSeed.toFixed(2)}ms` : undefined,
        finalKeywordsCount: finalKeywords.length,
        successRate: seedsWithSimilarity.length > 0 ? `${((processedSeedsCount / seedsWithSimilarity.length) * 100).toFixed(1)}%` : "0%",
        efficiency: {
            newKeywordsPerSeed: processedSeedsCount > 0 ? (progress.newKeywordsCollected / processedSeedsCount).toFixed(2) : "0",
            keywordsPerSeed: processedSeedsCount > 0 ? (progress.keywordsGenerated / processedSeedsCount).toFixed(2) : "0",
        },
    });

    // Log time breakdown by stage
    // Note: For concurrent operations, total time is sum of all parallel operations,
    // which can exceed wall-clock time. Percentage is calculated based on wall-clock time.
    const stageBreakdown: Record<string, { total: number; count: number; avg: number; percentage: string; note?: string }> = {};
    Object.keys(stageTotals).sort((a, b) => stageTotals[b] - stageTotals[a]).forEach(stage => {
        const total = stageTotals[stage];
        const count = metricsByStage[stage].length;
        const avg = count > 0 ? total / count : 0;
        // Calculate percentage based on wall-clock time, but note that concurrent operations
        // may have total time exceeding wall-clock time
        const percentage = totalPipelineTime > 0 ? (total / totalPipelineTime * 100).toFixed(1) : "0.0";
        const note = total > totalPipelineTime ? " (concurrent operations - sum exceeds wall-clock)" : undefined;
        stageBreakdown[stage] = { total, count, avg, percentage, ...(note && { note }) };
    });
    logger.info("Time breakdown by stage", { stageBreakdown });

    // Find slowest operations
    const slowestOps = [...performanceMetrics].sort((a, b) => b.duration - a.duration).slice(0, 10);
    if (slowestOps.length > 0) {
        logger.info("Top 10 slowest operations", {
            slowestOps: slowestOps.map((metric, index) => ({
                rank: index + 1,
                stage: metric.stage,
                duration: `${metric.duration}ms`,
            })),
        });
    }

    // Return result with full lists stored in progress for saving
    // Note: progress lists are truncated for display, but we store full lists separately
    return {
        keywords: finalKeywords,
        progress: {
            ...progress,
            // Store full lists in progress for saving (routes.ts will extract them)
            // These will be used by progressToSaveFormat
            allKeywords: allKeywordsList, // Full list
            duplicates: duplicatesList, // Full list
            existingKeywords: existingKeywordsList, // Full list
            newKeywords: finalKeywords, // Full list
            _listsTruncated: false, // Full lists are not truncated
        },
    };
}

/**
 * Convert ProgressUpdate to KeywordGenerationProgress for saving
 * 
 * Note: This function needs to receive full lists, not truncated ones.
 * The progress parameter may have truncated lists for display, but we need full lists for database storage.
 * The caller should pass full lists as separate parameters.
 */
export function progressToSaveFormat(
    progress: ProgressUpdate,
    newKeywords: string[],
    allKeywords?: string[],
    duplicates?: string[],
    existingKeywords?: string[]
): KeywordGenerationProgress {
    // Use full lists if provided, otherwise use progress lists (may be truncated)
    // In practice, the collector should pass full lists via the separate parameters
    return {
        currentStage: progress.stage,
        stage: progress.stage, // Legacy field for backward compatibility
        seedsGenerated: progress.seedsGenerated,
        keywordsGenerated: progress.keywordsGenerated,
        duplicatesFound: progress.duplicatesFound,
        existingKeywordsFound: progress.existingKeywordsFound,
        newKeywordsCollected: progress.newKeywordsCollected,
        seeds: progress.seeds,
        // Save full lists (use provided full lists or fall back to progress lists)
        allKeywords: allKeywords || progress.allKeywords || [],
        duplicates: duplicates || progress.duplicates || [],
        existingKeywords: existingKeywords || progress.existingKeywords || [],
        newKeywords: newKeywords, // Full list passed as parameter
        completedAt: progress.stage === 'complete' ? new Date().toISOString() : undefined,
        processedSeeds: progress.processedSeeds,
        seedSimilarities: progress.seedSimilarities,
    };
}

