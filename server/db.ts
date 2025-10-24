import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "@shared/schema";

// Configure WebSocket for Neon (required for serverless connections)
neonConfig.webSocketConstructor = ws;

// In production, enable fetch mode for better compatibility
if (process.env.NODE_ENV === "production") {
  neonConfig.fetchConnectionCache = true;
  neonConfig.poolQueryViaFetch = true;
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

console.log("[Database] Initializing connection to Neon serverless...");

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});

// Add error handler for pool
pool.on('error', (err) => {
  console.error('[Database] Unexpected error on idle client', err);
});

export const db = drizzle({ client: pool, schema });
