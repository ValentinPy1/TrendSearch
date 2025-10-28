import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../shared/schema";

if (!process.env.DATABASE_URL) {
    throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?",
    );
}

console.log("[Database] Initializing connection to Supabase PostgreSQL...");

// Create postgres client with better timeout settings and IPv4 forcing
const sql = postgres(process.env.DATABASE_URL, {
    max: 1, // Use a single connection for simplicity
    idle_timeout: 20,
    connect_timeout: 30, // Increased from 10 to 30 seconds
    max_lifetime: 60 * 30, // 30 minutes
    ssl: 'require', // Ensure SSL is required for Supabase
    // Force IPv4 to avoid WSL2 IPv6 issues
    family: 4,
    // Additional connection options for WSL2 compatibility
    prepare: false,
    transform: undefined,
});

export const db = drizzle(sql, { schema });
