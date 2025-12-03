#!/usr/bin/env tsx
/**
 * Helper script to upload data files to Railway deployment
 * 
 * Usage:
 *   tsx scripts/upload-to-railway.ts <filename> <railway-url> [admin-token]
 * 
 * Example:
 *   tsx scripts/upload-to-railway.ts data/sectors_aggregated_metrics.json https://your-app.railway.app
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function uploadFile() {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.error('Usage: tsx scripts/upload-to-railway.ts <file-path> <railway-url> [admin-token]');
        console.error('');
        console.error('Example:');
        console.error('  tsx scripts/upload-to-railway.ts data/sectors_aggregated_metrics.json https://your-app.railway.app');
        process.exit(1);
    }

    const filePath = args[0];
    // Remove trailing slash and ensure proper URL format
    let railwayUrl = args[1].trim().replace(/\/$/, '');
    // Ensure it starts with http:// or https://
    if (!railwayUrl.startsWith('http://') && !railwayUrl.startsWith('https://')) {
        railwayUrl = 'https://' + railwayUrl;
    }
    const adminToken = args[2];

    // Read file
    if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const filename = path.basename(filePath);

    // Encode to base64
    const base64Content = Buffer.from(fileContent, 'utf-8').toString('base64');

    // Get auth token from environment or prompt
    let authToken = process.env.RAILWAY_AUTH_TOKEN;
    if (!authToken) {
        console.error('❌ Error: RAILWAY_AUTH_TOKEN environment variable not set');
        console.error('');
        console.error('To get your JWT token:');
        console.error('1. Open your app in browser and log in');
        console.error('2. Open Developer Tools (F12) → Console tab');
        console.error('3. Run: const { data: { session } } = await supabase.auth.getSession(); console.log(session?.access_token);');
        console.error('4. Copy the token and set: export RAILWAY_AUTH_TOKEN="your-token-here"');
        console.error('');
        console.error('Or check Network tab → any API request → Request Headers → Authorization header');
        process.exit(1);
    }

    console.log('✓ Auth token found');

    // Prepare request
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
    };

    if (adminToken) {
        headers['x-admin-token'] = adminToken;
    }

    const payload = {
        filename,
        content: base64Content,
    };

    console.log(`Uploading ${filename} to ${railwayUrl}...`);
    console.log(`File size: ${(fileContent.length / 1024 / 1024).toFixed(2)} MB`);

    try {
        const response = await fetch(`${railwayUrl}/api/admin/upload-data-file`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });

        const contentType = response.headers.get('content-type');
        let result;
        
        if (contentType && contentType.includes('application/json')) {
            result = await response.json();
        } else {
            // Response is not JSON (likely HTML error page)
            const text = await response.text();
            console.error(`❌ Error: ${response.status} ${response.statusText}`);
            console.error('');
            console.error('Server returned HTML instead of JSON. Possible causes:');
            console.error('  - Authentication failed (401): Check your JWT token');
            console.error('  - Endpoint not found (404): Check the URL');
            console.error('  - Server error (500): Check Railway logs');
            console.error('');
            console.error('Response preview:');
            console.error(text.substring(0, 500)); // Show first 500 chars
            process.exit(1);
        }

        if (!response.ok) {
            console.error(`Error: ${response.status} ${response.statusText}`);
            console.error(JSON.stringify(result, null, 2));
            process.exit(1);
        }

        console.log('✓ Upload successful!');
        console.log(`  Path: ${result.path}`);
        console.log(`  Size: ${result.sizeMB} MB`);
    } catch (error) {
        console.error('Upload failed:', error);
        if (error instanceof Error) {
            console.error('Error message:', error.message);
        }
        process.exit(1);
    }
}

uploadFile();

