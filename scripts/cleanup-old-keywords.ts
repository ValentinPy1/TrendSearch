// Load environment variables from .env file
import 'dotenv/config';

import { db } from '../server/db';
import { keywords } from '../shared/schema';
import { inArray } from 'drizzle-orm';
import * as readline from 'readline';

interface KeywordStats {
    total: number;
    withIncompleteData: number;
    withCompleteData: number;
    toDelete: string[];
}

async function getOldKeywordsStats(): Promise<KeywordStats> {
    console.log('Scanning database for keywords with incomplete data...\n');
    
    // Get all keywords from database
    const allKeywords = await db.select().from(keywords);
    
    const stats: KeywordStats = {
        total: allKeywords.length,
        withIncompleteData: 0,
        withCompleteData: 0,
        toDelete: []
    };
    
    allKeywords.forEach(keyword => {
        const hasIncompleteData = !keyword.monthlyData || 
                                 !Array.isArray(keyword.monthlyData) || 
                                 keyword.monthlyData.length < 48;
        
        if (hasIncompleteData) {
            stats.withIncompleteData++;
            stats.toDelete.push(keyword.id);
        } else {
            stats.withCompleteData++;
        }
    });
    
    return stats;
}

async function deleteOldKeywords(keywordIds: string[]): Promise<number> {
    if (keywordIds.length === 0) {
        return 0;
    }
    
    console.log(`Deleting ${keywordIds.length} keywords with incomplete data...\n`);
    
    let deletedCount = 0;
    const batchSize = 100; // Delete in batches to avoid overwhelming the database
    
    for (let i = 0; i < keywordIds.length; i += batchSize) {
        const batch = keywordIds.slice(i, i + batchSize);
        
        // Delete keywords in batch
        await db.delete(keywords).where(inArray(keywords.id, batch));
        
        deletedCount += batch.length;
        console.log(`  Progress: ${deletedCount}/${keywordIds.length} keywords deleted`);
    }
    
    return deletedCount;
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

async function cleanupOldKeywords() {
    console.log('=== Cleanup Old Keywords with Incomplete Data ===\n');
    console.log('This script will permanently delete keywords that have less than 48 months of data.\n');
    
    try {
        // Get statistics
        const stats = await getOldKeywordsStats();
        
        console.log('Statistics:');
        console.log(`  Total keywords: ${stats.total}`);
        console.log(`  Keywords with complete data (48+ months): ${stats.withCompleteData}`);
        console.log(`  Keywords with incomplete data (<48 months): ${stats.withIncompleteData}`);
        console.log(`  Keywords to be deleted: ${stats.toDelete.length}\n`);
        
        if (stats.toDelete.length === 0) {
            console.log('✓ No keywords with incomplete data found. Database is clean!');
            return;
        }
        
        // Ask for confirmation
        console.log('⚠️  WARNING: This will permanently delete keywords from the database.');
        const confirmed = await askConfirmation('Do you want to proceed? (yes/no): ');
        
        if (!confirmed) {
            console.log('\nCleanup cancelled.');
            return;
        }
        
        console.log('\nProceeding with deletion...\n');
        
        // Delete old keywords
        const deletedCount = await deleteOldKeywords(stats.toDelete);
        
        console.log(`\n✓ Successfully deleted ${deletedCount} keywords with incomplete data.`);
        console.log(`✓ ${stats.withCompleteData} keywords with complete data remain in the database.`);
        
    } catch (error) {
        console.error('\n✗ Error during cleanup:', error);
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

// Run the cleanup script
cleanupOldKeywords().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});

