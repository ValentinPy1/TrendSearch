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
  priority_score?: number;
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

async function buildBinaryEmbeddings() {
  console.log('=== Building Binary Chunk Embeddings ===\n');

  const CHUNK_SIZE = 2000;
  const EMBEDDING_DIM = 384;

  // Load keywords
  console.log('[1/4] Loading keywords...');
  const csvPath = path.join(process.cwd(), 'new_keywords', 'keywords_data.csv');
  
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Keywords CSV file not found at ${csvPath}`);
  }
  
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  
  const keywords = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    cast: (value, context) => {
      if (context.column && value === '') return null;
      if (!isNaN(Number(value))) return Number(value);
      return value;
    },
  }) as KeywordData[];
  
  console.log(`✓ Loaded ${keywords.length} keywords\n`);

  // Initialize sentence transformer
  console.log('[2/4] Initializing sentence transformer model...');
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  console.log('✓ Model initialized\n');

  // Create embeddings directory
  const embeddingsDir = path.join(process.cwd(), 'data', 'embeddings_chunks');
  if (!fs.existsSync(embeddingsDir)) {
    fs.mkdirSync(embeddingsDir, { recursive: true });
  }

  // Generate embeddings in chunks
  console.log('[3/4] Generating embeddings in chunks...');
  const chunks: ChunkMetadata[] = [];
  const keywordIndex: { keyword: string; chunk_id: number; local_index: number }[] = [];
  
  const totalChunks = Math.ceil(keywords.length / CHUNK_SIZE);
  
  for (let chunkId = 0; chunkId < totalChunks; chunkId++) {
    const startIndex = chunkId * CHUNK_SIZE;
    const endIndex = Math.min(startIndex + CHUNK_SIZE, keywords.length);
    const chunkKeywords = keywords.slice(startIndex, endIndex);
    
    console.log(`  Chunk ${chunkId + 1}/${totalChunks}: Processing keywords ${startIndex}-${endIndex - 1}...`);
    
    // Generate embeddings for this chunk
    const chunkEmbeddings: number[][] = [];
    for (let i = 0; i < chunkKeywords.length; i++) {
      const output = await extractor(chunkKeywords[i].keyword, { pooling: 'mean', normalize: true });
      chunkEmbeddings.push(Array.from(output.data));
      
      // Build keyword index
      keywordIndex.push({
        keyword: chunkKeywords[i].keyword,
        chunk_id: chunkId,
        local_index: i,
      });
    }
    
    // Convert to Float32Array and save as binary
    const float32Array = new Float32Array(chunkEmbeddings.length * EMBEDDING_DIM);
    for (let i = 0; i < chunkEmbeddings.length; i++) {
      for (let j = 0; j < EMBEDDING_DIM; j++) {
        float32Array[i * EMBEDDING_DIM + j] = chunkEmbeddings[i][j];
      }
    }
    
    const chunkFileName = `chunk_${chunkId.toString().padStart(3, '0')}.bin`;
    const chunkPath = path.join(embeddingsDir, chunkFileName);
    fs.writeFileSync(chunkPath, Buffer.from(float32Array.buffer));
    
    const chunkSizeKB = Math.round(fs.statSync(chunkPath).size / 1024);
    console.log(`  ✓ Saved chunk ${chunkId} (${chunkSizeKB} KB)`);
    
    chunks.push({
      chunk_id: chunkId,
      start_index: startIndex,
      end_index: endIndex - 1,
      keyword_count: chunkKeywords.length,
      file_path: chunkFileName,
    });
  }
  
  console.log(`✓ Generated ${chunks.length} binary chunks\n`);

  // Save metadata
  console.log('[4/4] Saving metadata...');
  const metadata: EmbeddingsMetadata = {
    version: '2.0.0',
    created_at: new Date().toISOString(),
    total_keywords: keywords.length,
    embedding_dimensions: EMBEDDING_DIM,
    chunk_size: CHUNK_SIZE,
    chunks,
    keywords: keywordIndex,
  };
  
  const metadataPath = path.join(process.cwd(), 'data', 'embeddings_metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  
  const metadataSizeKB = Math.round(fs.statSync(metadataPath).size / 1024);
  console.log(`✓ Saved metadata (${metadataSizeKB} KB)\n`);

  // Calculate total size
  const totalSize = chunks.reduce((sum, chunk) => {
    const chunkPath = path.join(embeddingsDir, chunk.file_path);
    return sum + fs.statSync(chunkPath).size;
  }, 0);
  
  const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);

  console.log('=== Build Complete ===');
  console.log(`Total keywords: ${keywords.length}`);
  console.log(`Total chunks: ${chunks.length}`);
  console.log(`Chunk size: ${CHUNK_SIZE} keywords`);
  console.log(`Embedding dimensions: ${EMBEDDING_DIM}`);
  console.log(`Total binary size: ${totalSizeMB} MB`);
  console.log(`Metadata size: ${metadataSizeKB} KB`);
}

buildBinaryEmbeddings().catch(error => {
  console.error('Error building binary embeddings:', error);
  process.exit(1);
});
