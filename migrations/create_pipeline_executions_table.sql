-- Create pipeline_executions table for independent pipeline tracking
CREATE TABLE IF NOT EXISTS "pipeline_executions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "custom_search_project_id" varchar NOT NULL REFERENCES "custom_search_projects"("id") ON DELETE CASCADE,
  "normalized_website" varchar NOT NULL,
  "target_website" varchar NOT NULL,
  "year" integer NOT NULL,
  "month" integer NOT NULL,
  "location_code" integer,
  "location_name" varchar,
  "current_stage" varchar NOT NULL DEFAULT 'creating-task',
  "progress" jsonb NOT NULL,
  "status" varchar NOT NULL DEFAULT 'running',
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "pipeline_executions_unique_website_month" UNIQUE ("custom_search_project_id", "normalized_website", "year", "month")
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "pipeline_executions_project_id_idx" ON "pipeline_executions"("custom_search_project_id");
CREATE INDEX IF NOT EXISTS "pipeline_executions_status_idx" ON "pipeline_executions"("status");
CREATE INDEX IF NOT EXISTS "pipeline_executions_website_month_idx" ON "pipeline_executions"("custom_search_project_id", "normalized_website", "year", "month");

