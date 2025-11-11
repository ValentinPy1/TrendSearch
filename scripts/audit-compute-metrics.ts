#!/usr/bin/env tsx
/**
 * Standalone script to audit the compute metrics step using clinic.js
 * 
 * Usage:
 *   npm run audit:metrics <projectId>
 *   npm run audit:metrics:bubbleprof <projectId>
 *   npm run audit:metrics:flame <projectId>
 * 
 * Or directly:
 *   npx clinic doctor -- node --import tsx scripts/audit-compute-metrics.ts <projectId>
 *   npx clinic bubbleprof -- node --import tsx scripts/audit-compute-metrics.ts <projectId>
 *   npx clinic flame -- node --import tsx scripts/audit-compute-metrics.ts <projectId>
 */

// Load environment variables from .env file
import 'dotenv/config';

// In development, allow self-signed certificates for database connection
if (process.env.NODE_ENV === "development") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import { storage } from "../server/storage";
import { calculateVolatility, calculateTrendStrength } from "../server/opportunity-score";
import { logger } from "../server/utils/logger";

const BATCH_SIZE = 50; // Process 50 keywords concurrently
const PARALLEL_BATCH_COUNT = 4; // Process 4 batches in parallel
const DB_UPDATE_BATCH_SIZE = 100; // Update database in chunks of 100 records
const DB_UPDATE_CONCURRENCY = 2; // Process 2 database update batches concurrently

/**
 * Sort monthly data by date - extracted to make it visible in flame graph
 */
function sortMonthlyDataByDate(monthlyData: Array<{ month: string; volume: number }>) {
    return [...monthlyData].sort((a, b) => {
        const dateA = new Date(a.month);
        const dateB = new Date(b.month);
        return dateA.getTime() - dateB.getTime();
    });
}

/**
 * Calculate year-over-year growth - extracted to make it visible in flame graph
 */
function calculateYoYGrowth(sortedMonthlyData: Array<{ month: string; volume: number }>): number | null {
    if (sortedMonthlyData.length < 12) {
        return null;
    }
    const lastMonth = sortedMonthlyData[sortedMonthlyData.length - 1];
    const sameMonthLastYear = sortedMonthlyData[sortedMonthlyData.length - 12];
    return ((lastMonth.volume - sameMonthLastYear.volume) / (sameMonthLastYear.volume + 1)) * 100;
}

/**
 * Calculate three-month growth - extracted to make it visible in flame graph
 */
function calculateThreeMonthGrowth(sortedMonthlyData: Array<{ month: string; volume: number }>): number | null {
    if (sortedMonthlyData.length < 3) {
        return null;
    }
    const lastMonth = sortedMonthlyData[sortedMonthlyData.length - 1];
    const threeMonthsAgo = sortedMonthlyData[sortedMonthlyData.length - 3];
    if (threeMonthsAgo.volume > 0) {
        return ((lastMonth.volume - threeMonthsAgo.volume) / threeMonthsAgo.volume) * 100;
    }
    return null;
}

/**
 * Process items with concurrency control
 * Processes items in chunks of specified concurrency limit
 */
async function processWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    processor: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += concurrency) {
        const chunk = items.slice(i, i + concurrency);
        const chunkResults = await Promise.all(
            chunk.map((item, chunkIndex) => processor(item, i + chunkIndex))
        );
        results.push(...chunkResults);
    }
    
    return results;
}

/**
 * Compute metrics for a single keyword
 * Functions are extracted to make them visible in flame graphs
 */
async function computeKeywordMetrics(keyword: any) {
    try {
        if (!keyword.monthlyData || !Array.isArray(keyword.monthlyData) || keyword.monthlyData.length === 0) {
            return { success: false, reason: 'no_monthly_data', keywordId: keyword.id, metrics: null };
        }
        if (keyword.volume === null || keyword.volume === undefined) {
            return { success: false, reason: 'no_volume', keywordId: keyword.id, metrics: null };
        }

        // Sort monthly data - this function will be visible in flame graph
        const sortedMonthlyData = sortMonthlyDataByDate(keyword.monthlyData);

        if (sortedMonthlyData.length < 2) {
            return { success: false, reason: 'insufficient_data', keywordId: keyword.id, metrics: null };
        }

        // Calculate growth metrics - these functions will be visible in flame graph
        const yoyGrowth = calculateYoYGrowth(sortedMonthlyData);
        const threeMonthGrowth = calculateThreeMonthGrowth(sortedMonthlyData);

        // Calculate volatility and trend strength - these will be visible in flame graph
        const volatility = calculateVolatility(sortedMonthlyData);
        const growthYoyValue = yoyGrowth !== null ? yoyGrowth : 0;
        const trendStrength = calculateTrendStrength(growthYoyValue, volatility);

        // Return metrics instead of updating immediately
        return {
            success: true,
            keywordId: keyword.id,
            metrics: {
                growthYoy: yoyGrowth !== null ? yoyGrowth.toString() : null,
                growth3m: threeMonthGrowth !== null ? threeMonthGrowth.toString() : null,
                volatility: volatility.toString(),
                trendStrength: trendStrength.toString()
            }
        };
    } catch (error) {
        logger.error("Error computing metrics for keyword", error, {
            keywordId: keyword.id,
            keyword: keyword.keyword,
        });
        return { success: false, reason: 'error', keywordId: keyword.id, error, metrics: null };
    }
}

/**
 * Main function to compute metrics for all keywords in a project
 */
async function computeMetricsForProject(projectId: string) {
    const metricsStartTime = Date.now();
    logger.info("=== COMPUTE METRICS PIPELINE START ===", {
        projectId,
        timestamp: new Date().toISOString(),
    });

    const keywords = await storage.getProjectKeywords(projectId);

    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const totalKeywords = keywords.filter(kw => kw.monthlyData && Array.isArray(kw.monthlyData) && kw.monthlyData.length > 0 && kw.volume !== null).length;
    const totalBatches = Math.ceil(keywords.length / BATCH_SIZE);

    logger.info("Starting metrics computation", {
        totalKeywords: keywords.length,
        keywordsWithData: totalKeywords,
        batchSize: BATCH_SIZE,
        totalBatches,
        parallelBatches: PARALLEL_BATCH_COUNT,
    });

    // Create all batches upfront
    const batches: Array<{ batchNumber: number; keywords: any[]; startIndex: number }> = [];
    for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        batches.push({
            batchNumber,
            keywords: keywords.slice(i, i + BATCH_SIZE),
            startIndex: i,
        });
    }

    // Collect all database updates to process with limited concurrency
    const allUpdates: Array<{ keywordId: string; metrics: any }> = [];

    // Process batches in parallel chunks
    for (let i = 0; i < batches.length; i += PARALLEL_BATCH_COUNT) {
        const batchChunk = batches.slice(i, i + PARALLEL_BATCH_COUNT);
        const chunkUpdates: Array<{ keywordId: string; metrics: any }> = [];

        // Process this chunk of batches in parallel
        await processWithConcurrency(
            batchChunk,
            PARALLEL_BATCH_COUNT,
            async (batch) => {
                const batchStartTime = Date.now();
                const { batchNumber, keywords: batchKeywords, startIndex } = batch;

                logger.debug(`[Batch ${batchNumber}/${totalBatches}] Processing batch`, {
                    batchNumber,
                    totalBatches,
                    batchStart: startIndex + 1,
                    batchEnd: Math.min(startIndex + BATCH_SIZE, keywords.length),
                    batchSize: batchKeywords.length,
                });

                // Process batch concurrently - compute metrics
                const batchPromises = batchKeywords.map(computeKeywordMetrics);
                const batchResults = await Promise.all(batchPromises);

                // Collect updates for this batch
                const updatesToApply = batchResults
                    .filter(r => r.success && r.metrics)
                    .map(r => ({ keywordId: r.keywordId, metrics: r.metrics! }));
                
                chunkUpdates.push(...updatesToApply);

                const successful = batchResults.filter(r => r.success).length;
                const failed = batchResults.filter(r => !r.success);
                const skipped = failed.filter(r => r.reason !== 'error').length;
                const errors = failed.filter(r => r.reason === 'error').length;

                processedCount += successful;
                skippedCount += skipped;
                errorCount += errors;

                const batchDuration = Date.now() - batchStartTime;
                const avgTimePerKeyword = batchKeywords.length > 0 ? batchDuration / batchKeywords.length : 0;

                logger.info(`[Batch ${batchNumber}/${totalBatches}] Batch completed`, {
                    batchNumber,
                    totalBatches,
                    duration: `${batchDuration}ms (${(batchDuration / 1000).toFixed(2)}s)`,
                    avgTimePerKeyword: `${Math.round(avgTimePerKeyword)}ms`,
                    successful,
                    skipped,
                    errors,
                    cumulativeProgress: {
                        processed: processedCount,
                        skipped: skippedCount,
                        errors: errorCount,
                        total: totalKeywords,
                        progressPercent: totalKeywords > 0 ? `${((processedCount / totalKeywords) * 100).toFixed(1)}%` : "0%",
                    },
                });
            }
        );

        // Collect all updates to process later with limited concurrency
        allUpdates.push(...chunkUpdates);
    }

    // Process all database updates with limited concurrency to avoid overwhelming the database
    if (allUpdates.length > 0) {
        logger.debug("Performing bulk database updates", {
            totalUpdates: allUpdates.length,
            updateBatchSize: DB_UPDATE_BATCH_SIZE,
            updateConcurrency: DB_UPDATE_CONCURRENCY,
        });

        // Split updates into chunks
        const updateChunks: Array<Array<{ keywordId: string; metrics: any }>> = [];
        for (let i = 0; i < allUpdates.length; i += DB_UPDATE_BATCH_SIZE) {
            updateChunks.push(allUpdates.slice(i, i + DB_UPDATE_BATCH_SIZE));
        }

        // Process update chunks with limited concurrency
        await processWithConcurrency(
            updateChunks,
            DB_UPDATE_CONCURRENCY,
            async (updateChunk) => {
                await storage.bulkUpdateKeywordMetrics(updateChunk);
            }
        );
    }

    const metricsDuration = Date.now() - metricsStartTime;
    const avgTimePerKeyword = processedCount > 0 ? metricsDuration / processedCount : 0;

    logger.info("=== COMPUTE METRICS PIPELINE COMPLETE ===", {
        duration: `${metricsDuration}ms (${(metricsDuration / 1000).toFixed(2)}s)`,
        processed: processedCount,
        skipped: skippedCount,
        errors: errorCount,
        totalKeywords,
        avgTimePerKeyword: `${Math.round(avgTimePerKeyword)}ms`,
        successRate: totalKeywords > 0 ? `${((processedCount / totalKeywords) * 100).toFixed(1)}%` : "0%",
        timestamp: new Date().toISOString(),
    });

    return {
        processed: processedCount,
        skipped: skippedCount,
        errors: errorCount,
        totalKeywords,
        duration: metricsDuration,
    };
}

// Main execution
async function main() {
    // Handle uncaught errors gracefully
    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        process.exit(1);
    });

    const projectId = process.argv[2];

    if (!projectId) {
        console.error("Usage: node --import tsx scripts/audit-compute-metrics.ts <projectId>");
        process.exit(1);
    }

    // Warmup: Let module loading and initialization complete before profiling
    // This ensures the flame graph focuses on the actual compute work
    console.log("Warming up... (allowing module loading to complete)");
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("Starting compute metrics profiling...");

    try {
        const result = await computeMetricsForProject(projectId);
        console.log("\n=== Audit Complete ===");
        console.log(`Processed: ${result.processed} keywords`);
        console.log(`Skipped: ${result.skipped} keywords`);
        console.log(`Errors: ${result.errors} keywords`);
        console.log(`Total Duration: ${(result.duration / 1000).toFixed(2)}s`);

        // Give clinic.js time to flush trace events before exiting
        await new Promise(resolve => setTimeout(resolve, 500));

        process.exit(0);
    } catch (error) {
        console.error("Error during compute metrics audit:", error);
        // Give clinic.js time to flush even on error
        await new Promise(resolve => setTimeout(resolve, 500));
        process.exit(1);
    }
}

main();

