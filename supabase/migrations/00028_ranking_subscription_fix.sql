-- =============================================================================
-- 00028_ranking_subscription_fix.sql
-- Fix ranking functions to use user_subscriptions instead of deprecated
-- subscriptions table. Joins via businesses.owner_id → user_subscriptions.user_id.
-- =============================================================================

-- ─── Fix calculate_exposure_penalty ─────────────────────────────────

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
  -- Get recent impressions (last 7 days)
  SELECT COALESCE(SUM(search_impressions), 0)
  INTO v_recent_impressions
  FROM business_metrics
  WHERE business_id = p_business_id
    AND date >= CURRENT_DATE - 7;

  IF v_recent_impressions = 0 THEN
    RETURN 0;
  END IF;

  -- Get tier via owner_id join
  SELECT us.plan INTO v_tier
  FROM user_subscriptions us
  JOIN businesses b ON b.owner_id = us.user_id
  WHERE b.id = p_business_id
    AND us.status IN ('active', 'past_due')
  LIMIT 1;

  -- Get average impressions for businesses in the same tier (last 7 days)
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

  -- penalty = (recent / (avg + 1)) * 10, capped at 15
  v_ratio := v_recent_impressions::numeric / (v_avg_impressions + 1);
  RETURN LEAST(v_ratio * 10, 15);
END;
$$;

-- ─── Fix calculate_rank_score ───────────────────────────────────────

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
  -- Get subscription tier via owner_id join
  SELECT us.plan, us.current_period_end
  INTO v_tier, v_period_end
  FROM user_subscriptions us
  JOIN businesses b ON b.owner_id = us.user_id
  WHERE b.id = p_business_id
    AND us.status IN ('active', 'past_due')
  LIMIT 1;

  -- Tier weight (expired trials get 0)
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

  -- Quality score
  v_quality := COALESCE(calculate_quality_score(p_business_id), 0);

  -- Exposure penalty
  v_exposure_penalty := COALESCE(calculate_exposure_penalty(p_business_id), 0);

  RETURN ROUND(v_tier_weight + v_quality - v_exposure_penalty, 2);
END;
$$;

-- ─── Fix refresh_search_index ───────────────────────────────────────

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
      indexed_at
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
      indexed_at = now();
  ELSE
    DELETE FROM business_search_index WHERE business_id = p_business_id;
  END IF;
END;
$$;
