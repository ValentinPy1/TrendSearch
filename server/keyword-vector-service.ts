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
  growth_slope?: number;
  growth_r2?: number;
  growth_consistency?: number;
  growth_stability?: number;
  sustained_growth_score?: number;
  priority_score?: number;
}

interface KeywordWithScore extends KeywordData {
  similarityScore: number;
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
      
      // Load keywords from CSV (all 80k keywords)
      const csvPath = path.join(process.cwd(), 'data', 'keywords_all.csv');
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
}

export const keywordVectorService = new KeywordVectorService();
