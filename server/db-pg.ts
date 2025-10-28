import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../shared/schema";

if (!process.env.DATABASE_URL) {
    throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?",
    );
}

console.log("[Database] Initializing connection to Supabase PostgreSQL using pg...");

// Parse the DATABASE_URL
const url = new URL(process.env.DATABASE_URL);

// Create pg pool with IPv4 forcing
const pool = new Pool({
    host: url.hostname,
    port: parseInt(url.port),
    database: url.pathname.slice(1), // Remove leading slash
    user: url.username,
    password: url.password,
    ssl: {
        rejectUnauthorized: false // For Supabase
    },
    // Force IPv4
    family: 4,
    // Connection pool settings
    max: 1,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 30000,
});

export const db = drizzle(pool, { schema });
