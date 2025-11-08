import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';

interface KeywordData {
    keyword: string;
    search_volume?: number;
    competition?: number;
    low_top_of_page_bid?: number;
    high_top_of_page_bid?: number;
    cpc?: number;
    // 48 months of data
    [key: string]: any;
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

interface EmbeddingsMetadata {
    version: string;
    created_at: string;
    total_keywords: number;
    embedding_dimensions: number;
    chunk_size: number;
    chunks: Array<{
        chunk_id: number;
        start_index: number;
        end_index: number;
        keyword_count: number;
        file_path: string;
    }>;
}

// Convert monthly data from individual columns to array format
function convertMonthlyData(keyword: KeywordData): Array<{ month: string; volume: number }> {
    const months: string[] = [];
    const volumes: number[] = [];
    
    // Extract all month columns (2021_11 to 2025_09)
    for (let year = 2021; year <= 2025; year++) {
        for (let month = 1; month <= 12; month++) {
            const monthStr = month.toString().padStart(2, '0');
            const key = `${year}_${monthStr}`;
            if (key in keyword && keyword[key] !== null && keyword[key] !== undefined) {
                months.push(key);
                volumes.push(Number(keyword[key]));
            }
        }
    }
    
    return months.map((month, idx) => ({ month, volume: volumes[idx] }));
}

async function migrateEmbeddings() {
    console.log('=== Migrating Embeddings to Supabase ===\n');

    // Check if DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL environment variable is required');
    }

    // Load metadata
    const metadataPath = path.join(process.cwd(), 'data', 'embeddings_metadata.json');
    if (!fs.existsSync(metadataPath)) {
        throw new Error(`Embeddings metadata not found at ${metadataPath}`);
    }

    const metadata: EmbeddingsMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    console.log(`Found ${metadata.total_keywords} keywords in ${metadata.chunks.length} binary chunks\n`);

    // Load keywords from CSV
    const csvPath = path.join(process.cwd(), 'new_keywords', 'keywords_data.csv');
    if (!fs.existsSync(csvPath)) {
        throw new Error(`Keywords CSV not found at ${csvPath}`);
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const keywords: KeywordData[] = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        cast: (value, context) => {
            if (context.column && value === '') return null;
            if (!isNaN(Number(value))) return Number(value);
            return value;
        },
    }) as KeywordData[];

    if (keywords.length !== metadata.total_keywords) {
        throw new Error(`CSV/metadata mismatch: ${keywords.length} keywords in CSV but ${metadata.total_keywords} in metadata`);
    }

    console.log(`Loaded ${keywords.length} keywords from CSV\n`);

    // Load embeddings from binary chunks
    console.log('Loading embeddings from binary chunks...');
    const embeddingsDir = path.join(process.cwd(), 'data', 'embeddings_chunks');
    const embeddings: Float32Array[] = new Array(metadata.total_keywords);

    for (const chunk of metadata.chunks) {
        const chunkPath = path.join(embeddingsDir, chunk.file_path);
        if (!fs.existsSync(chunkPath)) {
            throw new Error(`Binary chunk not found: ${chunkPath}`);
        }

        const buffer = fs.readFileSync(chunkPath);
        const float32Array = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);

        const expectedSize = chunk.keyword_count * metadata.embedding_dimensions;
        if (float32Array.length !== expectedSize) {
            throw new Error(`Chunk ${chunk.chunk_id} size mismatch: expected ${expectedSize} floats, got ${float32Array.length}`);
        }

        for (let i = 0; i < chunk.keyword_count; i++) {
            const globalIndex = chunk.start_index + i;
            const embeddingStart = i * metadata.embedding_dimensions;
            const embeddingEnd = embeddingStart + metadata.embedding_dimensions;
            embeddings[globalIndex] = float32Array.slice(embeddingStart, embeddingEnd);
        }
    }

    console.log(`Loaded ${embeddings.length} embeddings (${(embeddings.length * 384 * 4 / 1024 / 1024).toFixed(2)} MB)\n`);

    // Check if table already has data
    const existingCount = await db.execute(sql`SELECT COUNT(*) as count FROM keyword_embeddings`);
    const count = Number((existingCount[0] as any)?.count || 0);
    
    if (count > 0) {
        console.log(`Warning: keyword_embeddings table already contains ${count} records.`);
        console.log('Do you want to continue? This will insert duplicates (use ON CONFLICT to update).');
        // For now, we'll proceed and use ON CONFLICT DO NOTHING
    }

    // Get direct postgres connection for raw SQL with vector support
    const databaseUrl = process.env.DATABASE_URL;
    const pgClient = postgres(databaseUrl, {
        max: 1,
        idle_timeout: 20,
        connect_timeout: 30,
        max_lifetime: 60 * 30,
        ssl: 'require',
        prepare: false,
    });

    // Batch insert embeddings
    const BATCH_SIZE = 1000;
    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    console.log(`Starting migration (batch size: ${BATCH_SIZE})...\n`);

    for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
        const batch = keywords.slice(i, Math.min(i + BATCH_SIZE, keywords.length));
        const batchEmbeddings = embeddings.slice(i, Math.min(i + BATCH_SIZE, embeddings.length));

        try {
            // Build batch insert query
            const values = batch.map((keyword, idx) => {
                const embedding = batchEmbeddings[idx];
                const embeddingArray = Array.from(embedding);
                const monthlyData = convertMonthlyData(keyword);

                return {
                    keyword: keyword.keyword,
                    embedding: `[${embeddingArray.join(',')}]`, // Format as PostgreSQL array string
                    search_volume: keyword.search_volume || null,
                    competition: keyword.competition || null,
                    low_top_of_page_bid: keyword.low_top_of_page_bid || null,
                    high_top_of_page_bid: keyword.high_top_of_page_bid || null,
                    cpc: keyword.cpc || null,
                    monthly_data: monthlyData.length > 0 ? monthlyData : null,
                    growth_3m: keyword.growth_3m || null,
                    growth_yoy: keyword.growth_YoY || null,
                    volatility: keyword.volatility || null,
                    trend_strength: keyword.trend_strength || null,
                    avg_top_page_bid: keyword.avg_top_page_bid || null,
                    bid_efficiency: keyword.bid_efficiency || null,
                    tac: keyword.TAC || null,
                    sac: keyword.SAC || null,
                    opportunity_score: keyword.opportunity_score || null,
                };
            });

            // Use raw SQL for vector insertion
            // Build placeholders and params
            const params: any[] = [];
            const placeholders: string[] = [];
            
            values.forEach((v, idx) => {
                const base = idx * 17; // 17 fields per row
                placeholders.push(
                    `($${base + 1}, $${base + 2}::vector(384), $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17})`
                );
                
                params.push(
                    v.keyword,
                    v.embedding,
                    v.search_volume,
                    v.competition,
                    v.low_top_of_page_bid,
                    v.high_top_of_page_bid,
                    v.cpc,
                    v.monthly_data ? JSON.stringify(v.monthly_data) : null,
                    v.growth_3m,
                    v.growth_yoy,
                    v.volatility,
                    v.trend_strength,
                    v.avg_top_page_bid,
                    v.bid_efficiency,
                    v.tac,
                    v.sac,
                    v.opportunity_score
                );
            });

            const query = `
                INSERT INTO keyword_embeddings (
                    keyword, embedding, search_volume, competition,
                    low_top_of_page_bid, high_top_of_page_bid, cpc, monthly_data,
                    growth_3m, growth_yoy, volatility, trend_strength,
                    avg_top_page_bid, bid_efficiency, tac, sac, opportunity_score
                )
                VALUES ${placeholders.join(', ')}
                ON CONFLICT (LOWER(keyword)) DO NOTHING
            `;

            await pgClient.unsafe(query, params);
            const batchInserted = batch.length;
            inserted += batchInserted;
            skipped += (count > 0 ? batchInserted : 0); // Approximate, actual would need query result

            const progress = ((i + batch.length) / keywords.length * 100).toFixed(1);
            console.log(`[${progress}%] Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(keywords.length / BATCH_SIZE)} (${i + batch.length}/${keywords.length} keywords)`);
        } catch (error) {
            errors++;
            console.error(`Error inserting batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
            // Continue with next batch
        }
    }

    await pgClient.end();

    console.log('\n=== Migration Complete ===');
    console.log(`Inserted: ${inserted} keywords`);
    console.log(`Skipped (duplicates): ${skipped} keywords`);
    console.log(`Errors: ${errors} batches`);

    // Verify migration
    console.log('\nVerifying migration...');
    const finalCount = await db.execute(sql`SELECT COUNT(*) as count FROM keyword_embeddings`);
    const final = Number((finalCount[0] as any)?.count || 0);
    console.log(`Total records in database: ${final}`);

    if (final === keywords.length) {
        console.log('✓ Migration successful! All keywords migrated.');
    } else if (final > 0) {
        console.log(`⚠ Migration partially complete. Expected ${keywords.length}, got ${final}.`);
    } else {
        console.log('✗ Migration failed. No records found in database.');
    }

    // Test similarity search
    console.log('\nTesting similarity search...');
    try {
        const testPgClient = postgres(databaseUrl, {
            max: 1,
            idle_timeout: 20,
            connect_timeout: 30,
            ssl: 'require',
            prepare: false,
        });
        
        const testQuery = await testPgClient.unsafe(
            `SELECT * FROM match_keywords(
                (SELECT embedding FROM keyword_embeddings LIMIT 1),
                0.0,
                5
            )`
        );
        console.log('✓ Similarity search function works!');
        await testPgClient.end();
    } catch (error) {
        console.error('✗ Similarity search test failed:', error);
    }
}

// Run migration
migrateEmbeddings()
    .then(() => {
        console.log('\nMigration script completed.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    });

