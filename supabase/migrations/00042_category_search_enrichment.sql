-- =============================================================================
-- 00042_category_search_enrichment.sql
-- Add search enrichment columns to categories table
-- =============================================================================

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS synonyms text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
