-- Migration: Enable RLS on keyword_embeddings table (large table - run separately)
-- This table has ~76k rows, so enabling RLS may take time
-- Run this migration separately if the main migration times out on this table

-- Enable RLS on keyword_embeddings
ALTER TABLE public.keyword_embeddings ENABLE ROW LEVEL SECURITY;

-- Create read-only policy for authenticated users
DROP POLICY IF EXISTS "Authenticated users can view keyword embeddings" ON public.keyword_embeddings;
CREATE POLICY "Authenticated users can view keyword embeddings"
  ON public.keyword_embeddings FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies - only backend service role can modify

