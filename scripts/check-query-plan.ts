#!/usr/bin/env tsx

// Load environment variables from .env file
import 'dotenv/config';

// In development, allow self-signed certificates for database connection
if (process.env.NODE_ENV === "development") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import postgres from "postgres";

async function checkQueryPlan() {
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
        // Get a sample userId (first user in the database)
        const users = await sql`SELECT id FROM users LIMIT 1`;
        if (users.length === 0) {
            console.log("No users found in database");
            await sql.end();
            return;
        }
        const userId = users[0].id;
        console.log(`Checking query plan for user: ${userId}\n`);

        console.log("=== COUNT Query Plan ===");
        const countPlan = await sql`
            EXPLAIN ANALYZE
            SELECT count(*)::int
            FROM custom_search_projects
            WHERE user_id = ${userId}
        `;
        console.log(countPlan.map((r: any) => r['QUERY PLAN']).join('\n'));

        console.log("\n=== SELECT Query Plan (LIMIT 10) ===");
        const selectPlan = await sql`
            EXPLAIN ANALYZE
            SELECT *
            FROM custom_search_projects
            WHERE user_id = ${userId}
            ORDER BY updated_at DESC
            LIMIT 10
        `;
        console.log(selectPlan.map((r: any) => r['QUERY PLAN']).join('\n'));

        console.log("\n=== Checking Indexes ===");
        const indexes = await sql`
            SELECT 
                indexname,
                indexdef
            FROM pg_indexes
            WHERE tablename = 'custom_search_projects'
            ORDER BY indexname
        `;
        indexes.forEach((idx: any) => {
            console.log(`\n${idx.indexname}:`);
            console.log(`  ${idx.indexdef}`);
        });

    } catch (error) {
        console.error("Error:", error);
        throw error;
    } finally {
        await sql.end();
    }
}

checkQueryPlan()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Error:", err);
        process.exit(1);
    });

