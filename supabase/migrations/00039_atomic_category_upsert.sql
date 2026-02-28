-- =============================================================================
-- 00039_atomic_category_upsert.sql
-- Atomic category save: replace DELETE+INSERT race with single RPC transaction.
-- If any INSERT fires the trigger and fails, the DELETE is rolled back.
-- =============================================================================

CREATE OR REPLACE FUNCTION upsert_business_categories(
  p_business_id     UUID,
  p_primary_id      UUID,
  p_secondary_ids   UUID[] DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate max 3 secondaries (COALESCE handles NULL for empty array)
  IF COALESCE(array_length(p_secondary_ids, 1), 0) > 3 THEN
    RAISE EXCEPTION 'You can select up to 3 additional categories'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Ownership check (SECURITY DEFINER bypasses RLS, so verify manually)
  -- Column is owner_id on the businesses table (FK to profiles.id)
  IF NOT EXISTS (
    SELECT 1 FROM businesses
    WHERE id = p_business_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to modify this business'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Atomic: DELETE + INSERT in single implicit transaction.
  -- If any INSERT triggers enforce_same_category_group() and fails,
  -- the entire function (including the DELETE) rolls back.

  DELETE FROM business_categories WHERE business_id = p_business_id;

  INSERT INTO business_categories (business_id, category_id, is_primary)
  VALUES (p_business_id, p_primary_id, true);

  IF COALESCE(array_length(p_secondary_ids, 1), 0) > 0 THEN
    INSERT INTO business_categories (business_id, category_id, is_primary)
    SELECT p_business_id, unnest(p_secondary_ids), false;
  END IF;
END;
$$;

-- Only authenticated users can call this (server actions use authenticated client)
REVOKE ALL ON FUNCTION upsert_business_categories FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_business_categories TO authenticated;
