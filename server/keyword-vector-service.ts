import { pipeline } from '@xenova/transformers';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

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
    private embeddings: Float32Array[] = [];
    private extractor: any = null;
    private initialized = false;
    private initializationPromise: Promise<void> | null = null;
    private precomputedMetrics: Map<string, PrecomputedOpportunityMetrics> | null = null;
    private preprocessedKeywords: Map<string, ProcessedKeywordData> | null = null;

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
        try {
            this.keywords = [];
            this.embeddings = [];
            this.extractor = null;
            this.initialized = false;

            console.log('[KeywordVectorService] Loading binary chunk embeddings...');

            // Load metadata
            const metadataPath = path.join(process.cwd(), 'data', 'embeddings_metadata.json');
            if (!fs.existsSync(metadataPath)) {
                throw new Error(`Embeddings metadata not found at ${metadataPath}. Run: npx tsx scripts/build-binary-embeddings.ts`);
            }

            const metadata: EmbeddingsMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
            console.log(`[KeywordVectorService] Found ${metadata.total_keywords} keywords in ${metadata.chunks.length} binary chunks`);

            // Load keywords from CSV (new keywords dataset with 4 years of data)
            const csvPath = path.join(process.cwd(), 'new_keywords', 'keywords_data.csv');
            const csvContent = fs.readFileSync(csvPath, 'utf-8');
            this.keywords = parse(csvContent, {
                columns: true,
                skip_empty_lines: true,
                cast: (value, context) => {
                    if (context.column && value === '') return null;
                    if (!isNaN(Number(value))) return Number(value);
                    return value;
                },
            }) as KeywordData[];

            // Sanity check: verify CSV matches metadata
            if (this.keywords.length !== metadata.total_keywords) {
                throw new Error(`CSV/metadata mismatch: ${this.keywords.length} keywords in CSV but ${metadata.total_keywords} in metadata`);
            }

            console.log(`[KeywordVectorService] Loaded ${this.keywords.length} keywords from CSV`);

            // Load precomputed opportunity metrics (if available)
            this.loadPrecomputedMetrics();

            // Load binary chunks
            const embeddingsDir = path.join(process.cwd(), 'data', 'embeddings_chunks');
            this.embeddings = new Array(metadata.total_keywords);

            for (const chunk of metadata.chunks) {
                const chunkPath = path.join(embeddingsDir, chunk.file_path);
                if (!fs.existsSync(chunkPath)) {
                    throw new Error(`Binary chunk not found: ${chunkPath}`);
                }

                const buffer = fs.readFileSync(chunkPath);
                const float32Array = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);

                // Verify chunk size matches metadata
                const expectedSize = chunk.keyword_count * metadata.embedding_dimensions;
                if (float32Array.length !== expectedSize) {
                    throw new Error(`Chunk ${chunk.chunk_id} size mismatch: expected ${expectedSize} floats, got ${float32Array.length}`);
                }

                // Extract individual embeddings from this chunk
                for (let i = 0; i < chunk.keyword_count; i++) {
                    const globalIndex = chunk.start_index + i;
                    const embeddingStart = i * metadata.embedding_dimensions;
                    const embeddingEnd = embeddingStart + metadata.embedding_dimensions;
                    this.embeddings[globalIndex] = float32Array.slice(embeddingStart, embeddingEnd);
                }
            }

            console.log(`[KeywordVectorService] Loaded ${this.embeddings.length} binary embeddings (${(this.embeddings.length * 384 * 4 / 1024 / 1024).toFixed(2)} MB)`);

            // Initialize sentence transformer for query encoding
            console.log('[KeywordVectorService] Initializing sentence transformer for queries...');
            this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

            this.initialized = true;
            console.log('[KeywordVectorService] Initialization complete!');
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

    async isKeyword(text: string, threshold: number = 0.95): Promise<boolean> {
        if (!this.initialized) {
            await this.initialize();
        }

        // First check for exact match (fast path)
        const normalizedText = text.toLowerCase().trim();
        const exactMatch = this.keywords.some(k => k.keyword.toLowerCase() === normalizedText);
        if (exactMatch) return true;

        // Check similarity score (slower but catches near-matches)
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

        // Defensive check: ensure embeddings and keywords are in sync
        if (this.embeddings.length !== this.keywords.length) {
            throw new Error(
                `Data corruption detected: ${this.embeddings.length} embeddings but ${this.keywords.length} keywords. Reinitialize the service.`
            );
        }

        // Generate query embedding
        const queryOutput = await this.extractor(query, { pooling: 'mean', normalize: true });
        const queryEmbedding = new Float32Array(queryOutput.data);

        // Calculate cosine similarities across all keywords
        const similarities: Array<{ index: number; score: number }> = [];

        for (let i = 0; i < this.embeddings.length; i++) {
            const similarity = this.cosineSimilarity(queryEmbedding, this.embeddings[i]);
            similarities.push({ index: i, score: similarity });
        }

        // Sort by similarity score (descending)
        similarities.sort((a, b) => b.score - a.score);

        // Return top N results
        const topResults = similarities.slice(0, topN);
        return topResults.map(({ index, score }) => ({
            ...this.keywords[index],
            similarityScore: score,
        }));
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

        // Generate query embedding
        const queryOutput = await this.extractor(query, { pooling: 'mean', normalize: true });
        const queryEmbedding = new Float32Array(queryOutput.data);

        // Calculate similarities for the specified keywords
        const similarities: Array<{ index: number; score: number }> = [];

        for (const index of keywordIndices) {
            if (index >= 0 && index < this.embeddings.length) {
                const similarity = this.cosineSimilarity(queryEmbedding, this.embeddings[index]);
                similarities.push({ index, score: similarity });
            }
        }

        // Sort by similarity score (descending)
        similarities.sort((a, b) => b.score - a.score);

        // Return keywords with similarity scores
        return similarities.map(({ index, score }) => ({
            ...this.keywords[index],
            similarityScore: score,
        }));
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
