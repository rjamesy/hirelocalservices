-- =============================================================================
-- 00035_publish_pipeline.sql
-- Phase 4: Publish Pipeline
-- - Add publish tracking columns to seed_candidates
-- - Add seed_batch_id to businesses
-- - Extend billing_status CHECK to include 'seed'
-- - Create seed_publish_runs logging table
-- =============================================================================

-- ─── 1. Add publish columns to seed_candidates ──────────────────────

ALTER TABLE seed_candidates
  ADD COLUMN IF NOT EXISTS publish_status TEXT NOT NULL DEFAULT 'unpublished'
    CHECK (publish_status IN ('unpublished', 'published', 'skipped', 'rolled_back')),
  ADD COLUMN IF NOT EXISTS published_business_id UUID,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS publish_batch_id UUID,
  ADD COLUMN IF NOT EXISTS publish_error TEXT;

CREATE INDEX IF NOT EXISTS idx_seed_candidates_publish_status
  ON seed_candidates(publish_status)
  WHERE publish_status = 'unpublished';

CREATE INDEX IF NOT EXISTS idx_seed_candidates_batch_id
  ON seed_candidates(publish_batch_id)
  WHERE publish_batch_id IS NOT NULL;

-- ─── 2. Add seed_batch_id to businesses ─────────────────────────────

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS seed_batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_businesses_seed_batch_id
  ON businesses(seed_batch_id)
  WHERE seed_batch_id IS NOT NULL;

-- ─── 3. Extend billing_status to include 'seed' ────────────────────
-- Drop old CHECK and add expanded one

ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_billing_status_check;
ALTER TABLE businesses ADD CONSTRAINT businesses_billing_status_check
  CHECK (billing_status IN ('active', 'trial', 'billing_suspended', 'seed'));

-- ─── 4. Create seed_publish_runs logging table ──────────────────────

CREATE TABLE IF NOT EXISTS seed_publish_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id          UUID UNIQUE NOT NULL,
  run_started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  run_finished_at   TIMESTAMPTZ,
  region            TEXT,
  category          TEXT,
  candidates_attempted  INT NOT NULL DEFAULT 0,
  published             INT NOT NULL DEFAULT 0,
  skipped_already_published INT NOT NULL DEFAULT 0,
  skipped_ineligible    INT NOT NULL DEFAULT 0,
  errors                INT NOT NULL DEFAULT 0,
  rolled_back_at        TIMESTAMPTZ
);

ALTER TABLE seed_publish_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role manages seed_publish_runs' AND tablename = 'seed_publish_runs') THEN
    CREATE POLICY "Service role manages seed_publish_runs" ON seed_publish_runs FOR ALL USING (current_setting('role') = 'service_role');
  END IF;
END $$;
