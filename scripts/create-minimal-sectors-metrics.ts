#!/usr/bin/env tsx
/**
 * Create a minimal version of sectors_aggregated_metrics.json
 * Removes:
 * - All monthlyTrendData (historical volume data)
 * - Metrics not displayed in the UI (avgGrowth3m, avgCompetition, avgTopPageBid, volatility, trendStrength, bidEfficiency, tac, sac)
 * 
 * Keeps only:
 * - avgVolume
 * - avgGrowthYoy
 * - avgCpc
 * - opportunityScore
 * - companyCount (for industries)
 * - medianBatch (for industries)
 * - keywordCount (for companies)
 * - description/url/batch (needed for UI rendering)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MinimalAggregatedMetrics {
    avgVolume: number;
    avgGrowthYoy: number;
    avgCpc: number;
    opportunityScore: number;
}

interface MinimalCompanyResult {
    keywordCount: number;
    aggregatedMetrics: MinimalAggregatedMetrics;
    description?: string;
    url?: string;
    batch?: string;
}

interface MinimalIndustryResult {
    industry: string;
    industryType?: string;
    companyCount: number;
    aggregatedMetrics: MinimalAggregatedMetrics;
    medianBatch?: string;
}

interface MinimalOutput {
    companies: Record<string, MinimalCompanyResult>;
    industries: Record<string, MinimalIndustryResult>;
    generatedAt: string;
}

function createMinimalMetrics(fullMetrics: any): MinimalAggregatedMetrics {
    return {
        avgVolume: fullMetrics.avgVolume,
        avgGrowthYoy: fullMetrics.avgGrowthYoy,
        avgCpc: fullMetrics.avgCpc,
        opportunityScore: fullMetrics.opportunityScore,
    };
}

async function createMinimalVersion() {
    const inputPath = path.join(process.cwd(), 'data', 'sectors_aggregated_metrics.json');
    const outputPath = path.join(process.cwd(), 'data', 'sectors_aggregated_metrics.minimal.json');

    console.log('Reading full metrics file...');
    if (!fs.existsSync(inputPath)) {
        console.error(`Error: Input file not found: ${inputPath}`);
        process.exit(1);
    }

    const fullData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
    console.log(`✓ Loaded ${Object.keys(fullData.companies || {}).length} companies`);
    console.log(`✓ Loaded ${Object.keys(fullData.industries || {}).length} industries`);

    console.log('\nCreating minimal version...');
    const minimalData: MinimalOutput = {
        companies: {},
        industries: {},
        generatedAt: fullData.generatedAt || new Date().toISOString(),
    };

    // Process companies
    if (fullData.companies) {
        for (const [companyKey, companyData] of Object.entries(fullData.companies)) {
            const company = companyData as any;
            minimalData.companies[companyKey] = {
                keywordCount: company.keywordCount,
                aggregatedMetrics: createMinimalMetrics(company.aggregatedMetrics),
                description: company.description,
                url: company.url,
                batch: company.batch,
            };
        }
        console.log(`✓ Processed ${Object.keys(minimalData.companies).length} companies`);
    }

    // Process industries
    if (fullData.industries) {
        for (const [industryKey, industryData] of Object.entries(fullData.industries)) {
            const industry = industryData as any;
            minimalData.industries[industryKey] = {
                industry: industry.industry,
                industryType: industry.industryType,
                companyCount: industry.companyCount,
                aggregatedMetrics: createMinimalMetrics(industry.aggregatedMetrics),
                medianBatch: industry.medianBatch,
            };
        }
        console.log(`✓ Processed ${Object.keys(minimalData.industries).length} industries`);
    }

    // Write minimal version
    console.log('\nWriting minimal version...');
    fs.writeFileSync(outputPath, JSON.stringify(minimalData, null, 2));

    // Calculate size reduction
    const originalSize = fs.statSync(inputPath).size;
    const minimalSize = fs.statSync(outputPath).size;
    const reduction = ((1 - minimalSize / originalSize) * 100).toFixed(1);

    console.log(`✓ Saved minimal version to: ${path.basename(outputPath)}`);
    console.log(`\nSize comparison:`);
    console.log(`  Original: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Minimal:  ${(minimalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Reduction: ${reduction}%`);
    console.log(`\n✓ Done!`);
}

createMinimalVersion().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});

