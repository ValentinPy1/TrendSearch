-- Migration: Add vector similarity search function
-- This migration creates a PostgreSQL function for efficient vector similarity search

-- Create function for matching keywords by vector similarity
CREATE OR REPLACE FUNCTION match_keywords(
  query_embedding vector(384),
  match_threshold float DEFAULT 0.0,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id varchar,
  keyword text,
  similarity float,
  search_volume integer,
  competition integer,
  low_top_of_page_bid numeric(10, 2),
  high_top_of_page_bid numeric(10, 2),
  cpc numeric(10, 2),
  monthly_data jsonb,
  growth_3m numeric(10, 2),
  growth_yoy numeric(10, 2),
  volatility numeric(10, 4),
  trend_strength numeric(10, 4),
  avg_top_page_bid numeric(10, 2),
  bid_efficiency numeric(10, 4),
  tac numeric(15, 2),
  sac numeric(15, 2),
  opportunity_score numeric(10, 4),
  created_at timestamp
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ke.id,
    ke.keyword,
    -- Calculate cosine similarity: 1 - cosine_distance
    -- Using <=> operator for cosine distance (returns 0-2, where 0 is identical)
    -- Convert to similarity score (0-1, where 1 is most similar)
    1 - (ke.embedding <=> query_embedding) AS similarity,
    ke.search_volume,
    ke.competition,
    ke.low_top_of_page_bid,
    ke.high_top_of_page_bid,
    ke.cpc,
    ke.monthly_data,
    ke.growth_3m,
    ke.growth_yoy,
    ke.volatility,
    ke.trend_strength,
    ke.avg_top_page_bid,
    ke.bid_efficiency,
    ke.tac,
    ke.sac,
    ke.opportunity_score,
    ke.created_at
  FROM keyword_embeddings ke
  WHERE 1 - (ke.embedding <=> query_embedding) > match_threshold
  ORDER BY ke.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create function for exact keyword lookup (case-insensitive)
CREATE OR REPLACE FUNCTION find_keyword_by_text(
  keyword_text text
)
RETURNS TABLE (
  id varchar,
  keyword text,
  search_volume integer,
  competition integer,
  low_top_of_page_bid numeric(10, 2),
  high_top_of_page_bid numeric(10, 2),
  cpc numeric(10, 2),
  monthly_data jsonb,
  growth_3m numeric(10, 2),
  growth_yoy numeric(10, 2),
  volatility numeric(10, 4),
  trend_strength numeric(10, 4),
  avg_top_page_bid numeric(10, 2),
  bid_efficiency numeric(10, 4),
  tac numeric(15, 2),
  sac numeric(15, 2),
  opportunity_score numeric(10, 4),
  created_at timestamp
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ke.id,
    ke.keyword,
    ke.search_volume,
    ke.competition,
    ke.low_top_of_page_bid,
    ke.high_top_of_page_bid,
    ke.cpc,
    ke.monthly_data,
    ke.growth_3m,
    ke.growth_yoy,
    ke.volatility,
    ke.trend_strength,
    ke.avg_top_page_bid,
    ke.bid_efficiency,
    ke.tac,
    ke.sac,
    ke.opportunity_score,
    ke.created_at
  FROM keyword_embeddings ke
  WHERE LOWER(ke.keyword) = LOWER(keyword_text)
  LIMIT 1;
END;
$$;

