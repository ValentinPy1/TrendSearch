import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../shared/schema";

if (!process.env.DATABASE_URL) {
    throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?",
    );
}

console.log("[Database] Initializing connection to Supabase PostgreSQL...");

// Parse and validate DATABASE_URL
let databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set");
}

// Check if the URL might have parsing issues (special characters in password)
// If the URL doesn't start with postgresql://, it might be malformed
if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    throw new Error("DATABASE_URL must start with postgresql:// or postgres://");
}

// Try to parse and fix the URL if it has special characters in the password
try {
    const urlObj = new URL(databaseUrl);
    // Check if password contains special characters that need encoding
    const password = urlObj.password;
    if (password && (password.includes('?') || password.includes('*') || password.includes('&') || password.includes('#'))) {
        // Reconstruct the URL with properly encoded password
        const encodedPassword = encodeURIComponent(password);
        urlObj.password = encodedPassword;
        databaseUrl = urlObj.toString();
        console.log("[Database] Fixed URL encoding for password with special characters");
    }
    // Log the connection URL (without password) for debugging
    const safeUrl = `${urlObj.protocol}//${urlObj.username}@${urlObj.hostname}:${urlObj.port}${urlObj.pathname}`;
    console.log("[Database] Connecting to:", safeUrl);
} catch (e) {
    console.warn("[Database] Could not parse DATABASE_URL, using as-is:", e instanceof Error ? e.message : String(e));
}

// Create postgres client with better timeout settings
const sql = postgres(databaseUrl, {
    max: 1, // Use a single connection for simplicity
    idle_timeout: 20,
    connect_timeout: 30, // Increased from 10 to 30 seconds
    max_lifetime: 60 * 30, // 30 minutes
    ssl: 'require', // Ensure SSL is required for Supabase
    // Additional connection options for WSL2 compatibility
    prepare: false,
    transform: undefined,
});

export const db = drizzle(sql, { schema });
