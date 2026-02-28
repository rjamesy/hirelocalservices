-- Duplicate detection columns for user-driven matching + admin merge
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS duplicate_user_choice text
    CHECK (duplicate_user_choice IN ('matched', 'not_matched', 'unknown')),
  ADD COLUMN IF NOT EXISTS duplicate_of_business_id uuid REFERENCES businesses(id),
  ADD COLUMN IF NOT EXISTS duplicate_confidence numeric(5,2),
  ADD COLUMN IF NOT EXISTS duplicate_candidates_json jsonb,
  ADD COLUMN IF NOT EXISTS merged_seed_business_id uuid REFERENCES businesses(id);

COMMENT ON COLUMN businesses.duplicate_user_choice IS 'User selection: matched (same biz), not_matched, unknown';
COMMENT ON COLUMN businesses.duplicate_of_business_id IS 'ID of the seed listing the user identified as a match';
COMMENT ON COLUMN businesses.duplicate_confidence IS 'Algorithmic confidence score 0-100 at time of match';
COMMENT ON COLUMN businesses.duplicate_candidates_json IS 'Snapshot of candidate list shown to user (audit)';
COMMENT ON COLUMN businesses.merged_seed_business_id IS 'Set by admin on approval: the seed that was soft-deleted';
