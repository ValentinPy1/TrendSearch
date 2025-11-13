import { pipeline } from '@xenova/transformers';
import * as fs from 'fs';
import * as path from 'path';
import postgres from 'postgres';

interface KeywordData {
    keyword: string;
    search_volume?: number;
    competition?: number;
    low_top_of_page_bid?: number;
    high_top_of_page_bid?: number;
    cpc?: number;
    // 48 months of data (2021_11 to 2025_09)
    '2021_11'?: number;
    '2021_12'?: number;
    '2022_01'?: number;
    '2022_02'?: number;
    '2022_03'?: number;
    '2022_04'?: number;
    '2022_05'?: number;
    '2022_06'?: number;
    '2022_07'?: number;
    '2022_08'?: number;
    '2022_09'?: number;
    '2022_10'?: number;
    '2022_11'?: number;
    '2022_12'?: number;
    '2023_01'?: number;
    '2023_02'?: number;
    '2023_03'?: number;
    '2023_04'?: number;
    '2023_05'?: number;
    '2023_06'?: number;
    '2023_07'?: number;
    '2023_08'?: number;
    '2023_09'?: number;
    '2023_10'?: number;
    '2023_11'?: number;
    '2023_12'?: number;
    '2024_01'?: number;
    '2024_02'?: number;
    '2024_03'?: number;
    '2024_04'?: number;
    '2024_05'?: number;
    '2024_06'?: number;
    '2024_07'?: number;
    '2024_08'?: number;
    '2024_09'?: number;
    '2024_10'?: number;
    '2024_11'?: number;
    '2024_12'?: number;
    '2025_01'?: number;
    '2025_02'?: number;
    '2025_03'?: number;
    '2025_04'?: number;
    '2025_05'?: number;
    '2025_06'?: number;
    '2025_07'?: number;
    '2025_08'?: number;
    '2025_09'?: number;
    growth_3m?: number;
    growth_YoY?: number;
    volatility?: number;
    trend_strength?: number;
    avg_top_page_bid?: number;
    bid_efficiency?: number;
    TAC?: number;
    SAC?: number;
    opportunity_score?: number;
}

interface ProcessedKeywordData {
    monthlyData: Array<{ month: string; volume: number }>;
    volume: number;
    competition: number;
    cpc: string;
    topPageBid: string;
    growth3m: string;
    growthYoy: string;
    growthSlope: string;
    growthR2: string;
    growthConsistency: string;
    growthStability: string;
    sustainedGrowthScore: string;
}

interface PrecomputedOpportunityMetrics {
    volatility: number;
    trendStrength: number;
    bidEfficiency: number;
    tac: number;
    sac: number;
    opportunityScore: number;
}

interface KeywordWithScore extends KeywordData {
    similarityScore: number;
    precomputedMetrics?: PrecomputedOpportunityMetrics;
    preprocessedData?: ProcessedKeywordData;
}

interface ChunkMetadata {
    chunk_id: number;
    start_index: number;
    end_index: number;
    keyword_count: number;
    file_path: string;
}

interface EmbeddingsMetadata {
    version: string;
    created_at: string;
    total_keywords: number;
    embedding_dimensions: number;
    chunk_size: number;
    chunks: ChunkMetadata[];
    keywords: { keyword: string; chunk_id: number; local_index: number }[];
}

class KeywordVectorService {
    private keywords: KeywordData[] = [];
    private extractor: any = null;
    private initialized = false;
    private initializationPromise: Promise<void> | null = null;
    private precomputedMetrics: Map<string, PrecomputedOpportunityMetrics> | null = null;
    private preprocessedKeywords: Map<string, ProcessedKeywordData> | null = null;
    private keywordSet: Set<string> | null = null; // Fast O(1) exact match lookup
    private pgClient: ReturnType<typeof postgres> | null = null;

    async initialize() {
        if (this.initialized) return;

        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = this.doInitialize()
            .catch(error => {
                this.initializationPromise = null;
                console.error('[KeywordVectorService] Initialization failed:', error);
                throw new Error(`Failed to initialize keyword vector service: ${error.message}`);
            });

        return this.initializationPromise;
    }

    private async doInitialize() {
        let pgClientCreated = false;
        try {
            this.keywords = [];
            this.extractor = null;
            this.initialized = false;

            console.log('[KeywordVectorService] Loading keywords from Supabase...');

            // Initialize postgres client for raw SQL queries
            if (!process.env.DATABASE_URL) {
                throw new Error('DATABASE_URL environment variable is required');
            }

            this.pgClient = postgres(process.env.DATABASE_URL, {
                max: 1,
                idle_timeout: 20,
                connect_timeout: 30,
                max_lifetime: 60 * 30,
                ssl: 'require',
                prepare: false,
            });
            pgClientCreated = true;

            // Load keywords from database with increased timeout
            // Use pgClient directly for better timeout control
            // Remove ORDER BY to speed up query (not needed for Set lookups)
            // Use transaction to set statement_timeout for this query only
            const keywordRows = await this.pgClient.begin(async (sql) => {
                await sql`SET LOCAL statement_timeout = '5min'`;
                return await sql`
                    SELECT 
                        keyword,
                        search_volume,
                        competition,
                        low_top_of_page_bid,
                        high_top_of_page_bid,
                        cpc,
                        monthly_data,
                        growth_3m,
                        growth_yoy,
                        volatility,
                        trend_strength,
                        avg_top_page_bid,
                        bid_efficiency,
                        tac,
                        sac,
                        opportunity_score
                    FROM keyword_embeddings
                `;
            });

            // Convert database rows to KeywordData format
            this.keywords = keywordRows.map((row: any) => {
                const keyword: KeywordData = {
                    keyword: row.keyword,
                    search_volume: row.search_volume,
                    competition: row.competition,
                    low_top_of_page_bid: row.low_top_of_page_bid ? Number(row.low_top_of_page_bid) : undefined,
                    high_top_of_page_bid: row.high_top_of_page_bid ? Number(row.high_top_of_page_bid) : undefined,
                    cpc: row.cpc ? Number(row.cpc) : undefined,
                    growth_3m: row.growth_3m ? Number(row.growth_3m) : undefined,
                    growth_YoY: row.growth_yoy ? Number(row.growth_yoy) : undefined,
                    volatility: row.volatility ? Number(row.volatility) : undefined,
                    trend_strength: row.trend_strength ? Number(row.trend_strength) : undefined,
                    avg_top_page_bid: row.avg_top_page_bid ? Number(row.avg_top_page_bid) : undefined,
                    bid_efficiency: row.bid_efficiency ? Number(row.bid_efficiency) : undefined,
                    TAC: row.tac ? Number(row.tac) : undefined,
                    SAC: row.sac ? Number(row.sac) : undefined,
                    opportunity_score: row.opportunity_score ? Number(row.opportunity_score) : undefined,
                };

                // Convert monthly_data JSONB to individual month columns if needed
                if (row.monthly_data && Array.isArray(row.monthly_data)) {
                    row.monthly_data.forEach((item: { month: string; volume: number }) => {
                        if (item.month && item.volume !== null && item.volume !== undefined) {
                            (keyword as any)[item.month] = item.volume;
                        }
                    });
                }

                return keyword;
            });

            console.log(`[KeywordVectorService] Loaded ${this.keywords.length} keywords from Supabase`);

            // Build Set for fast exact match lookups
            this.keywordSet = new Set(this.keywords.map(k => k.keyword.toLowerCase().trim()));
            console.log(`[KeywordVectorService] Built keyword Set for fast lookups (${this.keywordSet.size} keywords)`);

            // Load precomputed opportunity metrics (if available)
            this.loadPrecomputedMetrics();

            // Initialize sentence transformer for query encoding
            console.log('[KeywordVectorService] Initializing sentence transformer for queries...');
            this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

            this.initialized = true;
            console.log('[KeywordVectorService] Initialization complete!');
        } catch (error) {
            // Clean up pgClient if it was created but initialization failed
            if (pgClientCreated && this.pgClient) {
                try {
                    await this.pgClient.end();
                } catch (cleanupError) {
                    // Ignore cleanup errors - connection may already be closed
                    console.warn('[KeywordVectorService] Error cleaning up pgClient:', cleanupError);
                }
                this.pgClient = null;
            }
            // Reset state on error
            this.keywords = [];
            this.extractor = null;
            this.initialized = false;
            throw error;
        } finally {
            this.initializationPromise = null;
        }
    }

    /**
     * Load precomputed opportunity metrics and processed keyword data from JSON file (if exists)
     */
    private loadPrecomputedMetrics(): void {
        try {
            const metricsPath = path.join(process.cwd(), 'data', 'precomputed_opportunity_metrics.json');
            if (fs.existsSync(metricsPath)) {
                const dataContent = fs.readFileSync(metricsPath, 'utf-8');
                const allData: any = JSON.parse(dataContent);

                // Extract opportunity metrics and processed data
                this.precomputedMetrics = new Map();
                this.preprocessedKeywords = new Map();

                for (const [keyword, data] of Object.entries(allData)) {
                    if (!data || typeof data !== 'object') continue;

                    // Handle new format: { opportunityMetrics: {...}, processed: {...} }
                    if ('opportunityMetrics' in data && data.opportunityMetrics && typeof data.opportunityMetrics === 'object') {
                        this.precomputedMetrics.set(keyword, data.opportunityMetrics as PrecomputedOpportunityMetrics);
                        if ('processed' in data && data.processed && typeof data.processed === 'object') {
                            this.preprocessedKeywords.set(keyword, data.processed as ProcessedKeywordData);
                        }
                    }
                    // Handle old format: { volatility: ..., trendStrength: ..., ... } (backward compatibility)
                    else if ('volatility' in data) {
                        this.precomputedMetrics.set(keyword, data as PrecomputedOpportunityMetrics);
                    }
                }

                console.log(`[KeywordVectorService] Loaded precomputed metrics for ${this.precomputedMetrics.size} keywords`);
                console.log(`[KeywordVectorService] Loaded preprocessed data for ${this.preprocessedKeywords.size} keywords`);
            } else {
                console.log(`[KeywordVectorService] Precomputed data not found at ${metricsPath} (run: npx tsx scripts/precompute-opportunity-metrics.ts)`);
                this.precomputedMetrics = null;
                this.preprocessedKeywords = null;
            }
        } catch (error) {
            console.warn(`[KeywordVectorService] Failed to load precomputed data:`, error);
            this.precomputedMetrics = null;
            this.preprocessedKeywords = null;
        }
    }

    private cosineSimilarity(a: Float32Array, b: Float32Array): number {
        let dotProduct = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
        }
        return dotProduct;
    }

    async isKeyword(text: string, threshold: number = 0.95, exactMatchOnly: boolean = false): Promise<boolean> {
        if (!this.initialized) {
            await this.initialize();
        }

        // Fast exact match check using Set (O(1) lookup)
        const normalizedText = text.toLowerCase().trim();
        if (this.keywordSet && this.keywordSet.has(normalizedText)) {
            return true;
        }

        // For keyword generation/deduplication, we only care about exact matches
        // Skip expensive similarity search for non-existing keywords
        if (exactMatchOnly) {
            return false;
        }

        // Check similarity score (slower but catches near-matches)
        // Only do this for fuzzy matching scenarios, not for keyword generation
        const results = await this.findSimilarKeywords(text, 1);
        if (results.length > 0 && results[0].similarityScore >= threshold) {
            return true;
        }

        return false;
    }

    /**
     * Calculate cosine similarity between two text strings
     * Returns a value between -1 and 1, where 1 is most similar
     */
    async calculateTextSimilarity(text1: string, text2: string): Promise<number> {
        if (!this.initialized) {
            await this.initialize();
        }

        // Generate embeddings for both texts
        const output1 = await this.extractor(text1, { pooling: 'mean', normalize: true });
        const embedding1 = new Float32Array(output1.data);

        const output2 = await this.extractor(text2, { pooling: 'mean', normalize: true });
        const embedding2 = new Float32Array(output2.data);

        // Calculate cosine similarity
        return this.cosineSimilarity(embedding1, embedding2);
    }

    async findSimilarKeywords(query: string, topN: number = 10): Promise<KeywordWithScore[]> {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.pgClient) {
            throw new Error('PostgreSQL client not initialized');
        }

        // Generate query embedding
        const queryOutput = await this.extractor(query, { pooling: 'mean', normalize: true });
        const queryEmbedding = new Float32Array(queryOutput.data);
        const embeddingArray = Array.from(queryEmbedding);

        // Call Supabase match_keywords function with error handling
        let results;
        try {
            results = await this.pgClient.unsafe(
                `SELECT * FROM match_keywords($1::vector(384), $2, $3)`,
                [`[${embeddingArray.join(',')}]`, 0.0, topN]
            );
        } catch (error: any) {
            // If connection error, try to reinitialize
            if (error?.code === 'CONNECTION_CLOSED' || error?.code === 'UND_ERR_CONNECT_TIMEOUT' || error?.errno === 'CONNECTION_CLOSED' || error?.message?.includes('write')) {
                console.warn('[KeywordVectorService] Connection lost, reinitializing...');
                this.initialized = false;
                this.pgClient = null;
                await this.initialize();
                // Retry the query after reinitialization
                if (!this.pgClient) {
                    throw new Error('PostgreSQL client reinitialization failed');
                }
                results = await this.pgClient.unsafe(
                    `SELECT * FROM match_keywords($1::vector(384), $2, $3)`,
                    [`[${embeddingArray.join(',')}]`, 0.0, topN]
                );
            } else {
                throw error;
            }
        }

        // Convert database results to KeywordWithScore format
        return results.map((row: any) => {
            const keyword: KeywordWithScore = {
                keyword: row.keyword,
                search_volume: row.search_volume,
                competition: row.competition,
                low_top_of_page_bid: row.low_top_of_page_bid ? Number(row.low_top_of_page_bid) : undefined,
                high_top_of_page_bid: row.high_top_of_page_bid ? Number(row.high_top_of_page_bid) : undefined,
                cpc: row.cpc ? Number(row.cpc) : undefined,
                growth_3m: row.growth_3m ? Number(row.growth_3m) : undefined,
                growth_YoY: row.growth_yoy ? Number(row.growth_yoy) : undefined,
                volatility: row.volatility ? Number(row.volatility) : undefined,
                trend_strength: row.trend_strength ? Number(row.trend_strength) : undefined,
                avg_top_page_bid: row.avg_top_page_bid ? Number(row.avg_top_page_bid) : undefined,
                bid_efficiency: row.bid_efficiency ? Number(row.bid_efficiency) : undefined,
                TAC: row.tac ? Number(row.tac) : undefined,
                SAC: row.sac ? Number(row.sac) : undefined,
                opportunity_score: row.opportunity_score ? Number(row.opportunity_score) : undefined,
                similarityScore: Number(row.similarity),
            };

            // Convert monthly_data JSONB to individual month columns if needed
            if (row.monthly_data && Array.isArray(row.monthly_data)) {
                row.monthly_data.forEach((item: { month: string; volume: number }) => {
                    if (item.month && item.volume !== null && item.volume !== undefined) {
                        (keyword as any)[item.month] = item.volume;
                    }
                });
            }

            // Attach precomputed metrics if available
            if (this.precomputedMetrics) {
                const metrics = this.precomputedMetrics.get(row.keyword);
                if (metrics) {
                    keyword.precomputedMetrics = metrics;
                }
            }

            // Attach preprocessed data if available
            if (this.preprocessedKeywords) {
                const processed = this.preprocessedKeywords.get(row.keyword);
                if (processed) {
                    keyword.preprocessedData = processed;
                }
            }

            return keyword;
        });
    }

    /**
     * Get all keywords from the database (for counting/filtering across entire dataset)
     * Returns keywords with a similarityScore of 0 (not similarity-ranked)
     * Attaches precomputed metrics if available
     */
    async getAllKeywords(): Promise<KeywordWithScore[]> {
        if (!this.initialized) {
            await this.initialize();
        }

        // Return all keywords with similarityScore = 0 (not used for filtering by similarity)
        // Attach precomputed metrics and preprocessed data if available
        return this.keywords.map((kw) => {
            const result: KeywordWithScore = {
                ...kw,
                similarityScore: 0,
            };

            // Attach precomputed metrics if available
            if (this.precomputedMetrics) {
                const metrics = this.precomputedMetrics.get(kw.keyword);
                if (metrics) {
                    result.precomputedMetrics = metrics;
                }
            }

            // Attach preprocessed data if available
            if (this.preprocessedKeywords) {
                const processed = this.preprocessedKeywords.get(kw.keyword);
                if (processed) {
                    result.preprocessedData = processed;
                }
            }

            return result;
        });
    }

    /**
     * Calculate similarity scores for given keywords and sort by similarity
     * @param query The search query text
     * @param keywordIndices Array of keyword indices to calculate similarity for
     * @returns Keywords sorted by similarity (highest first)
     */
    async calculateSimilarityForKeywords(
        query: string,
        keywordIndices: number[],
    ): Promise<KeywordWithScore[]> {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.pgClient) {
            throw new Error('PostgreSQL client not initialized');
        }

        // Get the keywords by indices
        const targetKeywords = keywordIndices
            .filter(idx => idx >= 0 && idx < this.keywords.length)
            .map(idx => this.keywords[idx].keyword);

        if (targetKeywords.length === 0) {
            return [];
        }

        // Generate query embedding
        const queryOutput = await this.extractor(query, { pooling: 'mean', normalize: true });
        const queryEmbedding = new Float32Array(queryOutput.data);
        const embeddingArray = Array.from(queryEmbedding);

        // Query database for these specific keywords and calculate similarity
        // Build parameterized query with proper placeholders
        const placeholders = targetKeywords.map((_, i) => `LOWER($${i + 2})`).join(', ');
        const sqlQuery = `SELECT 
            ke.*,
            1 - (ke.embedding <=> $1::vector(384)) AS similarity
        FROM keyword_embeddings ke
        WHERE LOWER(ke.keyword) IN (${placeholders})
        ORDER BY ke.embedding <=> $1::vector(384)`;
        
        const results = await this.pgClient.unsafe(
            sqlQuery,
            [`[${embeddingArray.join(',')}]`, ...targetKeywords]
        );

        // Convert to KeywordWithScore format
        return results.map((row: any) => {
            const keyword: KeywordWithScore = {
                keyword: row.keyword,
                search_volume: row.search_volume,
                competition: row.competition,
                low_top_of_page_bid: row.low_top_of_page_bid ? Number(row.low_top_of_page_bid) : undefined,
                high_top_of_page_bid: row.high_top_of_page_bid ? Number(row.high_top_of_page_bid) : undefined,
                cpc: row.cpc ? Number(row.cpc) : undefined,
                growth_3m: row.growth_3m ? Number(row.growth_3m) : undefined,
                growth_YoY: row.growth_yoy ? Number(row.growth_yoy) : undefined,
                volatility: row.volatility ? Number(row.volatility) : undefined,
                trend_strength: row.trend_strength ? Number(row.trend_strength) : undefined,
                avg_top_page_bid: row.avg_top_page_bid ? Number(row.avg_top_page_bid) : undefined,
                bid_efficiency: row.bid_efficiency ? Number(row.bid_efficiency) : undefined,
                TAC: row.tac ? Number(row.tac) : undefined,
                SAC: row.sac ? Number(row.sac) : undefined,
                opportunity_score: row.opportunity_score ? Number(row.opportunity_score) : undefined,
                similarityScore: Number(row.similarity),
            };

            // Convert monthly_data JSONB to individual month columns if needed
            if (row.monthly_data && Array.isArray(row.monthly_data)) {
                row.monthly_data.forEach((item: { month: string; volume: number }) => {
                    if (item.month && item.volume !== null && item.volume !== undefined) {
                        (keyword as any)[item.month] = item.volume;
                    }
                });
            }

            return keyword;
        });
    }

    /**
     * Get keyword index by keyword text (for mapping filtered keywords back to indices)
     */
    getKeywordIndex(keywordText: string): number | null {
        const index = this.keywords.findIndex((kw) => kw.keyword === keywordText);
        return index >= 0 ? index : null;
    }

    /**
     * Get preprocessed keyword data by keyword text (for lookup in routes)
     */
    getPreprocessedKeyword(keywordText: string): ProcessedKeywordData | null {
        if (!this.preprocessedKeywords) {
            return null;
        }
        return this.preprocessedKeywords.get(keywordText) || null;
    }
}

export const keywordVectorService = new KeywordVectorService();
