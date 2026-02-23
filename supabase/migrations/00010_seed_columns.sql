-- =============================================================================
-- 00010_seed_columns.sql
-- Add seed/claim columns to businesses, create business_claims table,
-- update visibility rules and search function for OSM-seeded listings
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add seed columns to businesses
-- ---------------------------------------------------------------------------

ALTER TABLE businesses
  ADD COLUMN is_seed        boolean NOT NULL DEFAULT false,
  ADD COLUMN claim_status   text    NOT NULL DEFAULT 'unclaimed'
    CHECK (claim_status IN ('unclaimed', 'claimed')),
  ADD COLUMN seed_source    text,
  ADD COLUMN seed_source_id text;

-- Index for filtering seed listings
CREATE INDEX idx_businesses_is_seed ON businesses(is_seed);
CREATE INDEX idx_businesses_claim_status ON businesses(claim_status);
-- Unique constraint to prevent duplicate OSM imports
CREATE UNIQUE INDEX idx_businesses_seed_source ON businesses(seed_source, seed_source_id)
  WHERE seed_source IS NOT NULL AND seed_source_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Create business_claims table for tracking claim requests
-- ---------------------------------------------------------------------------

CREATE TABLE business_claims (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id  uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    claimer_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status       text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    reviewed_at  timestamptz,
    reviewed_by  uuid        REFERENCES profiles(id)
);

CREATE INDEX idx_business_claims_business_id ON business_claims(business_id);
CREATE INDEX idx_business_claims_claimer_id  ON business_claims(claimer_id);
CREATE INDEX idx_business_claims_status      ON business_claims(status);

-- Enable RLS
ALTER TABLE business_claims ENABLE ROW LEVEL SECURITY;

-- Authenticated users can create claims
CREATE POLICY business_claims_insert_auth ON business_claims
    FOR INSERT WITH CHECK (claimer_id = auth.uid());

-- Users can see their own claims, admin can see all
CREATE POLICY business_claims_select ON business_claims
    FOR SELECT USING (claimer_id = auth.uid() OR is_admin());

-- Admin can update claims (approve/reject)
CREATE POLICY business_claims_update_admin ON business_claims
    FOR UPDATE USING (is_admin());

-- Admin can delete claims
CREATE POLICY business_claims_delete_admin ON business_claims
    FOR DELETE USING (is_admin());

-- ---------------------------------------------------------------------------
-- 3. Update is_business_visible() to allow seed listings without subscriptions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_business_visible(p_business_id uuid)
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1
        FROM businesses b
        WHERE b.id = p_business_id
          AND b.status = 'published'
          AND (
            -- Seed listings are visible without a subscription
            b.is_seed = true
            -- Regular listings need an active subscription
            OR EXISTS (
              SELECT 1 FROM subscriptions s
              WHERE s.business_id = b.id
                AND s.status IN ('active', 'past_due')
            )
          )
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---------------------------------------------------------------------------
-- 4. Update search_businesses() to LEFT JOIN subscriptions for seeds
-- ---------------------------------------------------------------------------

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
  status TEXT,
  is_seed BOOLEAN,
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
  WITH filtered_businesses AS (
    SELECT
      b.id AS b_id,
      b.name AS b_name,
      b.slug AS b_slug,
      b.phone AS b_phone,
      b.website AS b_website,
      b.description AS b_description,
      b.status AS b_status,
      b.is_seed AS b_is_seed,
      b.created_at AS b_created_at,
      bl.suburb AS b_suburb,
      bl.state AS b_state,
      bl.postcode AS b_postcode,
      bl.service_radius_km AS b_service_radius_km,
      CASE
        WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND bl.geom IS NOT NULL THEN
          ST_Distance(
            bl.geom,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
          )
        ELSE NULL
      END AS b_distance_m
    FROM businesses b
    INNER JOIN business_locations bl ON bl.business_id = b.id
    -- LEFT JOIN so seed listings without subscriptions are included
    LEFT JOIN subscriptions s ON s.business_id = b.id
    LEFT JOIN business_categories bc ON bc.business_id = b.id
    LEFT JOIN categories c ON c.id = bc.category_id
    WHERE
      b.status = 'published'
      -- Seed listings OR active subscription
      AND (b.is_seed = true OR s.status IN ('active', 'past_due'))
      -- Category filter
      AND (
        p_category_slug IS NULL
        OR c.slug = p_category_slug
        OR c.parent_id IN (
          SELECT pc.id FROM categories pc WHERE pc.slug = p_category_slug
        )
      )
      -- Geo radius filter
      AND (
        p_lat IS NULL
        OR p_lng IS NULL
        OR ST_DWithin(
          bl.geom,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          p_radius_km * 1000
        )
      )
      -- Keyword filter
      AND (
        p_keyword IS NULL
        OR p_keyword = ''
        OR b.name ILIKE '%' || p_keyword || '%'
        OR b.description ILIKE '%' || p_keyword || '%'
      )
    GROUP BY
      b.id, b.name, b.slug, b.phone, b.website, b.description,
      b.status, b.is_seed, b.created_at,
      bl.suburb, bl.state, bl.postcode, bl.service_radius_km, bl.geom
  )
  SELECT
    fb.b_id AS id,
    fb.b_name AS name,
    fb.b_slug AS slug,
    fb.b_phone AS phone,
    fb.b_website AS website,
    fb.b_description AS description,
    fb.b_status AS status,
    fb.b_is_seed AS is_seed,
    fb.b_suburb AS suburb,
    fb.b_state AS state,
    fb.b_postcode AS postcode,
    fb.b_service_radius_km AS service_radius_km,
    fb.b_distance_m AS distance_m,
    COALESCE(
      (
        SELECT array_agg(DISTINCT cat.name ORDER BY cat.name)
        FROM business_categories bcat
        JOIN categories cat ON cat.id = bcat.category_id
        WHERE bcat.business_id = fb.b_id
      ),
      ARRAY[]::TEXT[]
    ) AS category_names,
    (
      SELECT ROUND(AVG(t.rating)::numeric, 1)
      FROM testimonials t
      WHERE t.business_id = fb.b_id
    ) AS avg_rating,
    (
      SELECT COUNT(*)
      FROM testimonials t
      WHERE t.business_id = fb.b_id
    ) AS review_count,
    (
      SELECT p.url
      FROM photos p
      WHERE p.business_id = fb.b_id
      ORDER BY p.sort_order ASC
      LIMIT 1
    ) AS photo_url,
    COUNT(*) OVER() AS total_count
  FROM filtered_businesses fb
  ORDER BY
    CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL
      THEN fb.b_distance_m
      ELSE NULL
    END ASC NULLS LAST,
    fb.b_created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Re-grant execute permissions
GRANT EXECUTE ON FUNCTION search_businesses TO authenticated, anon;
