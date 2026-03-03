-- 00048: Contact click tracking columns + RPC

-- Add click tracking columns to business_metrics
ALTER TABLE public.business_metrics
  ADD COLUMN IF NOT EXISTS phone_clicks integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_clicks integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS website_clicks integer NOT NULL DEFAULT 0;

-- Function to increment contact clicks
CREATE OR REPLACE FUNCTION public.increment_contact_click(
  p_business_id uuid,
  p_click_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate click type
  IF p_click_type NOT IN ('phone', 'email', 'website') THEN
    RAISE EXCEPTION 'Invalid click type: %', p_click_type;
  END IF;

  -- Upsert the metrics row
  INSERT INTO public.business_metrics (business_id, date, search_impressions, profile_views, phone_clicks, email_clicks, website_clicks)
  VALUES (p_business_id, CURRENT_DATE, 0, 0, 0, 0, 0)
  ON CONFLICT (business_id, date) DO NOTHING;

  -- Increment the specific click column
  IF p_click_type = 'phone' THEN
    UPDATE public.business_metrics
    SET phone_clicks = phone_clicks + 1, updated_at = now()
    WHERE business_id = p_business_id AND date = CURRENT_DATE;
  ELSIF p_click_type = 'email' THEN
    UPDATE public.business_metrics
    SET email_clicks = email_clicks + 1, updated_at = now()
    WHERE business_id = p_business_id AND date = CURRENT_DATE;
  ELSIF p_click_type = 'website' THEN
    UPDATE public.business_metrics
    SET website_clicks = website_clicks + 1, updated_at = now()
    WHERE business_id = p_business_id AND date = CURRENT_DATE;
  END IF;
END;
$$;

-- Drop old get_business_metrics (return type is changing — PG requires DROP first)
DROP FUNCTION IF EXISTS public.get_business_metrics(uuid, integer);

-- Recreate get_business_metrics with click data columns
CREATE OR REPLACE FUNCTION public.get_business_metrics(
  p_business_id uuid,
  p_days integer DEFAULT 30
)
RETURNS TABLE (
  total_impressions bigint,
  total_views bigint,
  total_phone_clicks bigint,
  total_email_clicks bigint,
  total_website_clicks bigint,
  daily_impressions json,
  daily_views json
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(bm.search_impressions), 0) AS total_impressions,
    COALESCE(SUM(bm.profile_views), 0) AS total_views,
    COALESCE(SUM(bm.phone_clicks), 0) AS total_phone_clicks,
    COALESCE(SUM(bm.email_clicks), 0) AS total_email_clicks,
    COALESCE(SUM(bm.website_clicks), 0) AS total_website_clicks,
    COALESCE(
      json_agg(
        json_build_object('date', bm.date, 'count', bm.search_impressions)
        ORDER BY bm.date
      ) FILTER (WHERE bm.search_impressions > 0),
      '[]'::json
    ) AS daily_impressions,
    COALESCE(
      json_agg(
        json_build_object('date', bm.date, 'count', bm.profile_views)
        ORDER BY bm.date
      ) FILTER (WHERE bm.profile_views > 0),
      '[]'::json
    ) AS daily_views
  FROM public.business_metrics bm
  WHERE bm.business_id = p_business_id
    AND bm.date >= CURRENT_DATE - p_days;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_contact_click(uuid, text) TO authenticated, anon;
