-- Migration: Add keyword_embeddings table with pgvector support
-- This migration creates a table to store keyword embeddings with vector similarity search capabilities

-- Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create keyword_embeddings table
CREATE TABLE IF NOT EXISTS "keyword_embeddings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keyword" text NOT NULL,
	"embedding" vector(384) NOT NULL,
	-- Keyword metadata fields
	"search_volume" integer,
	"competition" integer,
	"low_top_of_page_bid" numeric(10, 2),
	"high_top_of_page_bid" numeric(10, 2),
	"cpc" numeric(10, 2),
	-- 48 months of monthly data (stored as JSONB for flexibility)
	"monthly_data" jsonb,
	-- Growth metrics
	"growth_3m" numeric(10, 2),
	"growth_yoy" numeric(10, 2),
	"volatility" numeric(10, 4),
	"trend_strength" numeric(10, 4),
	"avg_top_page_bid" numeric(10, 2),
	"bid_efficiency" numeric(10, 4),
	"tac" numeric(15, 2),
	"sac" numeric(15, 2),
	"opportunity_score" numeric(10, 4),
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- Create unique constraint on keyword (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS "keyword_embeddings_keyword_unique" ON "keyword_embeddings" (LOWER("keyword"));

-- Create index for case-insensitive keyword lookups
CREATE INDEX IF NOT EXISTS "keyword_embeddings_keyword_lower_idx" ON "keyword_embeddings" (LOWER("keyword"));

-- Create IVFFlat index on embedding column for efficient vector similarity search
-- Using cosine distance operator (<=>)
-- Lists parameter: 100 is a good default for ~76k vectors (should be rows/1000)
CREATE INDEX IF NOT EXISTS "keyword_embeddings_embedding_idx" ON "keyword_embeddings" 
USING ivfflat ("embedding" vector_cosine_ops)
WITH (lists = 100);

-- Create indexes on commonly queried fields
CREATE INDEX IF NOT EXISTS "keyword_embeddings_search_volume_idx" ON "keyword_embeddings" ("search_volume");
CREATE INDEX IF NOT EXISTS "keyword_embeddings_competition_idx" ON "keyword_embeddings" ("competition");
CREATE INDEX IF NOT EXISTS "keyword_embeddings_opportunity_score_idx" ON "keyword_embeddings" ("opportunity_score");

