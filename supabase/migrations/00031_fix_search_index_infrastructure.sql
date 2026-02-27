-- =============================================================================
-- 00031_fix_search_index_infrastructure.sql
-- Creates the business_search_index table and all supporting functions/triggers
-- that were missing from production.
--
-- Consolidates objects from 00013, 00017, 00028 without overwriting
-- the 00030 versions of is_search_eligible() and search_businesses().
-- =============================================================================

-- ─── 1. Create business_search_index table ─────────────────────────────
-- Includes rank_score and subscription_tier from 00017

CREATE TABLE IF NOT EXISTS business_search_index (
  business_id      uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  name             text NOT NULL,
  slug             text NOT NULL,
  description      text,
  phone            text,
  website          text,
  suburb           text,
  state            text,
  postcode         text,
  geom             geography(Point, 4326),
  service_radius_km int,
  category_names   text[] NOT NULL DEFAULT ARRAY[]::text[],
  avg_rating       numeric,
  review_count     bigint NOT NULL DEFAULT 0,
  photo_url        text,
  listing_source   listing_source,
  is_claimed       boolean NOT NULL DEFAULT false,
  subscription_tier text DEFAULT NULL,
  rank_score       numeric NOT NULL DEFAULT 0,
  search_vector    tsvector,
  indexed_at       timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Indexes ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bsi_geom ON business_search_index USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_bsi_categories ON business_search_index USING GIN (category_names);
CREATE INDEX IF NOT EXISTS idx_bsi_search_vector ON business_search_index USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_bsi_slug ON business_search_index(slug);
CREATE INDEX IF NOT EXISTS idx_bsi_rank_score ON business_search_index (rank_score DESC);

-- ─── 3. RLS: public SELECT, admin-only write ───────────────────────────

ALTER TABLE business_search_index ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'bsi_select' AND tablename = 'business_search_index') THEN
    CREATE POLICY bsi_select ON business_search_index FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'bsi_insert' AND tablename = 'business_search_index') THEN
    CREATE POLICY bsi_insert ON business_search_index FOR INSERT WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'bsi_update' AND tablename = 'business_search_index') THEN
    CREATE POLICY bsi_update ON business_search_index FOR UPDATE USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'bsi_delete' AND tablename = 'business_search_index') THEN
    CREATE POLICY bsi_delete ON business_search_index FOR DELETE USING (is_admin());
  END IF;
END;
$$;

-- ─── 4. Ranking helper functions (00028 versions) ──────────────────────

CREATE OR REPLACE FUNCTION calculate_quality_score(p_business_id uuid)
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    (CASE WHEN b.description IS NOT NULL AND length(b.description) > 0 THEN 3 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM photos p WHERE p.business_id = b.id) THEN 3 ELSE 0 END) +
    (CASE WHEN bc.phone IS NOT NULL AND length(bc.phone) > 0 THEN 2 ELSE 0 END) +
    (CASE WHEN bc.website IS NOT NULL AND length(bc.website) > 0 THEN 2 ELSE 0 END) +
    LEAST((SELECT COUNT(*) FROM testimonials t WHERE t.business_id = b.id), 10)
  FROM businesses b
  LEFT JOIN business_contacts bc ON bc.business_id = b.id
  WHERE b.id = p_business_id;
$$;

CREATE OR REPLACE FUNCTION calculate_exposure_penalty(p_business_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_recent_impressions bigint;
  v_avg_impressions numeric;
  v_tier text;
  v_ratio numeric;
BEGIN
  SELECT COALESCE(SUM(search_impressions), 0)
  INTO v_recent_impressions
  FROM business_metrics
  WHERE business_id = p_business_id
    AND date >= CURRENT_DATE - 7;

  IF v_recent_impressions = 0 THEN
    RETURN 0;
  END IF;

  SELECT us.plan INTO v_tier
  FROM user_subscriptions us
  JOIN businesses b ON b.owner_id = us.user_id
  WHERE b.id = p_business_id
    AND us.status IN ('active', 'past_due')
  LIMIT 1;

  SELECT COALESCE(AVG(tier_impressions), 0)
  INTO v_avg_impressions
  FROM (
    SELECT SUM(bm.search_impressions) AS tier_impressions
    FROM business_metrics bm
    JOIN businesses b2 ON b2.id = bm.business_id
    JOIN user_subscriptions us2 ON us2.user_id = b2.owner_id
    WHERE bm.date >= CURRENT_DATE - 7
      AND us2.plan = COALESCE(v_tier, 'basic')
      AND us2.status IN ('active', 'past_due')
    GROUP BY bm.business_id
  ) sub;

  v_ratio := v_recent_impressions::numeric / (v_avg_impressions + 1);
  RETURN LEAST(v_ratio * 10, 15);
END;
$$;

CREATE OR REPLACE FUNCTION calculate_rank_score(p_business_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_tier_weight numeric;
  v_quality numeric;
  v_exposure_penalty numeric;
  v_tier text;
  v_period_end timestamptz;
BEGIN
  SELECT us.plan, us.current_period_end
  INTO v_tier, v_period_end
  FROM user_subscriptions us
  JOIN businesses b ON b.owner_id = us.user_id
  WHERE b.id = p_business_id
    AND us.status IN ('active', 'past_due')
  LIMIT 1;

  IF v_tier = 'premium_annual' THEN v_tier_weight := 40;
  ELSIF v_tier = 'premium' THEN v_tier_weight := 30;
  ELSIF v_tier = 'basic' THEN v_tier_weight := 10;
  ELSIF v_tier = 'free_trial' THEN
    IF v_period_end IS NOT NULL AND v_period_end < now() THEN
      v_tier_weight := 0;
    ELSE
      v_tier_weight := 0;
    END IF;
  ELSE v_tier_weight := 0;
  END IF;

  v_quality := COALESCE(calculate_quality_score(p_business_id), 0);
  v_exposure_penalty := COALESCE(calculate_exposure_penalty(p_business_id), 0);

  RETURN ROUND(v_tier_weight + v_quality - v_exposure_penalty, 2);
END;
$$;

-- ─── 5. Refresh functions (00028 version with user_subscriptions) ──────

CREATE OR REPLACE FUNCTION refresh_search_index(p_business_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF is_search_eligible(p_business_id) THEN
    INSERT INTO business_search_index (
      business_id, name, slug, description, phone, website,
      suburb, state, postcode, geom, service_radius_km,
      category_names, avg_rating, review_count, photo_url,
      listing_source, is_claimed, subscription_tier, rank_score,
      search_vector, indexed_at
    )
    SELECT
      b.id,
      b.name,
      b.slug,
      b.description,
      bc.phone,
      bc.website,
      bl.suburb,
      bl.state,
      bl.postcode,
      bl.geom,
      bl.service_radius_km,
      COALESCE(
        (SELECT array_agg(DISTINCT cat.name ORDER BY cat.name)
         FROM business_categories bcat
         JOIN categories cat ON cat.id = bcat.category_id
         WHERE bcat.business_id = b.id),
        ARRAY[]::text[]
      ),
      (SELECT ROUND(AVG(t.rating)::numeric, 1) FROM testimonials t WHERE t.business_id = b.id),
      (SELECT COUNT(*) FROM testimonials t WHERE t.business_id = b.id),
      (SELECT p.url FROM photos p WHERE p.business_id = b.id ORDER BY p.sort_order ASC LIMIT 1),
      b.listing_source,
      b.claim_status = 'claimed',
      (SELECT us.plan FROM user_subscriptions us WHERE us.user_id = b.owner_id AND us.status IN ('active', 'past_due') LIMIT 1),
      calculate_rank_score(b.id),
      setweight(to_tsvector('english'::regconfig, coalesce(b.name, '')), 'A') ||
      setweight(to_tsvector('english'::regconfig, coalesce(b.description, '')), 'B') ||
      setweight(to_tsvector('english'::regconfig, coalesce(
        (SELECT array_to_string(array_agg(DISTINCT cat2.name), ' ')
         FROM business_categories bcat2
         JOIN categories cat2 ON cat2.id = bcat2.category_id
         WHERE bcat2.business_id = b.id), '')), 'C') ||
      setweight(to_tsvector('english'::regconfig, coalesce(bl.suburb, '')), 'D'),
      now()
    FROM businesses b
    LEFT JOIN business_contacts bc ON bc.business_id = b.id
    LEFT JOIN business_locations bl ON bl.business_id = b.id
    WHERE b.id = p_business_id
    ON CONFLICT (business_id) DO UPDATE SET
      name = EXCLUDED.name,
      slug = EXCLUDED.slug,
      description = EXCLUDED.description,
      phone = EXCLUDED.phone,
      website = EXCLUDED.website,
      suburb = EXCLUDED.suburb,
      state = EXCLUDED.state,
      postcode = EXCLUDED.postcode,
      geom = EXCLUDED.geom,
      service_radius_km = EXCLUDED.service_radius_km,
      category_names = EXCLUDED.category_names,
      avg_rating = EXCLUDED.avg_rating,
      review_count = EXCLUDED.review_count,
      photo_url = EXCLUDED.photo_url,
      listing_source = EXCLUDED.listing_source,
      is_claimed = EXCLUDED.is_claimed,
      subscription_tier = EXCLUDED.subscription_tier,
      rank_score = EXCLUDED.rank_score,
      search_vector = EXCLUDED.search_vector,
      indexed_at = now();
  ELSE
    DELETE FROM business_search_index WHERE business_id = p_business_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_all_search_index()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
BEGIN
  TRUNCATE business_search_index;
  FOR r IN SELECT id FROM businesses LOOP
    PERFORM refresh_search_index(r.id);
  END LOOP;
END;
$$;

-- ─── 6. Trigger function ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trigger_refresh_search_index()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'businesses' THEN
    v_business_id := COALESCE(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME = 'business_contacts' THEN
    v_business_id := COALESCE(NEW.business_id, OLD.business_id);
  ELSIF TG_TABLE_NAME = 'subscriptions' THEN
    v_business_id := COALESCE(NEW.business_id, OLD.business_id);
  ELSIF TG_TABLE_NAME = 'business_locations' THEN
    v_business_id := COALESCE(NEW.business_id, OLD.business_id);
  ELSIF TG_TABLE_NAME = 'business_categories' THEN
    v_business_id := COALESCE(NEW.business_id, OLD.business_id);
  ELSIF TG_TABLE_NAME = 'testimonials' THEN
    v_business_id := COALESCE(NEW.business_id, OLD.business_id);
  ELSIF TG_TABLE_NAME = 'photos' THEN
    v_business_id := COALESCE(NEW.business_id, OLD.business_id);
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM refresh_search_index(v_business_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ─── 7. Create triggers (idempotent with DROP IF EXISTS) ───────────────

DROP TRIGGER IF EXISTS trg_bsi_businesses ON businesses;
CREATE TRIGGER trg_bsi_businesses
  AFTER INSERT OR UPDATE OR DELETE ON businesses
  FOR EACH ROW EXECUTE FUNCTION trigger_refresh_search_index();

DROP TRIGGER IF EXISTS trg_bsi_business_contacts ON business_contacts;
CREATE TRIGGER trg_bsi_business_contacts
  AFTER INSERT OR UPDATE OR DELETE ON business_contacts
  FOR EACH ROW EXECUTE FUNCTION trigger_refresh_search_index();

DROP TRIGGER IF EXISTS trg_bsi_subscriptions ON subscriptions;
CREATE TRIGGER trg_bsi_subscriptions
  AFTER INSERT OR UPDATE OR DELETE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION trigger_refresh_search_index();

DROP TRIGGER IF EXISTS trg_bsi_business_locations ON business_locations;
CREATE TRIGGER trg_bsi_business_locations
  AFTER INSERT OR UPDATE OR DELETE ON business_locations
  FOR EACH ROW EXECUTE FUNCTION trigger_refresh_search_index();

DROP TRIGGER IF EXISTS trg_bsi_business_categories ON business_categories;
CREATE TRIGGER trg_bsi_business_categories
  AFTER INSERT OR UPDATE OR DELETE ON business_categories
  FOR EACH ROW EXECUTE FUNCTION trigger_refresh_search_index();

DROP TRIGGER IF EXISTS trg_bsi_testimonials ON testimonials;
CREATE TRIGGER trg_bsi_testimonials
  AFTER INSERT OR UPDATE OR DELETE ON testimonials
  FOR EACH ROW EXECUTE FUNCTION trigger_refresh_search_index();

DROP TRIGGER IF EXISTS trg_bsi_photos ON photos;
CREATE TRIGGER trg_bsi_photos
  AFTER INSERT OR UPDATE OR DELETE ON photos
  FOR EACH ROW EXECUTE FUNCTION trigger_refresh_search_index();

-- ─── 8. Grant permissions ──────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION refresh_search_index(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_all_search_index() TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_quality_score(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_exposure_penalty(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_rank_score(uuid) TO authenticated;

-- ─── 9. Populate the index ─────────────────────────────────────────────

SELECT refresh_all_search_index();
