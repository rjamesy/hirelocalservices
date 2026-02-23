-- =============================================================================
-- 00018_fair_ranking_search.sql
-- Rewrite search_businesses to use fair ranking with tier weight, quality,
-- proximity, and exposure balancing
-- =============================================================================

-- Drop existing function (return type may change)
DROP FUNCTION IF EXISTS search_businesses(text, double precision, double precision, integer, text, integer, integer);

-- ─── New search function with fair ranking ────────────────────────

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
    -- Random tiebreaker within same effective rank for fairness
    random()
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- ─── Grant permissions ────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION search_businesses TO authenticated, anon;

-- ─── Refresh all businesses to populate new ranking columns ───────
SELECT refresh_all_search_index();
