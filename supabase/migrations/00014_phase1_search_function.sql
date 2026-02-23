-- =============================================================================
-- 00014_phase1_search_function.sql
-- Rewrite search_businesses to query the search index, update visibility
-- =============================================================================

-- ─── Drop old search function (return type changes) ─────────────────

DROP FUNCTION IF EXISTS search_businesses(text, double precision, double precision, integer, text, integer, integer);

-- ─── New search_businesses querying the index ───────────────────────

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
      bsi.indexed_at,
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
      -- Category filter: array check, no JOIN needed
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
      -- Keyword search: tsvector + ILIKE fallback
      AND (
        p_keyword IS NULL
        OR p_keyword = ''
        OR bsi.search_vector @@ plainto_tsquery('english', p_keyword)
        OR bsi.name ILIKE '%' || p_keyword || '%'
      )
  )
  SELECT
    f.business_id AS id,
    f.b_name AS name,
    f.b_slug AS slug,
    f.b_phone AS phone,
    f.b_website AS website,
    f.b_description AS description,
    f.b_listing_source AS listing_source,
    f.b_is_claimed AS is_claimed,
    f.b_suburb AS suburb,
    f.b_state AS state,
    f.b_postcode AS postcode,
    f.b_service_radius_km AS service_radius_km,
    f.b_distance_m AS distance_m,
    f.b_category_names AS category_names,
    f.b_avg_rating AS avg_rating,
    f.b_review_count AS review_count,
    f.b_photo_url AS photo_url,
    COUNT(*) OVER() AS total_count
  FROM filtered f
  ORDER BY
    CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL
      THEN f.b_distance_m
      ELSE NULL
    END ASC NULLS LAST,
    f.indexed_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- ─── Update is_business_visible() ───────────────────────────────────

CREATE OR REPLACE FUNCTION is_business_visible(p_business_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM businesses b
    JOIN business_contacts bc ON bc.business_id = b.id
    WHERE b.id = p_business_id
      AND b.status != 'suspended'
      AND b.verification_status = 'approved'
      AND bc.has_contact = true
      AND b.claim_status = 'claimed'
      AND (
        b.listing_source != 'manual'
        OR EXISTS (
          SELECT 1 FROM subscriptions s
          WHERE s.business_id = b.id
            AND s.status IN ('active', 'past_due')
        )
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── Grant permissions ──────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION search_businesses TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_business_visible TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_search_eligible TO authenticated, anon;
GRANT EXECUTE ON FUNCTION refresh_search_index TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_all_search_index TO authenticated;
