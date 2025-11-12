-- Migration: Add indexes to custom_search_projects table for better query performance
-- This migration adds indexes on userId and updatedAt to speed up project queries

-- Index on userId for filtering projects by user (most common query)
CREATE INDEX IF NOT EXISTS "custom_search_projects_user_id_idx" 
ON "custom_search_projects" ("user_id");

-- Composite index on userId and updatedAt for paginated queries (userId filter + updatedAt sort)
CREATE INDEX IF NOT EXISTS "custom_search_projects_user_id_updated_at_idx" 
ON "custom_search_projects" ("user_id", "updated_at" DESC);

