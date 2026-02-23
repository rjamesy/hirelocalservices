-- =============================================================================
-- 00012_phase1_alter_businesses.sql
-- Alter businesses table: add verification_status, listing_source,
-- convert claim_status to enum, extend business_claims, backfill data
-- =============================================================================

-- ─── Add new columns to businesses ──────────────────────────────────

ALTER TABLE businesses
  ADD COLUMN verification_status verification_status NOT NULL DEFAULT 'pending',
  ADD COLUMN listing_source listing_source NOT NULL DEFAULT 'manual';

CREATE INDEX idx_businesses_verification_status ON businesses(verification_status);
CREATE INDEX idx_businesses_listing_source ON businesses(listing_source);

-- ─── Convert claim_status from text CHECK to enum ───────────────────

-- Drop the existing CHECK constraint
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_claim_status_check;

-- Convert the column type
ALTER TABLE businesses
  ALTER COLUMN claim_status TYPE claim_status_enum
  USING claim_status::claim_status_enum;

-- Set the default
ALTER TABLE businesses
  ALTER COLUMN claim_status SET DEFAULT 'unclaimed'::claim_status_enum;

-- ─── Extend business_claims table ───────────────────────────────────

ALTER TABLE business_claims
  ADD COLUMN IF NOT EXISTS claimed_business_name text,
  ADD COLUMN IF NOT EXISTS claimed_phone text,
  ADD COLUMN IF NOT EXISTS claimed_website text,
  ADD COLUMN IF NOT EXISTS claimed_email text,
  ADD COLUMN IF NOT EXISTS claimed_postcode text,
  ADD COLUMN IF NOT EXISTS match_score jsonb,
  ADD COLUMN IF NOT EXISTS verification_method text,
  ADD COLUMN IF NOT EXISTS admin_notes text;

-- ─── Backfill data ──────────────────────────────────────────────────

-- 1. Set verification_status='approved' for all currently published businesses
UPDATE businesses
SET verification_status = 'approved'
WHERE status = 'published';

-- 2. Set listing_source='osm' for seed businesses from OSM
UPDATE businesses
SET listing_source = 'osm'
WHERE is_seed = true AND seed_source = 'osm';

-- 3. Copy contact info from businesses → business_contacts for all businesses
INSERT INTO business_contacts (business_id, phone, email, website)
SELECT id, phone, email_contact, website
FROM businesses
ON CONFLICT (business_id) DO NOTHING;

-- 4. Mark claimed businesses' contacts as verified
UPDATE business_contacts bc
SET verified_at = now()
FROM businesses b
WHERE bc.business_id = b.id
  AND b.claim_status = 'claimed';
