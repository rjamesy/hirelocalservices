-- =============================================================================
-- 00044_category_source_tracking.sql
-- Add source tracking columns for GBP category ingestion
-- =============================================================================

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_ref text;

-- Prevent duplicate GBP imports (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_gbp_source_ref
  ON categories(source_ref) WHERE source = 'gbp' AND source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_categories_source ON categories(source);
