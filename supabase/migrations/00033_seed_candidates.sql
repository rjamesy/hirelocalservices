-- Phase 2: Place details cache + normalised seed candidates
-- Supports seed-normalize.ts pipeline (no business inserts)

-- Raw Google Place Details cache
CREATE TABLE IF NOT EXISTS seed_place_details (
  place_id        TEXT PRIMARY KEY,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL CHECK (status IN ('ok', 'not_found', 'error')),
  api_error_code  TEXT,
  raw_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  fields_version  TEXT NOT NULL DEFAULT 'v1'
);

-- Normalised seed candidates (ready for AI descriptions, NOT in businesses yet)
CREATE TABLE IF NOT EXISTS seed_candidates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id            TEXT UNIQUE NOT NULL,
  source_region       TEXT,
  source_category     TEXT,
  name                TEXT NOT NULL,
  address_line        TEXT,
  suburb              TEXT NOT NULL,
  postcode            TEXT NOT NULL,
  state               TEXT NOT NULL,
  country             TEXT NOT NULL DEFAULT 'AU',
  lat                 DOUBLE PRECISION NOT NULL,
  lng                 DOUBLE PRECISION NOT NULL,
  phone_e164          TEXT,
  website_url         TEXT,
  google_maps_url     TEXT,
  rating              NUMERIC,
  user_ratings_total  INT,
  opening_hours_json  JSONB,
  categories          TEXT[] NOT NULL DEFAULT '{}',
  google_types        TEXT[] NOT NULL DEFAULT '{}',
  confidence_score    NUMERIC NOT NULL DEFAULT 0,
  confidence_reasons  TEXT[] NOT NULL DEFAULT '{}',
  completeness_flags  TEXT[] NOT NULL DEFAULT '{}',
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'ready_for_ai', 'rejected_low_quality')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_seed_candidates_status ON seed_candidates(status);
CREATE INDEX IF NOT EXISTS idx_seed_candidates_region ON seed_candidates(source_region);
CREATE INDEX IF NOT EXISTS idx_seed_candidates_confidence ON seed_candidates(confidence_score);
CREATE INDEX IF NOT EXISTS idx_seed_candidates_suburb ON seed_candidates(suburb);

-- RLS: service_role only
ALTER TABLE seed_place_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE seed_candidates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role manages seed_place_details' AND tablename = 'seed_place_details') THEN
    CREATE POLICY "Service role manages seed_place_details" ON seed_place_details FOR ALL USING (current_setting('role') = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role manages seed_candidates' AND tablename = 'seed_candidates') THEN
    CREATE POLICY "Service role manages seed_candidates" ON seed_candidates FOR ALL USING (current_setting('role') = 'service_role');
  END IF;
END $$;
