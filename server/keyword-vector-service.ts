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
}

interface KeywordWithScore extends KeywordData {
  similarityScore: number;
}

class KeywordVectorService {
  private keywords: KeywordData[] = [];
  private embeddings: Float32Array[] = [];
  private extractor: any = null;
  private initialized = false;

  async initialize() {
    if (this.initialized) return;

    console.log('[KeywordVectorService] Loading keywords from CSV...');
    const csvPath = path.join(process.cwd(), 'data', 'keywords_data.csv');
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
    
    console.log(`[KeywordVectorService] Loaded ${this.keywords.length} keywords`);
    
    console.log('[KeywordVectorService] Initializing sentence transformer...');
    this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    
    console.log('[KeywordVectorService] Creating embeddings (this may take a minute)...');
    for (let i = 0; i < this.keywords.length; i++) {
      if (i % 500 === 0) {
        console.log(`[KeywordVectorService] Progress: ${i}/${this.keywords.length}`);
      }
      const output = await this.extractor(this.keywords[i].keyword, { pooling: 'mean', normalize: true });
      this.embeddings.push(new Float32Array(output.data));
    }
    
    this.initialized = true;
    console.log('[KeywordVectorService] Initialization complete!');
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
