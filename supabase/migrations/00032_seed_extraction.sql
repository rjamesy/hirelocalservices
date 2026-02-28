-- Seed extraction: dedup tracking + query run tracking
-- These tables support the seed-extract.ts script for efficient
-- Google Places API data collection with deduplication.

-- Seen places (dedup across runs)
CREATE TABLE IF NOT EXISTS seed_seen_places (
  place_id TEXT PRIMARY KEY,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_region TEXT NOT NULL,
  source_category TEXT NOT NULL,
  source_term TEXT NOT NULL
);

-- Query run tracking (skip identical queries < 7 days old)
CREATE TABLE IF NOT EXISTS seed_query_runs (
  query_hash TEXT PRIMARY KEY,
  region TEXT NOT NULL,
  category TEXT NOT NULL,
  anchor TEXT NOT NULL,
  term TEXT NOT NULL,
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pages_fetched INT NOT NULL DEFAULT 0,
  results_count INT NOT NULL DEFAULT 0
);

-- RLS: service_role only (these are admin/CLI tables)
ALTER TABLE seed_seen_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE seed_query_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages seed_seen_places" ON seed_seen_places FOR ALL USING (current_setting('role') = 'service_role');
CREATE POLICY "Service role manages seed_query_runs" ON seed_query_runs FOR ALL USING (current_setting('role') = 'service_role');
