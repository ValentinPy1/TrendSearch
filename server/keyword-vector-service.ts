import { pipeline } from '@xenova/transformers';
import * as fs from 'fs';
import * as path from 'path';

interface KeywordData {
  keyword: string;
  search_volume?: number;
  competition?: number;
  low_top_of_page_bid?: number;
  high_top_of_page_bid?: number;
  cpc?: number;
  '2025_09'?: number;
  '2025_08'?: number;
  '2025_07'?: number;
  '2025_06'?: number;
  '2025_05'?: number;
  '2025_04'?: number;
  '2025_03'?: number;
  '2025_02'?: number;
  '2025_01'?: number;
  '2024_12'?: number;
  '2024_11'?: number;
  '2024_10'?: number;
  'yoy_trend_%'?: number;
  '3month_trend_%'?: number;
}

interface KeywordWithScore extends KeywordData {
  similarityScore: number;
}

interface PrebuiltVectorData {
  keywords: KeywordData[];
  embeddings: number[][];
  version: string;
  createdAt: string;
}

class KeywordVectorService {
  private keywords: KeywordData[] = [];
  private embeddings: Float32Array[] = [];
  private extractor: any = null;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;

  async initialize() {
    // If already initialized, return immediately
    if (this.initialized) return;
    
    // If initialization is in progress, wait for it to complete
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    
    // Start initialization and store the promise
    this.initializationPromise = this.doInitialize()
      .catch(error => {
        // Reset promise on failure so retries are possible
        this.initializationPromise = null;
        console.error('[KeywordVectorService] Initialization failed:', error);
        throw new Error(`Failed to initialize keyword vector service: ${error.message}`);
      });
    
    return this.initializationPromise;
  }

  private async doInitialize() {
    try {
      // Reset state to ensure clean slate for retries
      this.keywords = [];
      this.embeddings = [];
      this.extractor = null;
      this.initialized = false;
      
      console.log('[KeywordVectorService] Loading prebuilt vector database...');
      const embeddingsPath = path.join(process.cwd(), 'data', 'embeddings.json');
      
      if (!fs.existsSync(embeddingsPath)) {
        throw new Error(`Prebuilt embeddings file not found at ${embeddingsPath}. Run: npx tsx scripts/prebuild-embeddings.ts`);
      }
      
      const fileContent = fs.readFileSync(embeddingsPath, 'utf-8');
      const vectorData: PrebuiltVectorData = JSON.parse(fileContent);
      
      this.keywords = vectorData.keywords;
      this.embeddings = vectorData.embeddings.map(arr => new Float32Array(arr));
      
      if (this.keywords.length === 0 || this.embeddings.length === 0) {
        throw new Error('Prebuilt vector database is empty');
      }
      
      if (this.keywords.length !== this.embeddings.length) {
        throw new Error(`Prebuilt data mismatch: ${this.keywords.length} keywords but ${this.embeddings.length} embeddings`);
      }
      
      console.log(`[KeywordVectorService] Loaded ${this.keywords.length} keywords with prebuilt embeddings`);
      console.log(`[KeywordVectorService] Vector database version: ${vectorData.version}, created: ${vectorData.createdAt}`);
      
      console.log('[KeywordVectorService] Initializing sentence transformer for queries...');
      this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      
      this.initialized = true;
      console.log('[KeywordVectorService] Initialization complete!');
    } finally {
      // Clear promise regardless of success/failure to allow retries
      this.initializationPromise = null;
    }
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
    }
    return dotProduct;
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

    const queryOutput = await this.extractor(query, { pooling: 'mean', normalize: true });
    const queryEmbedding = new Float32Array(queryOutput.data);

    const similarities: Array<{ index: number; score: number }> = [];
    for (let i = 0; i < this.embeddings.length; i++) {
      const similarity = this.cosineSimilarity(queryEmbedding, this.embeddings[i]);
      similarities.push({ index: i, score: similarity });
    }

    similarities.sort((a, b) => b.score - a.score);

    const topResults = similarities.slice(0, topN);
    return topResults.map(({ index, score }) => ({
      ...this.keywords[index],
      similarityScore: score,
    }));
  }
}

export const keywordVectorService = new KeywordVectorService();
