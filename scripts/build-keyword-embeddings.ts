import { pipeline } from '@xenova/transformers';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

interface KeywordData {
  keyword: string;
  search_volume: number;
  competition: number;
  low_top_of_page_bid: number;
  high_top_of_page_bid: number;
  cpc: number;
  '2025_09': number;
  '2025_08': number;
  '2025_07': number;
  '2025_06': number;
  '2025_05': number;
  '2025_04': number;
  '2025_03': number;
  '2025_02': number;
  '2025_01': number;
  '2024_12': number;
  '2024_11': number;
  '2024_10': number;
  growth_slope: number;
  growth_r2: number;
  growth_consistency: number;
  growth_stability: number;
  sustained_growth_score: number;
  'yoy_trend_%': number;
  '3month_trend_%': number;
}

interface KeywordEmbedding {
  keyword: string;
  data: KeywordData;
  embedding: number[];
}

async function buildKeywordEmbeddings() {
  console.log('Loading CSV data...');
  const csvPath = path.join(process.cwd(), 'data', 'keywords_data.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    cast: true,
  }) as KeywordData[];
  
  console.log(`Loaded ${records.length} keywords from CSV`);
  
  console.log('Initializing sentence transformer model...');
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  
  console.log('Creating embeddings...');
  const embeddings: KeywordEmbedding[] = [];
  
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (i % 100 === 0) {
      console.log(`Progress: ${i}/${records.length}`);
    }
    
    const output = await extractor(record.keyword, { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data as Float32Array);
    
    embeddings.push({
      keyword: record.keyword,
      data: record,
      embedding,
    });
  }
  
  console.log('Saving embeddings to file...');
  const outputPath = path.join(process.cwd(), 'data', 'keywords.embeddings.json');
  fs.writeFileSync(outputPath, JSON.stringify(embeddings, null, 2));
  
  console.log(`Successfully created embeddings for ${embeddings.length} keywords`);
  console.log(`Embeddings saved to: ${outputPath}`);
  console.log(`File size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB`);
}

buildKeywordEmbeddings().catch(console.error);
