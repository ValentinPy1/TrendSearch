#!/usr/bin/env tsx

// Load environment variables from .env file
import 'dotenv/config';

// In development, allow self-signed certificates for database connection
if (process.env.NODE_ENV === "development") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import postgres from "postgres";

async function analyzeTables() {
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL must be set");
    }

    const sql = postgres(process.env.DATABASE_URL, {
        max: 1,
        idle_timeout: 20,
        connect_timeout: 30,
        ssl: 'require',
    });

    try {
        console.log("Updating table statistics...");
        
        // ANALYZE updates statistics so PostgreSQL can make better query plans
        await sql`ANALYZE custom_search_projects`;
        await sql`ANALYZE custom_search_project_keywords`;
        
        console.log("✓ Statistics updated!");
        console.log("PostgreSQL should now use the indexes for better query performance.");
        
    } catch (error) {
        console.error("Failed:", error);
        throw error;
    } finally {
        await sql.end();
    }
}

analyzeTables()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Error:", err);
        process.exit(1);
    });

