-- =============================================================================
-- 00013_phase1_search_index.sql
-- Materialized search index table, eligibility function, refresh triggers
-- =============================================================================

-- ─── Search index table ─────────────────────────────────────────────

CREATE TABLE business_search_index (
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
  search_vector    tsvector,
  indexed_at       timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_bsi_geom ON business_search_index USING GIST (geom);
CREATE INDEX idx_bsi_categories ON business_search_index USING GIN (category_names);
CREATE INDEX idx_bsi_search_vector ON business_search_index USING GIN (search_vector);
CREATE INDEX idx_bsi_slug ON business_search_index(slug);

-- RLS: public SELECT, admin-only write
ALTER TABLE business_search_index ENABLE ROW LEVEL SECURITY;

CREATE POLICY bsi_select ON business_search_index
  FOR SELECT USING (true);

CREATE POLICY bsi_insert ON business_search_index
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY bsi_update ON business_search_index
  FOR UPDATE USING (is_admin());

CREATE POLICY bsi_delete ON business_search_index
  FOR DELETE USING (is_admin());

-- ─── Auto-compute search_vector on INSERT/UPDATE ──────────────────────

CREATE OR REPLACE FUNCTION bsi_compute_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.category_names, ' '), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.suburb, '')), 'D');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bsi_search_vector
  BEFORE INSERT OR UPDATE ON business_search_index
  FOR EACH ROW EXECUTE FUNCTION bsi_compute_search_vector();

-- ─── Eligibility check function ─────────────────────────────────────

CREATE OR REPLACE FUNCTION is_search_eligible(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM businesses b
    JOIN business_contacts bc ON bc.business_id = b.id
    WHERE b.id = p_business_id
      AND b.verification_status = 'approved'
      AND b.status != 'suspended'
      AND bc.has_contact = true
      AND b.claim_status = 'claimed'
      AND (
        -- Seed/imported listings don't need a subscription
        b.listing_source != 'manual'
        -- Manual listings need an active subscription
        OR EXISTS (
          SELECT 1 FROM subscriptions s
          WHERE s.business_id = b.id
            AND s.status IN ('active', 'past_due')
        )
      )
  );
$$;

-- ─── Refresh single business ────────────────────────────────────────

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
      listing_source, is_claimed, indexed_at
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
      indexed_at = now();
  ELSE
    -- Not eligible: remove from index if present
    DELETE FROM business_search_index WHERE business_id = p_business_id;
  END IF;
END;
$$;

-- ─── Refresh all ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION refresh_all_search_index()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
BEGIN
  -- Truncate and rebuild
  TRUNCATE business_search_index;

  FOR r IN SELECT id FROM businesses LOOP
    PERFORM refresh_search_index(r.id);
  END LOOP;
END;
$$;

-- ─── Trigger functions ──────────────────────────────────────────────

-- Generic trigger that refreshes the search index for a business
CREATE OR REPLACE FUNCTION trigger_refresh_search_index()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  -- Determine the business_id based on the table
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

-- ─── Create triggers ────────────────────────────────────────────────

CREATE TRIGGER trg_bsi_businesses
  AFTER INSERT OR UPDATE OR DELETE ON businesses
  FOR EACH ROW EXECUTE FUNCTION trigger_refresh_search_index();

CREATE TRIGGER trg_bsi_business_contacts
  AFTER INSERT OR UPDATE OR DELETE ON business_contacts
  FOR EACH ROW EXECUTE FUNCTION trigger_refresh_search_index();

CREATE TRIGGER trg_bsi_subscriptions
  AFTER INSERT OR UPDATE OR DELETE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION trigger_refresh_search_index();

CREATE TRIGGER trg_bsi_business_locations
  AFTER INSERT OR UPDATE OR DELETE ON business_locations
  FOR EACH ROW EXECUTE FUNCTION trigger_refresh_search_index();

CREATE TRIGGER trg_bsi_business_categories
  AFTER INSERT OR UPDATE OR DELETE ON business_categories
  FOR EACH ROW EXECUTE FUNCTION trigger_refresh_search_index();

CREATE TRIGGER trg_bsi_testimonials
  AFTER INSERT OR UPDATE OR DELETE ON testimonials
  FOR EACH ROW EXECUTE FUNCTION trigger_refresh_search_index();

CREATE TRIGGER trg_bsi_photos
  AFTER INSERT OR UPDATE OR DELETE ON photos
  FOR EACH ROW EXECUTE FUNCTION trigger_refresh_search_index();

-- ─── Initial population ─────────────────────────────────────────────

SELECT refresh_all_search_index();
