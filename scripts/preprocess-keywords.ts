import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

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

interface ScoredKeyword extends KeywordData {
  priority_score: number;
}

async function preprocessKeywords() {
  console.log('=== Preprocessing Keywords for Two-Tier System ===\n');

  // Load all keywords from CSV
  console.log('[1/3] Loading keywords from CSV...');
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

  // Score keywords by volume × sustained_growth_score
  console.log('[2/3] Scoring keywords by priority...');
  const scoredKeywords: ScoredKeyword[] = keywords.map(kw => {
    const volume = kw.search_volume || 0;
    const growth = kw.sustained_growth_score || 0;
    
    // Priority score: higher volume and positive sustained growth are valued
    // Use log scale for volume to balance high-volume keywords with growing ones
    const volumeScore = Math.log10(Math.max(volume, 1));
    const growthScore = Math.max(growth, 0); // Only reward positive growth
    
    const priority_score = volumeScore * (1 + growthScore * 10); // Amplify growth impact
    
    return {
      ...kw,
      priority_score,
    };
  });

  // Sort by priority score (descending)
  scoredKeywords.sort((a, b) => b.priority_score - a.priority_score);
  
  console.log(`✓ Scored ${scoredKeywords.length} keywords\n`);

  // Split into top-tier and long-tail
  const TOP_TIER_SIZE = 15000;
  const topTier = scoredKeywords.slice(0, TOP_TIER_SIZE);
  const longTail = scoredKeywords.slice(TOP_TIER_SIZE);

  console.log('[3/3] Saving preprocessed datasets...');
  
  // Save top-tier keywords
  const topTierPath = path.join(process.cwd(), 'data', 'keywords_top_tier.csv');
  const topTierCsv = stringify(topTier, { header: true });
  fs.writeFileSync(topTierPath, topTierCsv);
  console.log(`✓ Saved ${topTier.length} top-tier keywords to keywords_top_tier.csv`);
  
  // Save long-tail keywords
  const longTailPath = path.join(process.cwd(), 'data', 'keywords_long_tail.csv');
  const longTailCsv = stringify(longTail, { header: true });
  fs.writeFileSync(longTailPath, longTailCsv);
  console.log(`✓ Saved ${longTail.length} long-tail keywords to keywords_long_tail.csv`);

  // Save metadata
  const metadata = {
    total_keywords: keywords.length,
    top_tier_count: topTier.length,
    long_tail_count: longTail.length,
    top_tier_min_score: topTier[topTier.length - 1].priority_score,
    top_tier_max_score: topTier[0].priority_score,
    preprocessed_at: new Date().toISOString(),
  };
  
  const metadataPath = path.join(process.cwd(), 'data', 'preprocessing_metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`✓ Saved metadata to preprocessing_metadata.json\n`);

  console.log('=== Preprocessing Complete ===');
  console.log(`Total keywords: ${metadata.total_keywords}`);
  console.log(`Top-tier (precomputed): ${metadata.top_tier_count}`);
  console.log(`Long-tail (on-demand): ${metadata.long_tail_count}`);
  console.log(`Top score range: ${metadata.top_tier_max_score.toFixed(2)} - ${metadata.top_tier_min_score.toFixed(2)}`);
}

preprocessKeywords().catch(error => {
  console.error('Error preprocessing keywords:', error);
  process.exit(1);
});
