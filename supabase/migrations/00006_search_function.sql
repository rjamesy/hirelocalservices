-- =============================================================================
-- 00006_search_function.sql
-- PostGIS-powered search RPC function for the business directory
-- =============================================================================

-- ─── Main search function ───────────────────────────────────────────

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
      b.created_at AS b_created_at,
      bl.suburb AS b_suburb,
      bl.state AS b_state,
      bl.postcode AS b_postcode,
      bl.service_radius_km AS b_service_radius_km,
      -- Calculate distance if lat/lng provided, otherwise NULL
      CASE
        WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND bl.geom IS NOT NULL THEN
          ST_Distance(
            bl.geom,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
          )
        ELSE NULL
      END AS b_distance_m
    FROM businesses b
    -- Join location (left join so businesses without a location are excluded
    -- only when a geo filter is applied)
    INNER JOIN business_locations bl ON bl.business_id = b.id
    -- Join subscription to enforce visibility rules
    INNER JOIN subscriptions s ON s.business_id = b.id
    -- Optionally join category tables for category filtering
    LEFT JOIN business_categories bc ON bc.business_id = b.id
    LEFT JOIN categories c ON c.id = bc.category_id
    WHERE
      -- Only published businesses with active or grace-period subscriptions
      b.status = 'published'
      AND s.status IN ('active', 'past_due')
      -- Category filter
      AND (
        p_category_slug IS NULL
        OR c.slug = p_category_slug
        -- Also match parent category slug so searching "cleaning" returns
        -- all sub-categories like "house-cleaning", "office-cleaning", etc.
        OR c.parent_id IN (
          SELECT pc.id FROM categories pc WHERE pc.slug = p_category_slug
        )
      )
      -- Geo radius filter using PostGIS ST_DWithin
      AND (
        p_lat IS NULL
        OR p_lng IS NULL
        OR ST_DWithin(
          bl.geom,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          p_radius_km * 1000
        )
      )
      -- Keyword filter on name or description (case-insensitive)
      AND (
        p_keyword IS NULL
        OR p_keyword = ''
        OR b.name ILIKE '%' || p_keyword || '%'
        OR b.description ILIKE '%' || p_keyword || '%'
      )
    -- Deduplicate businesses that match multiple categories
    GROUP BY
      b.id, b.name, b.slug, b.phone, b.website, b.description,
      b.status, b.created_at,
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
    fb.b_suburb AS suburb,
    fb.b_state AS state,
    fb.b_postcode AS postcode,
    fb.b_service_radius_km AS service_radius_km,
    fb.b_distance_m AS distance_m,
    -- Aggregate all category names for this business
    COALESCE(
      (
        SELECT array_agg(DISTINCT cat.name ORDER BY cat.name)
        FROM business_categories bcat
        JOIN categories cat ON cat.id = bcat.category_id
        WHERE bcat.business_id = fb.b_id
      ),
      ARRAY[]::TEXT[]
    ) AS category_names,
    -- Average rating from testimonials
    (
      SELECT ROUND(AVG(t.rating)::numeric, 1)
      FROM testimonials t
      WHERE t.business_id = fb.b_id
    ) AS avg_rating,
    -- Review count
    (
      SELECT COUNT(*)
      FROM testimonials t
      WHERE t.business_id = fb.b_id
    ) AS review_count,
    -- First photo URL (by sort order)
    (
      SELECT p.url
      FROM photos p
      WHERE p.business_id = fb.b_id
      ORDER BY p.sort_order ASC
      LIMIT 1
    ) AS photo_url,
    -- Total count across all pages (window function)
    COUNT(*) OVER() AS total_count
  FROM filtered_businesses fb
  ORDER BY
    -- If geo search, order by distance (nearest first)
    -- Otherwise order by newest first
    CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL
      THEN fb.b_distance_m
      ELSE NULL
    END ASC NULLS LAST,
    fb.b_created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- ─── Location upsert helper ─────────────────────────────────────────
-- Used by the updateBusinessLocation server action to set the PostGIS
-- geography column, which cannot be done through the Supabase JS client.

CREATE OR REPLACE FUNCTION upsert_business_location(
  p_business_id UUID,
  p_address_text TEXT DEFAULT NULL,
  p_suburb TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_postcode TEXT DEFAULT NULL,
  p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL,
  p_service_radius_km INT DEFAULT 25
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_geom geography(Point, 4326) DEFAULT NULL;
BEGIN
  -- Build the geography point if coordinates are provided
  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    v_geom := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  END IF;

  -- Attempt to update an existing location for this business
  UPDATE business_locations
  SET
    address_text      = p_address_text,
    suburb            = p_suburb,
    state             = p_state,
    postcode          = p_postcode,
    lat               = p_lat,
    lng               = p_lng,
    geom              = v_geom,
    service_radius_km = p_service_radius_km
  WHERE business_id = p_business_id;

  -- If no row was updated, insert a new one
  IF NOT FOUND THEN
    INSERT INTO business_locations (
      business_id, address_text, suburb, state, postcode,
      lat, lng, geom, service_radius_km
    ) VALUES (
      p_business_id, p_address_text, p_suburb, p_state, p_postcode,
      p_lat, p_lng, v_geom, p_service_radius_km
    );
  END IF;
END;
$$;

-- ─── Grant execute to authenticated and anon roles ──────────────────

GRANT EXECUTE ON FUNCTION search_businesses TO authenticated, anon;
GRANT EXECUTE ON FUNCTION upsert_business_location TO authenticated;
