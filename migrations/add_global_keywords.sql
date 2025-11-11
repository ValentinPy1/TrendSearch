-- Migration: Add global_keywords and custom_search_project_keywords tables
-- This migration adds tables for storing keywords globally and linking them to custom search projects

-- Create global_keywords table
CREATE TABLE IF NOT EXISTS "global_keywords" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keyword" text NOT NULL,
	"volume" integer,
	"competition" integer,
	"cpc" numeric(10, 2),
	"top_page_bid" numeric(10, 2),
	"growth_3m" numeric(10, 2),
	"growth_yoy" numeric(10, 2),
	"similarity_score" numeric(5, 4),
	"growth_slope" numeric(10, 2),
	"growth_r2" numeric(10, 4),
	"growth_consistency" numeric(10, 4),
	"growth_stability" numeric(10, 4),
	"sustained_growth_score" numeric(10, 4),
	"volatility" numeric(10, 4),
	"trend_strength" numeric(10, 4),
	"bid_efficiency" numeric(10, 4),
	"tac" numeric(15, 2),
	"sac" numeric(15, 2),
	"opportunity_score" numeric(10, 4),
	"monthly_data" jsonb,
	"source" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Create unique constraint on keyword (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS "global_keywords_keyword_unique" ON "global_keywords" (LOWER("keyword"));
--> statement-breakpoint

-- Create index for case-insensitive lookups
CREATE INDEX IF NOT EXISTS "global_keywords_keyword_lower_idx" ON "global_keywords" (LOWER("keyword"));
--> statement-breakpoint

-- Create custom_search_project_keywords junction table
CREATE TABLE IF NOT EXISTS "custom_search_project_keywords" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"custom_search_project_id" varchar NOT NULL,
	"global_keyword_id" varchar NOT NULL,
	"similarity_score" numeric(5, 4),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Add foreign key constraints
ALTER TABLE "custom_search_project_keywords" ADD CONSTRAINT "custom_search_project_keywords_custom_search_project_id_custom_search_projects_id_fk" FOREIGN KEY ("custom_search_project_id") REFERENCES "public"."custom_search_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "custom_search_project_keywords" ADD CONSTRAINT "custom_search_project_keywords_global_keyword_id_global_keywords_id_fk" FOREIGN KEY ("global_keyword_id") REFERENCES "public"."global_keywords"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "custom_search_project_keywords_project_id_idx" ON "custom_search_project_keywords" ("custom_search_project_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "custom_search_project_keywords_keyword_id_idx" ON "custom_search_project_keywords" ("global_keyword_id");
--> statement-breakpoint

