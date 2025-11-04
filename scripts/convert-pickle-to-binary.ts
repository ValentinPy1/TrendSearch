import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

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

async function convertPickleToBinary() {
  console.log('=== Converting Pickle Database to Binary Chunks ===\n');

  const CHUNK_SIZE = 2000;
  const EMBEDDING_DIM = 384;

  // Use Python to extract embeddings from pickle
  console.log('[1/4] Extracting embeddings from pickle file...');
  const pythonScript = `
import pickle
import numpy as np
import json

# Load pickle file
with open('new_keywords/vector_database.pkl', 'rb') as f:
    data = pickle.load(f)

embeddings = data['embeddings']
keywords = data['keywords']

# Convert embeddings to list for JSON serialization
embeddings_list = embeddings.tolist()

# Save keywords
with open('new_keywords/keywords_list.json', 'w') as f:
    json.dump(keywords, f)

print(f"Extracted {len(keywords)} keywords and embeddings with shape {embeddings.shape}")
`;

  try {
    execSync(`python3 -c "${pythonScript.replace(/\n/g, ' ')}"`, { cwd: process.cwd(), stdio: 'inherit' });
  } catch (error) {
    console.error('Error extracting from pickle:', error);
    throw error;
  }

  // Load keywords from JSON
  const keywordsJsonPath = path.join(process.cwd(), 'new_keywords', 'keywords_list.json');
  const keywords: string[] = JSON.parse(fs.readFileSync(keywordsJsonPath, 'utf-8'));
  console.log(`✓ Loaded ${keywords.length} keywords\n`);

  // Create embeddings directory
  const embeddingsDir = path.join(process.cwd(), 'data', 'embeddings_chunks');
  if (!fs.existsSync(embeddingsDir)) {
    fs.mkdirSync(embeddingsDir, { recursive: true });
  }

  // Load embeddings from pickle and convert to chunks
  console.log('[2/4] Loading embeddings and converting to binary chunks...');
  const loadEmbeddingsScript = `
import pickle
import numpy as np
import json

# Load pickle file
with open('new_keywords/vector_database.pkl', 'rb') as f:
    data = pickle.load(f)

embeddings = data['embeddings']

# Save as binary file that Node.js can read
# We'll use numpy to save, then Node will read it
embeddings_bytes = embeddings.astype(np.float32).tobytes()

with open('new_keywords/embeddings.bin', 'wb') as f:
    f.write(embeddings_bytes)

print(f"Saved embeddings binary: {len(embeddings_bytes)} bytes")
`;

  try {
    execSync(`python3 -c "${loadEmbeddingsScript.replace(/\n/g, ' ')}"`, { cwd: process.cwd(), stdio: 'inherit' });
  } catch (error) {
    console.error('Error saving embeddings binary:', error);
    throw error;
  }

  // Read embeddings binary file
  const embeddingsBinPath = path.join(process.cwd(), 'new_keywords', 'embeddings.bin');
  const embeddingsBuffer = fs.readFileSync(embeddingsBinPath);
  const float32Array = new Float32Array(embeddingsBuffer.buffer, embeddingsBuffer.byteOffset, embeddingsBuffer.byteLength / 4);
  
  const totalKeywords = keywords.length;
  const expectedFloats = totalKeywords * EMBEDDING_DIM;
  
  if (float32Array.length !== expectedFloats) {
    throw new Error(`Embeddings size mismatch: expected ${expectedFloats} floats, got ${float32Array.length}`);
  }

  console.log(`✓ Loaded ${totalKeywords} embeddings (${(float32Array.length * 4 / 1024 / 1024).toFixed(2)} MB)\n`);

  // Split into chunks and save
  console.log('[3/4] Splitting into binary chunks...');
  const chunks: ChunkMetadata[] = [];
  const keywordIndex: { keyword: string; chunk_id: number; local_index: number }[] = [];
  
  const totalChunks = Math.ceil(totalKeywords / CHUNK_SIZE);
  
  for (let chunkId = 0; chunkId < totalChunks; chunkId++) {
    const startIndex = chunkId * CHUNK_SIZE;
    const endIndex = Math.min(startIndex + CHUNK_SIZE, totalKeywords);
    const chunkKeywordCount = endIndex - startIndex;
    
    console.log(`  Chunk ${chunkId + 1}/${totalChunks}: Keywords ${startIndex}-${endIndex - 1}...`);
    
    // Extract chunk embeddings
    const chunkFloat32Array = new Float32Array(chunkKeywordCount * EMBEDDING_DIM);
    const sourceStart = startIndex * EMBEDDING_DIM;
    const sourceEnd = sourceStart + (chunkKeywordCount * EMBEDDING_DIM);
    
    for (let i = 0; i < chunkKeywordCount * EMBEDDING_DIM; i++) {
      chunkFloat32Array[i] = float32Array[sourceStart + i];
    }
    
    // Save chunk
    const chunkFileName = `chunk_${chunkId.toString().padStart(3, '0')}.bin`;
    const chunkPath = path.join(embeddingsDir, chunkFileName);
    fs.writeFileSync(chunkPath, Buffer.from(chunkFloat32Array.buffer));
    
    // Build keyword index
    for (let i = 0; i < chunkKeywordCount; i++) {
      keywordIndex.push({
        keyword: keywords[startIndex + i],
        chunk_id: chunkId,
        local_index: i,
      });
    }
    
    const chunkSizeKB = Math.round(fs.statSync(chunkPath).size / 1024);
    console.log(`  ✓ Saved chunk ${chunkId} (${chunkSizeKB} KB)`);
    
    chunks.push({
      chunk_id: chunkId,
      start_index: startIndex,
      end_index: endIndex - 1,
      keyword_count: chunkKeywordCount,
      file_path: chunkFileName,
    });
  }
  
  console.log(`✓ Generated ${chunks.length} binary chunks\n`);

  // Save metadata
  console.log('[4/4] Saving metadata...');
  const metadata: EmbeddingsMetadata = {
    version: '3.0.0',
    created_at: new Date().toISOString(),
    total_keywords: totalKeywords,
    embedding_dimensions: EMBEDDING_DIM,
    chunk_size: CHUNK_SIZE,
    chunks,
    keywords: keywordIndex,
  };
  
  const metadataPath = path.join(process.cwd(), 'data', 'embeddings_metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  
  const metadataSizeKB = Math.round(fs.statSync(metadataPath).size / 1024);
  console.log(`✓ Saved metadata (${metadataSizeKB} KB)\n`);

  // Cleanup temporary files
  try {
    fs.unlinkSync(keywordsJsonPath);
    fs.unlinkSync(embeddingsBinPath);
  } catch (error) {
    console.warn('Warning: Could not cleanup temporary files:', error);
  }

  // Calculate total size
  const totalSize = chunks.reduce((sum, chunk) => {
    const chunkPath = path.join(embeddingsDir, chunk.file_path);
    return sum + fs.statSync(chunkPath).size;
  }, 0);
  
  const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);

  console.log('=== Conversion Complete ===');
  console.log(`Total keywords: ${totalKeywords}`);
  console.log(`Total chunks: ${chunks.length}`);
  console.log(`Chunk size: ${CHUNK_SIZE} keywords`);
  console.log(`Embedding dimensions: ${EMBEDDING_DIM}`);
  console.log(`Total binary size: ${totalSizeMB} MB`);
  console.log(`Metadata size: ${metadataSizeKB} KB`);
}

convertPickleToBinary().catch(error => {
  console.error('Error converting pickle to binary:', error);
  process.exit(1);
});

