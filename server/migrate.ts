import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

async function runMigrations() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool });

  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./migrations" });
  console.log("Migrations complete!");

  await pool.end();
}

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
