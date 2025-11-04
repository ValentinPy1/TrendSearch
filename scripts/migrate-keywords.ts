// Load environment variables from .env file
import 'dotenv/config';

import * as fs from 'fs';
import * as path from 'path';
import { db } from '../server/db';
import { keywords } from '../shared/schema';
import { inArray } from 'drizzle-orm';
import * as readline from 'readline';

interface MigrationStats {
    totalKeywords: number;
    csvPath: string;
    csvExists: boolean;
}

async function getMigrationStats(): Promise<MigrationStats> {
    console.log('Analyzing database and new dataset...\n');
    
    // Get all keywords from database
    const allKeywords = await db.select().from(keywords);
    
    // Verify CSV path
    const csvPath = path.join(process.cwd(), 'new_keywords', 'keywords_data.csv');
    const csvExists = fs.existsSync(csvPath);
    
    return {
        totalKeywords: allKeywords.length,
        csvPath,
        csvExists
    };
}

async function deleteAllKeywords(totalCount: number): Promise<number> {
    console.log('Deleting all keywords from database...\n');
    
    // Get all keyword IDs first
    const allKeywords = await db.select({ id: keywords.id }).from(keywords);
    const keywordIds = allKeywords.map(kw => kw.id);
    
    if (keywordIds.length === 0) {
        return 0;
    }
    
    let deletedCount = 0;
    const batchSize = 100; // Delete in batches to avoid overwhelming the database
    
    for (let i = 0; i < keywordIds.length; i += batchSize) {
        const batch = keywordIds.slice(i, i + batchSize);
        
        // Delete keywords in batch
        await db.delete(keywords).where(inArray(keywords.id, batch));
        
        deletedCount += batch.length;
        console.log(`  Progress: ${deletedCount}/${totalCount} keywords deleted`);
    }
    
    // Get count after deletion to verify
    const remainingKeywords = await db.select().from(keywords);
    
    return remainingKeywords.length;
}

async function askConfirmation(question: string): Promise<boolean> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}

async function verifyCSVFormat(csvPath: string): Promise<boolean> {
    try {
        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        const lines = csvContent.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
            console.error('  ✗ CSV file appears to be empty or has no data rows');
            return false;
        }
        
        // Check header row for expected month columns
        const header = lines[0].toLowerCase();
        const hasMonthColumns = header.includes('2021_11') || header.includes('2025_09');
        
        if (!hasMonthColumns) {
            console.warn('  ⚠ CSV file may not have expected month columns (2021_11 to 2025_09)');
        }
        
        console.log(`  ✓ CSV file has ${lines.length - 1} data rows`);
        return true;
    } catch (error) {
        console.error('  ✗ Error reading CSV file:', error);
        return false;
    }
}

async function migrateKeywords() {
    console.log('=== Database Migration: Remove Old Keywords and Use New Dataset ===\n');
    console.log('This script will:');
    console.log('  1. Delete ALL existing keywords from the database');
    console.log('  2. Verify the system is configured to use new_keywords/keywords_data.csv');
    console.log('  3. Future keyword generation will automatically use the new dataset (47 months: Nov 2021 - Sep 2025)\n');
    
    try {
        // Get migration statistics
        const stats = await getMigrationStats();
        
        console.log('Current Database State:');
        console.log(`  Total keywords in database: ${stats.totalKeywords}\n`);
        
        console.log('New Dataset Configuration:');
        console.log(`  CSV path: ${stats.csvPath}`);
        console.log(`  CSV exists: ${stats.csvExists ? '✓ Yes' : '✗ No'}`);
        
        if (!stats.csvExists) {
            console.error('\n✗ ERROR: New keyword dataset not found!');
            console.error('   Please ensure new_keywords/keywords_data.csv exists before proceeding.');
            process.exit(1);
        }
        
        // Verify CSV format
        console.log('\nVerifying CSV format...');
        const csvValid = await verifyCSVFormat(stats.csvPath);
        
        if (!csvValid) {
            console.error('\n✗ ERROR: CSV file validation failed!');
            console.error('   Please verify the CSV file format before proceeding.');
            process.exit(1);
        }
        
        // Verify keyword vector service configuration
        console.log('\nVerifying Keyword Vector Service Configuration:');
        const vectorServicePath = path.join(process.cwd(), 'server', 'keyword-vector-service.ts');
        const vectorServiceContent = fs.readFileSync(vectorServicePath, 'utf-8');
        // Check for the path construction pattern: path.join with 'new_keywords' and 'keywords_data.csv'
        const usesNewKeywords = vectorServiceContent.includes("new_keywords") && 
                               vectorServiceContent.includes("keywords_data.csv") &&
                               vectorServiceContent.includes("path.join");
        
        console.log(`  Service file: ${vectorServicePath}`);
        console.log(`  Configured to use new_keywords/keywords_data.csv: ${usesNewKeywords ? '✓ Yes' : '✗ No'}`);
        
        if (!usesNewKeywords) {
            console.error('\n✗ ERROR: Keyword vector service is not configured to use new_keywords/keywords_data.csv!');
            console.error('   Please update server/keyword-vector-service.ts to use the new dataset.');
            console.error('   Expected: path.join(process.cwd(), \'new_keywords\', \'keywords_data.csv\')');
            process.exit(1);
        }
        
        if (stats.totalKeywords === 0) {
            console.log('\n✓ Database is already empty. No keywords to delete.');
            console.log('✓ System is configured to use the new dataset.');
            return;
        }
        
        // Ask for confirmation
        console.log('\n⚠️  WARNING: This will permanently delete ALL keywords from the database.');
        console.log('   Associated reports will remain but will have no keywords.');
        console.log('   Users will need to regenerate reports to get new keywords.\n');
        
        const confirmed = await askConfirmation('Do you want to proceed? (yes/no): ');
        
        if (!confirmed) {
            console.log('\nMigration cancelled.');
            return;
        }
        
        console.log('\nProceeding with migration...\n');
        
        // Delete all keywords
        const beforeCount = stats.totalKeywords;
        const remainingCount = await deleteAllKeywords(beforeCount);
        
        console.log('\nMigration Results:');
        console.log(`  Keywords deleted: ${beforeCount}`);
        console.log(`  Keywords remaining: ${remainingCount}`);
        
        if (remainingCount === 0) {
            console.log('\n✓ Successfully deleted all keywords from the database.');
            console.log('✓ System is configured to use new_keywords/keywords_data.csv');
            console.log('✓ Future keyword generation will use the new dataset with full 48 months of data.');
        } else {
            console.error(`\n✗ WARNING: ${remainingCount} keywords still remain in the database.`);
            console.error('   Please investigate why deletion was incomplete.');
        }
        
    } catch (error) {
        console.error('\n✗ Error during migration:', error);
        if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Stack trace:', error.stack);
        }
        process.exit(1);
    } finally {
        // Close database connection
        process.exit(0);
    }
}

// Run the migration script
migrateKeywords().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});

