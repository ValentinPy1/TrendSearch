-- Migration: Add source_websites field to custom_search_project_keywords table
-- This migration adds tracking for which website(s) each keyword came from

-- Add source_websites column as JSONB array
ALTER TABLE "custom_search_project_keywords" 
ADD COLUMN IF NOT EXISTS "source_websites" jsonb DEFAULT '[]'::jsonb;

-- Update existing rows to have empty array if null
UPDATE "custom_search_project_keywords" 
SET "source_websites" = '[]'::jsonb 
WHERE "source_websites" IS NULL;

-- Make the column NOT NULL after setting defaults
ALTER TABLE "custom_search_project_keywords" 
ALTER COLUMN "source_websites" SET NOT NULL;

-- Create index for filtering by source websites
CREATE INDEX IF NOT EXISTS "custom_search_project_keywords_source_websites_idx" 
ON "custom_search_project_keywords" USING GIN ("source_websites");

