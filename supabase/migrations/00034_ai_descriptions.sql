-- Phase 3: AI description generation columns + run logging

-- Add AI description columns to seed_candidates
ALTER TABLE seed_candidates
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS description_source TEXT,
  ADD COLUMN IF NOT EXISTS description_prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS ai_validation_status TEXT DEFAULT 'pending'
    CHECK (ai_validation_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS ai_validation_reason TEXT,
  ADD COLUMN IF NOT EXISTS ai_processed_at TIMESTAMPTZ;

-- AI run logging for cost tracking
CREATE TABLE IF NOT EXISTS seed_ai_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  run_finished_at TIMESTAMPTZ,
  region          TEXT,
  category        TEXT,
  model           TEXT NOT NULL,
  prompt_version  TEXT NOT NULL,
  candidates_processed INT NOT NULL DEFAULT 0,
  descriptions_generated INT NOT NULL DEFAULT 0,
  validations_approved INT NOT NULL DEFAULT 0,
  validations_rejected INT NOT NULL DEFAULT 0,
  fallbacks_used  INT NOT NULL DEFAULT 0,
  api_errors      INT NOT NULL DEFAULT 0,
  prompt_tokens   INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  total_tokens    INT NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(8,4) NOT NULL DEFAULT 0
);

-- Index for querying candidates needing descriptions
CREATE INDEX IF NOT EXISTS idx_seed_candidates_ai_status
  ON seed_candidates(status, ai_validation_status)
  WHERE status = 'ready_for_ai';

-- RLS
ALTER TABLE seed_ai_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role manages seed_ai_runs' AND tablename = 'seed_ai_runs') THEN
    CREATE POLICY "Service role manages seed_ai_runs" ON seed_ai_runs FOR ALL USING (current_setting('role') = 'service_role');
  END IF;
END $$;
