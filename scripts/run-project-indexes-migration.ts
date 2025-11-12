#!/usr/bin/env tsx

// Load environment variables from .env file
import 'dotenv/config';

// In development, allow self-signed certificates for database connection
if (process.env.NODE_ENV === "development") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";

async function runMigration() {
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL must be set. Did you forget to load .env?");
    }

    const sql = postgres(process.env.DATABASE_URL, {
        max: 1,
        idle_timeout: 20,
        connect_timeout: 30,
        ssl: 'require',
    });

    try {
        console.log("Connecting to database...");
        
        const migrationFile = path.join(process.cwd(), "migrations", "add_project_indexes.sql");
        const migrationSQL = fs.readFileSync(migrationFile, "utf-8");
        
        console.log("Running migration: add_project_indexes.sql");
        console.log("Creating indexes on custom_search_projects table...");
        
        // Execute the migration SQL
        await sql.unsafe(migrationSQL);
        
        console.log("✓ Migration completed successfully!");
        console.log("Indexes created:");
        console.log("  - custom_search_projects_user_id_idx");
        console.log("  - custom_search_projects_user_id_updated_at_idx");
        
    } catch (error) {
        console.error("Migration failed:", error);
        throw error;
    } finally {
        await sql.end();
    }
}

runMigration()
    .then(() => {
        console.log("\nYou can now test the projects API - it should be much faster!");
        process.exit(0);
    })
    .catch((err) => {
        console.error("Error:", err);
        process.exit(1);
    });

