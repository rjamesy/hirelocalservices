-- =============================================================================
-- 00050_security_hardening.sql
-- Security fixes from code review: notifications, contact clicks,
-- publish race condition lock, blacklist RPC for self-delete
-- =============================================================================

-- NOTE: Storage RLS (P0-1) is already handled by migration 00027_security_perimeter.sql
-- which creates photos_insert_secured, photos_update_secured, photos_delete_secured policies
-- using owns_business() and is_admin() helpers. No changes needed here.


-- ─── P1-10: Notifications — restrict INSERT to service role only ────────────
-- Old policy: WITH CHECK (true) allows any authenticated user to insert
-- notifications for any user. Restrict to service_role context only.

DROP POLICY IF EXISTS "Service role can insert notifications" ON user_notifications;

CREATE POLICY "Service role can insert notifications"
  ON user_notifications FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ─── P1-11: Contact click — revoke anon access, restrict to authenticated ───
-- Revoking EXECUTE from anon prevents unauthenticated metric inflation.

REVOKE EXECUTE ON FUNCTION public.increment_contact_click(uuid, text) FROM anon;


-- ─── P1-9: Publish race condition — atomic compare-and-swap ─────────────────
-- Atomically sets review_status to 'pending' only if it isn't already.
-- Returns true if the lock was acquired (status changed), false otherwise.
-- This prevents two concurrent publishChanges() calls from both proceeding.

CREATE OR REPLACE FUNCTION public.claim_publish_lock(p_business_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.working_listings
  SET review_status = 'pending'
  WHERE business_id = p_business_id
    AND review_status != 'pending'
    AND archived_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_publish_lock(uuid) TO authenticated;


-- ─── P0-4: Blacklist insert RPC for self-delete ─────────────────────────────
-- SECURITY DEFINER function that allows inserting blacklist entries during
-- account self-deletion. Validates that the caller's profile is being suspended
-- (suspended_at IS NOT NULL) to prevent abuse by arbitrary authenticated users.

CREATE OR REPLACE FUNCTION public.blacklist_on_delete(
  p_identifiers jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate: caller's profile must already be suspended (set by deleteMyAccount before this call)
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND suspended_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'blacklist_on_delete: caller profile is not suspended';
  END IF;

  INSERT INTO public.blacklist (term, match_type, field_type, reason, added_by, is_active)
  SELECT
    (item->>'term')::text,
    'exact',
    (item->>'field_type')::text,
    'Account self-deleted',
    auth.uid(),
    true
  FROM jsonb_array_elements(p_identifiers) AS item
  WHERE (item->>'field_type') IS NOT NULL
    AND (item->>'term') IS NOT NULL
    AND length((item->>'term')::text) > 0
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.blacklist_on_delete(jsonb) TO authenticated;
