-- 00016: Blacklist system

CREATE TABLE IF NOT EXISTS public.blacklist (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  term text NOT NULL,
  match_type text NOT NULL DEFAULT 'contains' CHECK (match_type IN ('exact', 'contains', 'starts_with')),
  reason text,
  added_by uuid REFERENCES public.profiles(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Unique constraint on term + match_type
CREATE UNIQUE INDEX idx_blacklist_term_type
  ON public.blacklist (lower(term), match_type);

-- Index for active entries
CREATE INDEX idx_blacklist_active
  ON public.blacklist (is_active) WHERE is_active = true;

-- RLS
ALTER TABLE public.blacklist ENABLE ROW LEVEL SECURITY;

-- Only admins can manage blacklist
CREATE POLICY "Admins can manage blacklist"
  ON public.blacklist
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Function to check if a business name is blacklisted
CREATE OR REPLACE FUNCTION public.is_blacklisted(p_name text)
RETURNS TABLE (is_blocked boolean, matched_term text, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_name_lower text := lower(trim(p_name));
  v_row record;
BEGIN
  FOR v_row IN
    SELECT b.term, b.match_type, b.reason
    FROM public.blacklist b
    WHERE b.is_active = true
  LOOP
    IF v_row.match_type = 'exact' AND v_name_lower = lower(v_row.term) THEN
      RETURN QUERY SELECT true, v_row.term, v_row.reason;
      RETURN;
    ELSIF v_row.match_type = 'contains' AND v_name_lower LIKE '%' || lower(v_row.term) || '%' THEN
      RETURN QUERY SELECT true, v_row.term, v_row.reason;
      RETURN;
    ELSIF v_row.match_type = 'starts_with' AND v_name_lower LIKE lower(v_row.term) || '%' THEN
      RETURN QUERY SELECT true, v_row.term, v_row.reason;
      RETURN;
    END IF;
  END LOOP;

  -- Not blacklisted
  RETURN QUERY SELECT false, NULL::text, NULL::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_blacklisted(text) TO authenticated, anon;

-- Seed some default blacklist entries
INSERT INTO public.blacklist (term, match_type, reason) VALUES
  ('escort', 'contains', 'Adult services not permitted'),
  ('brothel', 'contains', 'Adult services not permitted'),
  ('strip club', 'contains', 'Adult services not permitted'),
  ('adult entertainment', 'contains', 'Adult services not permitted'),
  ('erotic', 'contains', 'Adult services not permitted'),
  ('massage parlour', 'contains', 'Ambiguous — often adult services'),
  ('happy ending', 'contains', 'Adult services not permitted'),
  ('sex shop', 'contains', 'Adult retail not permitted'),
  ('xxx', 'contains', 'Adult content not permitted')
ON CONFLICT DO NOTHING;
