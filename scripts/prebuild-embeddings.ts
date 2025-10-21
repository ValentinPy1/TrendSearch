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

interface PrebuiltVectorData {
  keywords: KeywordData[];
  embeddings: number[][];
  version: string;
  createdAt: string;
}

async function prebuildEmbeddings() {
  console.log('=== Prebuilding Vector Database ===');
  console.log('This will take 30-60 seconds...\n');

  // Load keywords from CSV
  console.log('[1/4] Loading keywords from CSV...');
  const csvPath = path.join(process.cwd(), 'data', 'keywords_data.csv');
  
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

  // Initialize sentence transformer model
  console.log('[2/4] Initializing sentence transformer model...');
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  console.log('✓ Model initialized\n');

  // Generate embeddings for all keywords
  console.log('[3/4] Generating embeddings...');
  const embeddings: number[][] = [];
  
  for (let i = 0; i < keywords.length; i++) {
    if (i % 500 === 0) {
      console.log(`  Progress: ${i}/${keywords.length} (${Math.round((i / keywords.length) * 100)}%)`);
    }
    const output = await extractor(keywords[i].keyword, { pooling: 'mean', normalize: true });
    embeddings.push(Array.from(output.data));
  }
  
  console.log(`  Progress: ${keywords.length}/${keywords.length} (100%)`);
  console.log(`✓ Generated ${embeddings.length} embeddings\n`);

  // Save to file
  console.log('[4/4] Saving prebuilt vector database...');
  const outputPath = path.join(process.cwd(), 'data', 'embeddings.json');
  
  const vectorData: PrebuiltVectorData = {
    keywords,
    embeddings,
    version: '1.0.0',
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(outputPath, JSON.stringify(vectorData));
  
  const fileSizeKB = Math.round(fs.statSync(outputPath).size / 1024);
  console.log(`✓ Saved to ${outputPath} (${fileSizeKB} KB)\n`);

  console.log('=== Prebuild Complete ===');
  console.log(`Total keywords: ${keywords.length}`);
  console.log(`Embedding dimensions: ${embeddings[0].length}`);
  console.log(`File size: ${fileSizeKB} KB`);
}

prebuildEmbeddings().catch(error => {
  console.error('Error prebuilding embeddings:', error);
  process.exit(1);
});
