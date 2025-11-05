-- Migration: Add keyword_generation_progress column to custom_search_projects table
-- This migration adds a JSONB field to store keyword generation progress

ALTER TABLE "custom_search_projects" ADD COLUMN IF NOT EXISTS "keyword_generation_progress" jsonb;
--> statement-breakpoint

