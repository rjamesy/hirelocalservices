-- 00047: Add field_type to blacklist for identifier-based blocking
-- field_type allows blacklisting by specific identifier type:
--   'business_name' (default, existing behavior)
--   'email' — user email
--   'phone' — normalized digits only
--   'website' — normalized lowercase, no protocol/www
--   'abn' — normalized digits only
--   'acn' — normalized digits only

ALTER TABLE public.blacklist
  ADD COLUMN IF NOT EXISTS field_type text NOT NULL DEFAULT 'business_name';

-- Update the unique constraint to include field_type
DROP INDEX IF EXISTS idx_blacklist_term_type;
CREATE UNIQUE INDEX idx_blacklist_term_type
  ON public.blacklist (lower(term), match_type, field_type);

-- Add check constraint for valid field types
ALTER TABLE public.blacklist
  ADD CONSTRAINT blacklist_field_type_check
  CHECK (field_type IN ('business_name', 'email', 'phone', 'website', 'abn', 'acn'));

-- Update is_blacklisted function to accept field_type parameter
CREATE OR REPLACE FUNCTION public.is_blacklisted(p_value text, p_field_type text DEFAULT 'business_name')
RETURNS TABLE (is_blocked boolean, matched_term text, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_value_lower text := lower(trim(p_value));
  v_row record;
BEGIN
  FOR v_row IN
    SELECT b.term, b.match_type, b.reason
    FROM public.blacklist b
    WHERE b.is_active = true
      AND b.field_type = p_field_type
  LOOP
    IF v_row.match_type = 'exact' AND v_value_lower = lower(v_row.term) THEN
      RETURN QUERY SELECT true, v_row.term, v_row.reason;
      RETURN;
    ELSIF v_row.match_type = 'contains' AND v_value_lower LIKE '%' || lower(v_row.term) || '%' THEN
      RETURN QUERY SELECT true, v_row.term, v_row.reason;
      RETURN;
    ELSIF v_row.match_type = 'starts_with' AND v_value_lower LIKE lower(v_row.term) || '%' THEN
      RETURN QUERY SELECT true, v_row.term, v_row.reason;
      RETURN;
    END IF;
  END LOOP;

  -- Not blacklisted
  RETURN QUERY SELECT false, NULL::text, NULL::text;
END;
$$;

-- Keep backward compatibility: the old 1-arg version still works for business names
-- The new 2-arg version is the canonical one used by the expanded blacklist system

GRANT EXECUTE ON FUNCTION public.is_blacklisted(text, text) TO authenticated, anon;

-- Update existing entries to have field_type = 'business_name'
UPDATE public.blacklist SET field_type = 'business_name' WHERE field_type = 'business_name';
