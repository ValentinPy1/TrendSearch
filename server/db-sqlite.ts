import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../shared/schema-sqlite";

console.log("[Database] Initializing SQLite database...");

// Create SQLite database file
const sqlite = new Database("local.db");

export const db = drizzle(sqlite, { schema });
