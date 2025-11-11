#!/usr/bin/env tsx

// Load environment variables from .env file
import 'dotenv/config';

// In development, allow self-signed certificates for database connection
if (process.env.NODE_ENV === "development") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import { db } from "../server/db";
import { customSearchProjects } from "../shared/schema";
import { desc } from "drizzle-orm";

async function listProjects() {
  try {
    const projects = await db
      .select({
        id: customSearchProjects.id,
        name: customSearchProjects.name,
        createdAt: customSearchProjects.createdAt,
        updatedAt: customSearchProjects.updatedAt,
      })
      .from(customSearchProjects)
      .orderBy(desc(customSearchProjects.updatedAt));

    if (projects.length === 0) {
      console.log("No projects found.");
      return;
    }

    console.log("\n=== Custom Search Projects ===\n");
    projects.forEach((project, index) => {
      console.log(`${index + 1}. ${project.name || "(Unnamed)"}`);
      console.log(`   ID: ${project.id}`);
      console.log(`   Created: ${project.createdAt}`);
      console.log(`   Updated: ${project.updatedAt}`);
      console.log();
    });
  } catch (error) {
    console.error("Error listing projects:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

listProjects();

