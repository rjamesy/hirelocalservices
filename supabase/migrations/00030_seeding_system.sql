-- =============================================================================
-- 00030_seeding_system.sql
-- Phase 5: Controlled Seeding System
-- - Extend listing_source enum with 'google_places'
-- - Add seed_confidence column to businesses
-- - Create seed_blacklist table
-- - Update is_search_eligible() to include high-confidence unclaimed seeds
-- - Switch search_businesses() to deterministic daily ranking
-- - Create otp_verifications table for claim phone verification
-- - Add seed config columns to system_flags
-- =============================================================================

-- ─── 1. Extend listing_source enum ────────────────────────────────────
ALTER TYPE listing_source ADD VALUE IF NOT EXISTS 'google_places';

-- ─── 2. Add seed_confidence to businesses ─────────────────────────────
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS seed_confidence NUMERIC(3,2) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_businesses_seed_confidence
  ON businesses (seed_confidence)
  WHERE is_seed = true;

-- ─── 3. Create seed_blacklist table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS seed_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id TEXT UNIQUE,
  business_name TEXT,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE seed_blacklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage seed_blacklist"
  ON seed_blacklist FOR ALL USING (is_admin());

-- ─── 4. Update is_search_eligible to include confident seeds ──────────
CREATE OR REPLACE FUNCTION is_search_eligible(p_business_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_eligible boolean := false;
BEGIN
  SELECT INTO v_eligible
    CASE WHEN
      b.verification_status = 'approved'
      AND b.status NOT IN ('suspended', 'paused')
      AND b.deleted_at IS NULL
      AND b.billing_status != 'billing_suspended'
      AND bc.has_contact = true
      AND (
        b.claim_status = 'claimed'
        OR (
          b.is_seed = true
          AND b.claim_status != 'claimed'
          AND COALESCE(b.seed_confidence, 0) >= 0.5
        )
      )
    THEN true ELSE false END
  FROM businesses b
  LEFT JOIN business_contacts bc ON bc.business_id = b.id
  WHERE b.id = p_business_id;

  RETURN COALESCE(v_eligible, false);
END;
$$;

-- ─── 5. Deterministic daily ranking in search_businesses ──────────────
-- Drop existing function (return type unchanged)
DROP FUNCTION IF EXISTS search_businesses(text, double precision, double precision, integer, text, integer, integer);

CREATE OR REPLACE FUNCTION search_businesses(
  p_category_slug TEXT DEFAULT NULL,
  p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL,
  p_radius_km INT DEFAULT 25,
  p_keyword TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  name TEXT,
  slug TEXT,
  phone TEXT,
  website TEXT,
  description TEXT,
  listing_source listing_source,
  is_claimed BOOLEAN,
  suburb TEXT,
  state TEXT,
  postcode TEXT,
  service_radius_km INT,
  distance_m DOUBLE PRECISION,
  category_names TEXT[],
  avg_rating NUMERIC,
  review_count BIGINT,
  photo_url TEXT,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT
      bsi.business_id,
      bsi.name AS b_name,
      bsi.slug AS b_slug,
      bsi.phone AS b_phone,
      bsi.website AS b_website,
      bsi.description AS b_description,
      bsi.listing_source AS b_listing_source,
      bsi.is_claimed AS b_is_claimed,
      bsi.suburb AS b_suburb,
      bsi.state AS b_state,
      bsi.postcode AS b_postcode,
      bsi.service_radius_km AS b_service_radius_km,
      bsi.category_names AS b_category_names,
      bsi.avg_rating AS b_avg_rating,
      bsi.review_count AS b_review_count,
      bsi.photo_url AS b_photo_url,
      bsi.rank_score AS b_rank_score,
      bsi.subscription_tier AS b_tier,
      -- Distance calculation
      CASE
        WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND bsi.geom IS NOT NULL THEN
          ST_Distance(
            bsi.geom,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
          )
        ELSE NULL
      END AS b_distance_m
    FROM business_search_index bsi
    WHERE
      -- Category filter
      (
        p_category_slug IS NULL
        OR EXISTS (
          SELECT 1 FROM categories c
          WHERE (c.slug = p_category_slug OR c.parent_id IN (
            SELECT pc.id FROM categories pc WHERE pc.slug = p_category_slug
          ))
          AND c.name = ANY(bsi.category_names)
        )
      )
      -- Geo radius filter
      AND (
        p_lat IS NULL
        OR p_lng IS NULL
        OR ST_DWithin(
          bsi.geom,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          p_radius_km * 1000
        )
      )
      -- Keyword search
      AND (
        p_keyword IS NULL
        OR p_keyword = ''
        OR bsi.search_vector @@ plainto_tsquery('english', p_keyword)
        OR bsi.name ILIKE '%' || p_keyword || '%'
      )
  ),
  ranked AS (
    SELECT
      f.*,
      -- Dynamic rank score = stored rank_score + proximity bonus
      f.b_rank_score +
      CASE
        WHEN f.b_distance_m IS NOT NULL THEN
          CASE
            WHEN f.b_distance_m < 5000 THEN 15     -- within 5km
            WHEN f.b_distance_m <= 10000 THEN 15 - ((f.b_distance_m - 5000) / 5000) * 5   -- 15→10
            WHEN f.b_distance_m <= 25000 THEN 10 - ((f.b_distance_m - 10000) / 15000) * 5 -- 10→5
            WHEN f.b_distance_m <= 50000 THEN 5 - ((f.b_distance_m - 25000) / 25000) * 5  -- 5→0
            ELSE 0
          END
        ELSE 0
      END AS effective_rank
    FROM filtered f
  )
  SELECT
    r.business_id AS id,
    r.b_name AS name,
    r.b_slug AS slug,
    r.b_phone AS phone,
    r.b_website AS website,
    r.b_description AS description,
    r.b_listing_source AS listing_source,
    r.b_is_claimed AS is_claimed,
    r.b_suburb AS suburb,
    r.b_state AS state,
    r.b_postcode AS postcode,
    r.b_service_radius_km AS service_radius_km,
    r.b_distance_m AS distance_m,
    r.b_category_names AS category_names,
    r.b_avg_rating AS avg_rating,
    r.b_review_count AS review_count,
    r.b_photo_url AS photo_url,
    COUNT(*) OVER() AS total_count
  FROM ranked r
  ORDER BY
    r.effective_rank DESC,
    -- Deterministic daily tiebreaker: stable within a day, rotates daily
    md5(r.business_id::text || current_date::text)
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION search_businesses TO authenticated, anon;

-- ─── 6. OTP verifications table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_verifications_user
  ON otp_verifications (user_id, created_at DESC);

ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own OTPs"
  ON otp_verifications FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service can manage OTPs"
  ON otp_verifications FOR ALL
  USING (current_setting('role') = 'service_role');

-- ─── 7. Seed config columns on system_flags ───────────────────────────
ALTER TABLE system_flags
  ADD COLUMN IF NOT EXISTS seed_min_confidence NUMERIC(3,2) NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS seed_require_phone BOOLEAN NOT NULL DEFAULT false;

-- ─── 8. Refresh search index to pick up new eligibility rules ─────────
-- Note: Only run if business_search_index exists (depends on migration 00013)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'business_search_index') THEN
    PERFORM refresh_all_search_index();
  END IF;
END;
$$;
