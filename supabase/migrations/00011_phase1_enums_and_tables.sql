-- =============================================================================
-- 00011_phase1_enums_and_tables.sql
-- New enums & tables for verification pipeline
-- =============================================================================

-- ─── Enums ──────────────────────────────────────────────────────────

CREATE TYPE verification_status AS ENUM (
  'pending', 'approved', 'review', 'rejected', 'suspended'
);

CREATE TYPE claim_status_enum AS ENUM (
  'unclaimed', 'pending', 'claimed'
);

CREATE TYPE listing_source AS ENUM (
  'manual', 'osm', 'csv_import'
);

-- ─── business_contacts ──────────────────────────────────────────────

CREATE TABLE business_contacts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid        NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  phone        text,
  email        text,
  website      text,
  has_contact  boolean     GENERATED ALWAYS AS (
    phone IS NOT NULL OR email IS NOT NULL OR website IS NOT NULL
  ) STORED,
  verified_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_business_contacts_business_id ON business_contacts(business_id);

-- ─── verification_jobs ──────────────────────────────────────────────

CREATE TABLE verification_jobs (
  id                    uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid               NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status                verification_status NOT NULL DEFAULT 'pending',
  deterministic_result  jsonb,
  ai_result             jsonb,
  final_decision        verification_status,
  reviewer_id           uuid               REFERENCES profiles(id),
  created_at            timestamptz        NOT NULL DEFAULT now(),
  updated_at            timestamptz        NOT NULL DEFAULT now()
);

CREATE INDEX idx_verification_jobs_business_id ON verification_jobs(business_id);
CREATE INDEX idx_verification_jobs_status ON verification_jobs(status);

-- ─── admin_reviews ──────────────────────────────────────────────────

CREATE TABLE admin_reviews (
  id                  uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_job_id uuid               NOT NULL REFERENCES verification_jobs(id) ON DELETE CASCADE,
  reviewer_id         uuid               NOT NULL REFERENCES profiles(id),
  decision            verification_status NOT NULL,
  notes               text,
  created_at          timestamptz        NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_reviews_job_id ON admin_reviews(verification_job_id);

-- ─── RLS ────────────────────────────────────────────────────────────

ALTER TABLE business_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_reviews ENABLE ROW LEVEL SECURITY;

-- business_contacts: owners can see/edit their own, admins see all, public reads for visible businesses
CREATE POLICY business_contacts_select ON business_contacts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
    OR is_admin()
    OR true  -- contact info is public for listed businesses
  );

CREATE POLICY business_contacts_insert ON business_contacts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY business_contacts_update ON business_contacts
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY business_contacts_delete ON business_contacts
  FOR DELETE USING (is_admin());

-- verification_jobs: admin only + owner can see their own
CREATE POLICY verification_jobs_select ON verification_jobs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY verification_jobs_insert ON verification_jobs
  FOR INSERT WITH CHECK (is_admin() OR EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()));

CREATE POLICY verification_jobs_update ON verification_jobs
  FOR UPDATE USING (is_admin());

-- admin_reviews: admin only
CREATE POLICY admin_reviews_select ON admin_reviews
  FOR SELECT USING (is_admin());

CREATE POLICY admin_reviews_insert ON admin_reviews
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY admin_reviews_update ON admin_reviews
  FOR UPDATE USING (is_admin());

-- ─── Triggers for updated_at ────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER business_contacts_updated_at
  BEFORE UPDATE ON business_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER verification_jobs_updated_at
  BEFORE UPDATE ON verification_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
