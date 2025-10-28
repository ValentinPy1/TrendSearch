import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set");
}

async function runMigrations() {
    const sql = postgres(process.env.DATABASE_URL, {
        max: 1,
        idle_timeout: 20,
        connect_timeout: 30,
        ssl: 'require',
    });

    const db = drizzle(sql);

    console.log("Running migrations...");
    await migrate(db, { migrationsFolder: "./migrations" });
    console.log("Migrations complete!");

    await sql.end();
}

runMigrations().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
