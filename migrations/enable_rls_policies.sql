-- Migration: Enable Row Level Security (RLS) for all tables
-- This migration enables RLS and creates policies for user data isolation
-- Run this migration before deploying to production
--
-- IMPORTANT: This migration is optimized to prevent timeouts by:
-- 1. Creating indexes first to support policy predicates
-- 2. Using improved helper function with safe search_path
-- 3. Adding TO authenticated clauses to limit policy evaluation
-- 4. Using (SELECT auth.uid()) wrapper for better plan stability

-- ============================================================================
-- STEP 1: Create supporting indexes (run first to prevent timeouts)
-- ============================================================================
-- These indexes support the RLS policy predicates and prevent sequential scans

-- Users table index (critical for get_user_id() function)
CREATE INDEX IF NOT EXISTS idx_users_supabase_user_id ON public.users (supabase_user_id);

-- Reports and relationships
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON public.reports (user_id);
CREATE INDEX IF NOT EXISTS idx_reports_id ON public.reports (id);
CREATE INDEX IF NOT EXISTS idx_keywords_report_id ON public.keywords (report_id);

-- Projects and relationships
CREATE INDEX IF NOT EXISTS idx_csp_user_id ON public.custom_search_projects (user_id);
CREATE INDEX IF NOT EXISTS idx_csp_id ON public.custom_search_projects (id);
CREATE INDEX IF NOT EXISTS idx_cspk_project_id ON public.custom_search_project_keywords (custom_search_project_id);

-- Pipeline executions
CREATE INDEX IF NOT EXISTS idx_pe_project_id ON public.pipeline_executions (custom_search_project_id);

-- Other user-owned tables
CREATE INDEX IF NOT EXISTS idx_ideas_user_id ON public.ideas (user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON public.feedback (user_id);

-- ============================================================================
-- STEP 2: Create improved helper function
-- ============================================================================
-- This function maps Supabase's auth.uid() to your local users.id
-- Uses SECURITY DEFINER with safe search_path and stable plan

CREATE OR REPLACE FUNCTION public.get_user_id()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT u.id
  FROM public.users u
  WHERE u.supabase_user_id = (SELECT auth.uid())::text
  LIMIT 1
$$;

-- Revoke public access and grant only to authenticated users
REVOKE ALL ON FUNCTION public.get_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_id() TO authenticated;

-- ============================================================================
-- STEP 3: Enable RLS and create policies for user-owned tables
-- ============================================================================

-- Users table: Users can only read/update their own record
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  TO authenticated
  USING (supabase_user_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  TO authenticated
  USING (supabase_user_id = (SELECT auth.uid())::text);

-- Note: INSERT is handled by backend service role during signup
-- Users cannot directly insert themselves

-- Ideas table: Users can only access their own ideas
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ideas" ON public.ideas;
CREATE POLICY "Users can view own ideas"
  ON public.ideas FOR SELECT
  TO authenticated
  USING (user_id = public.get_user_id());

DROP POLICY IF EXISTS "Users can insert own ideas" ON public.ideas;
CREATE POLICY "Users can insert own ideas"
  ON public.ideas FOR INSERT
  TO authenticated
  WITH CHECK (user_id = public.get_user_id());

DROP POLICY IF EXISTS "Users can update own ideas" ON public.ideas;
CREATE POLICY "Users can update own ideas"
  ON public.ideas FOR UPDATE
  TO authenticated
  USING (user_id = public.get_user_id());

DROP POLICY IF EXISTS "Users can delete own ideas" ON public.ideas;
CREATE POLICY "Users can delete own ideas"
  ON public.ideas FOR DELETE
  TO authenticated
  USING (user_id = public.get_user_id());

-- Reports table: Users can only access their own reports
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own reports" ON public.reports;
CREATE POLICY "Users can view own reports"
  ON public.reports FOR SELECT
  TO authenticated
  USING (user_id = public.get_user_id());

DROP POLICY IF EXISTS "Users can insert own reports" ON public.reports;
CREATE POLICY "Users can insert own reports"
  ON public.reports FOR INSERT
  TO authenticated
  WITH CHECK (user_id = public.get_user_id());

DROP POLICY IF EXISTS "Users can update own reports" ON public.reports;
CREATE POLICY "Users can update own reports"
  ON public.reports FOR UPDATE
  TO authenticated
  USING (user_id = public.get_user_id());

DROP POLICY IF EXISTS "Users can delete own reports" ON public.reports;
CREATE POLICY "Users can delete own reports"
  ON public.reports FOR DELETE
  TO authenticated
  USING (user_id = public.get_user_id());

-- Keywords table: Users can only access keywords from their own reports
ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view keywords from own reports" ON public.keywords;
CREATE POLICY "Users can view keywords from own reports"
  ON public.keywords FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.reports r
      WHERE r.id = keywords.report_id
        AND r.user_id = public.get_user_id()
    )
  );

DROP POLICY IF EXISTS "Users can insert keywords to own reports" ON public.keywords;
CREATE POLICY "Users can insert keywords to own reports"
  ON public.keywords FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.reports r
      WHERE r.id = keywords.report_id
        AND r.user_id = public.get_user_id()
    )
  );

DROP POLICY IF EXISTS "Users can update keywords from own reports" ON public.keywords;
CREATE POLICY "Users can update keywords from own reports"
  ON public.keywords FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.reports r
      WHERE r.id = keywords.report_id
        AND r.user_id = public.get_user_id()
    )
  );

DROP POLICY IF EXISTS "Users can delete keywords from own reports" ON public.keywords;
CREATE POLICY "Users can delete keywords from own reports"
  ON public.keywords FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.reports r
      WHERE r.id = keywords.report_id
        AND r.user_id = public.get_user_id()
    )
  );

-- Custom Search Projects table: Users can only access their own projects
ALTER TABLE public.custom_search_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own projects" ON public.custom_search_projects;
CREATE POLICY "Users can view own projects"
  ON public.custom_search_projects FOR SELECT
  TO authenticated
  USING (user_id = public.get_user_id());

DROP POLICY IF EXISTS "Users can insert own projects" ON public.custom_search_projects;
CREATE POLICY "Users can insert own projects"
  ON public.custom_search_projects FOR INSERT
  TO authenticated
  WITH CHECK (user_id = public.get_user_id());

DROP POLICY IF EXISTS "Users can update own projects" ON public.custom_search_projects;
CREATE POLICY "Users can update own projects"
  ON public.custom_search_projects FOR UPDATE
  TO authenticated
  USING (user_id = public.get_user_id());

DROP POLICY IF EXISTS "Users can delete own projects" ON public.custom_search_projects;
CREATE POLICY "Users can delete own projects"
  ON public.custom_search_projects FOR DELETE
  TO authenticated
  USING (user_id = public.get_user_id());

-- Custom Search Project Keywords table: Users can only access keywords from their own projects
ALTER TABLE public.custom_search_project_keywords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view keywords from own projects" ON public.custom_search_project_keywords;
CREATE POLICY "Users can view keywords from own projects"
  ON public.custom_search_project_keywords FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.custom_search_projects p
      WHERE p.id = custom_search_project_keywords.custom_search_project_id
        AND p.user_id = public.get_user_id()
    )
  );

DROP POLICY IF EXISTS "Users can insert keywords to own projects" ON public.custom_search_project_keywords;
CREATE POLICY "Users can insert keywords to own projects"
  ON public.custom_search_project_keywords FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.custom_search_projects p
      WHERE p.id = custom_search_project_keywords.custom_search_project_id
        AND p.user_id = public.get_user_id()
    )
  );

DROP POLICY IF EXISTS "Users can update keywords from own projects" ON public.custom_search_project_keywords;
CREATE POLICY "Users can update keywords from own projects"
  ON public.custom_search_project_keywords FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.custom_search_projects p
      WHERE p.id = custom_search_project_keywords.custom_search_project_id
        AND p.user_id = public.get_user_id()
    )
  );

DROP POLICY IF EXISTS "Users can delete keywords from own projects" ON public.custom_search_project_keywords;
CREATE POLICY "Users can delete keywords from own projects"
  ON public.custom_search_project_keywords FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.custom_search_projects p
      WHERE p.id = custom_search_project_keywords.custom_search_project_id
        AND p.user_id = public.get_user_id()
    )
  );

-- Pipeline Executions table: Users can only access executions from their own projects
ALTER TABLE public.pipeline_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view executions from own projects" ON public.pipeline_executions;
CREATE POLICY "Users can view executions from own projects"
  ON public.pipeline_executions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.custom_search_projects p
      WHERE p.id = pipeline_executions.custom_search_project_id
        AND p.user_id = public.get_user_id()
    )
  );

DROP POLICY IF EXISTS "Users can insert executions to own projects" ON public.pipeline_executions;
CREATE POLICY "Users can insert executions to own projects"
  ON public.pipeline_executions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.custom_search_projects p
      WHERE p.id = pipeline_executions.custom_search_project_id
        AND p.user_id = public.get_user_id()
    )
  );

DROP POLICY IF EXISTS "Users can update executions from own projects" ON public.pipeline_executions;
CREATE POLICY "Users can update executions from own projects"
  ON public.pipeline_executions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.custom_search_projects p
      WHERE p.id = pipeline_executions.custom_search_project_id
        AND p.user_id = public.get_user_id()
    )
  );

DROP POLICY IF EXISTS "Users can delete executions from own projects" ON public.pipeline_executions;
CREATE POLICY "Users can delete executions from own projects"
  ON public.pipeline_executions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.custom_search_projects p
      WHERE p.id = pipeline_executions.custom_search_project_id
        AND p.user_id = public.get_user_id()
    )
  );

-- Feedback table: Users can only access their own feedback
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own feedback" ON public.feedback;
CREATE POLICY "Users can view own feedback"
  ON public.feedback FOR SELECT
  TO authenticated
  USING (user_id = public.get_user_id());

DROP POLICY IF EXISTS "Users can insert own feedback" ON public.feedback;
CREATE POLICY "Users can insert own feedback"
  ON public.feedback FOR INSERT
  TO authenticated
  WITH CHECK (user_id = public.get_user_id());

DROP POLICY IF EXISTS "Users can update own feedback" ON public.feedback;
CREATE POLICY "Users can update own feedback"
  ON public.feedback FOR UPDATE
  TO authenticated
  USING (user_id = public.get_user_id());

DROP POLICY IF EXISTS "Users can delete own feedback" ON public.feedback;
CREATE POLICY "Users can delete own feedback"
  ON public.feedback FOR DELETE
  TO authenticated
  USING (user_id = public.get_user_id());

-- ============================================================================
-- STEP 4: Handle public/shared tables
-- ============================================================================

-- Global Keywords: Read-only for authenticated users
-- These are shared/public data that users can read but not modify
ALTER TABLE public.global_keywords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view global keywords" ON public.global_keywords;
CREATE POLICY "Authenticated users can view global keywords"
  ON public.global_keywords FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies - only backend service role can modify

-- Keyword Embeddings: Read-only for authenticated users
-- These are shared/public data that users can read but not modify
-- NOTE: This table is large (~76k rows), so enabling RLS may timeout
-- If this section times out, skip it and run migrations/enable_rls_keyword_embeddings.sql separately
-- 
-- Uncomment the lines below if you want to include it in the main migration:
-- ALTER TABLE public.keyword_embeddings ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "Authenticated users can view keyword embeddings" ON public.keyword_embeddings;
-- CREATE POLICY "Authenticated users can view keyword embeddings"
--   ON public.keyword_embeddings FOR SELECT
--   TO authenticated
--   USING (true);

-- No INSERT/UPDATE/DELETE policies - only backend service role can modify
