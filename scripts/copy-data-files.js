#!/usr/bin/env node
/**
 * Copy static data files to dist/data/ during build
 * This ensures data files are available in production
 */

const fs = require('fs');
const path = require('path');

const sourceDir = path.join(process.cwd(), 'data');
const destDir = path.join(process.cwd(), 'dist', 'data');

// Files to copy
const filesToCopy = [
    'paramV4.json',
    'microsaas-principles.txt',
    'sectors.json',
    'sectors_aggregated_metrics.minimal.json',
];

// Create destination directory if it doesn't exist
if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
    console.log(`Created directory: ${destDir}`);
}

let copiedCount = 0;
let skippedCount = 0;

// Copy each file
for (const filename of filesToCopy) {
    const sourcePath = path.join(sourceDir, filename);
    const destPath = path.join(destDir, filename);

    if (!fs.existsSync(sourcePath)) {
        console.warn(`Warning: Source file not found: ${sourcePath}`);
        skippedCount++;
        continue;
    }

    try {
        fs.copyFileSync(sourcePath, destPath);
        console.log(`Copied: ${filename}`);
        copiedCount++;
    } catch (error) {
        console.error(`Error copying ${filename}:`, error.message);
        skippedCount++;
    }
}

console.log(`\nCopy complete: ${copiedCount} copied, ${skippedCount} skipped`);

