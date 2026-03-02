-- 00015: Business Metrics (search impressions + profile views)

-- Create business_metrics table for daily aggregated metrics
CREATE TABLE IF NOT EXISTS public.business_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  search_impressions integer NOT NULL DEFAULT 0,
  profile_views integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (business_id, date)
);

-- Index for querying by business + date range
CREATE INDEX idx_business_metrics_business_date
  ON public.business_metrics (business_id, date DESC);

-- Function to increment search impressions for multiple businesses
CREATE OR REPLACE FUNCTION public.increment_search_impressions(p_business_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.business_metrics (business_id, date, search_impressions, profile_views)
  SELECT unnest(p_business_ids), CURRENT_DATE, 1, 0
  ON CONFLICT (business_id, date)
  DO UPDATE SET
    search_impressions = business_metrics.search_impressions + 1,
    updated_at = now();
END;
$$;

-- Function to increment profile views for a single business
CREATE OR REPLACE FUNCTION public.increment_profile_view(p_business_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.business_metrics (business_id, date, profile_views, search_impressions)
  VALUES (p_business_id, CURRENT_DATE, 1, 0)
  ON CONFLICT (business_id, date)
  DO UPDATE SET
    profile_views = business_metrics.profile_views + 1,
    updated_at = now();
END;
$$;

-- Function to get metrics summary for a business (last 30 days)
CREATE OR REPLACE FUNCTION public.get_business_metrics(
  p_business_id uuid,
  p_days integer DEFAULT 30
)
RETURNS TABLE (
  total_impressions bigint,
  total_views bigint,
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

-- RLS
ALTER TABLE public.business_metrics ENABLE ROW LEVEL SECURITY;

-- Business owners can read their own metrics
CREATE POLICY "Business owners can view own metrics"
  ON public.business_metrics
  FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
  );

-- Admins can read all metrics
CREATE POLICY "Admins can view all metrics"
  ON public.business_metrics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role / triggers can insert/update (SECURITY DEFINER functions handle this)

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION public.increment_search_impressions(uuid[]) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.increment_profile_view(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_business_metrics(uuid, integer) TO authenticated;

-- Updated_at trigger
CREATE TRIGGER set_business_metrics_updated_at
  BEFORE UPDATE ON public.business_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
