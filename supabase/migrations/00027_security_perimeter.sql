-- =============================================================================
-- Migration 00027: Security Perimeter (Phase 1)
--
-- Fixes:
--   A. is_business_visible() — restore verification_status + published checks
--   B. business_contacts SELECT RLS — remove OR true leak
--   C. Storage policies — lock down writes to business owners only
--   D. Transactional claim approval/rejection SQL functions (admin-enforced)
-- =============================================================================

-- ─── A. Fix is_business_visible ─────────────────────────────────────────────
-- Canonical rule: a business is publicly visible iff published, approved,
-- not deleted, and not billing-suspended.

CREATE OR REPLACE FUNCTION is_business_visible(p_business_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_visible boolean := false;
BEGIN
  SELECT INTO v_visible
    CASE WHEN
      b.status = 'published'
      AND b.verification_status = 'approved'
      AND b.deleted_at IS NULL
      AND b.billing_status != 'billing_suspended'
    THEN true ELSE false END
  FROM businesses b
  WHERE b.id = p_business_id;

  RETURN COALESCE(v_visible, false);
END;
$$;

-- ─── B. Fix business_contacts SELECT RLS ────────────────────────────────────
-- Remove the OR true that makes all contacts globally readable.

DROP POLICY IF EXISTS business_contacts_select ON business_contacts;

CREATE POLICY business_contacts_select ON business_contacts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
    OR is_admin()
    OR is_business_visible(business_id)
  );

-- ─── C. Lock down storage write policies ────────────────────────────────────
-- Helper: safely extract business_id (uuid) from storage object path.
-- Path format: {business_id}/{timestamp}-{filename}
-- Returns NULL if first segment is not a valid UUID → all ownership checks deny.

CREATE OR REPLACE FUNCTION storage_object_business_id(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_segment text;
  v_uuid uuid;
BEGIN
  v_segment := split_part(object_name, '/', 1);
  IF v_segment IS NULL OR v_segment = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    v_uuid := v_segment::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;
  RETURN v_uuid;
END;
$$;

-- Drop all 4 existing permissive policies
DROP POLICY IF EXISTS "Public read access on photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete photos" ON storage.objects;

-- SELECT: defense-in-depth (bucket is public so CDN bypasses RLS,
-- but this protects authenticated API reads)
CREATE POLICY "photos_select_secured" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'photos'
    AND (
      is_business_visible(storage_object_business_id(name))
      OR owns_business(storage_object_business_id(name))
      OR is_admin()
    )
  );

-- INSERT: only business owner or admin
CREATE POLICY "photos_insert_secured" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'photos'
    AND auth.role() = 'authenticated'
    AND (
      owns_business(storage_object_business_id(name))
      OR is_admin()
    )
  );

-- UPDATE: only business owner or admin
CREATE POLICY "photos_update_secured" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'photos'
    AND auth.role() = 'authenticated'
    AND (
      owns_business(storage_object_business_id(name))
      OR is_admin()
    )
  );

-- DELETE: only business owner or admin
CREATE POLICY "photos_delete_secured" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'photos'
    AND auth.role() = 'authenticated'
    AND (
      owns_business(storage_object_business_id(name))
      OR is_admin()
    )
  );

-- ─── D. Transactional claim approval ────────────────────────────────────────
-- Admin check enforced at SQL level via is_admin(). reviewed_by uses auth.uid().

CREATE OR REPLACE FUNCTION approve_business_claim(
  p_claim_id uuid,
  p_admin_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id uuid;
  v_claim record;
  v_business_id uuid;
  v_claimer_id uuid;
BEGIN
  -- Enforce admin at SQL level
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized: admin role required';
  END IF;

  v_admin_id := auth.uid();

  -- 1. Lock and fetch claim
  SELECT * INTO v_claim
  FROM business_claims
  WHERE id = p_claim_id
  FOR UPDATE;

  IF v_claim IS NULL THEN
    RETURN jsonb_build_object('error', 'Claim not found');
  END IF;

  -- Idempotency: already approved is a no-op success
  IF v_claim.status = 'approved' THEN
    RETURN jsonb_build_object(
      'success', true,
      'business_id', v_claim.business_id,
      'claimer_id', v_claim.claimer_id
    );
  END IF;

  IF v_claim.status != 'pending' THEN
    RETURN jsonb_build_object('error', 'Claim is not pending');
  END IF;

  v_business_id := v_claim.business_id;
  v_claimer_id := v_claim.claimer_id;

  -- 2. Update claim status to approved
  UPDATE business_claims
  SET status = 'approved',
      reviewed_at = now(),
      reviewed_by = v_admin_id,
      admin_notes = p_admin_notes
  WHERE id = p_claim_id;

  -- 3. Transfer business ownership
  UPDATE businesses
  SET owner_id = v_claimer_id,
      claim_status = 'claimed',
      is_seed = false,
      status = 'published',
      verification_status = 'approved'
  WHERE id = v_business_id;

  -- 4. Mark contacts as verified
  UPDATE business_contacts
  SET verified_at = now()
  WHERE business_id = v_business_id;

  -- 5. Reject other pending claims for this business
  UPDATE business_claims
  SET status = 'rejected',
      reviewed_at = now(),
      reviewed_by = v_admin_id
  WHERE business_id = v_business_id
    AND status = 'pending'
    AND id != p_claim_id;

  -- 6. Refresh search index
  PERFORM refresh_search_index(v_business_id);

  -- 7. Audit log
  PERFORM insert_audit_log(
    'listing_claim_approved',
    'listing',
    v_business_id,
    v_admin_id,
    jsonb_build_object(
      'claim_id', p_claim_id,
      'claimer_id', v_claimer_id,
      'admin_notes', COALESCE(p_admin_notes, '')
    )
  );

  -- 8. Notify claimer
  INSERT INTO user_notifications (user_id, type, title, message, metadata)
  VALUES (
    v_claimer_id,
    'claim_approved',
    'Claim Approved',
    'Your claim has been approved! You now own this business listing.',
    jsonb_build_object('claimId', p_claim_id, 'businessId', v_business_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'business_id', v_business_id,
    'claimer_id', v_claimer_id
  );
END;
$$;

-- ─── Transactional claim rejection ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION reject_business_claim(
  p_claim_id uuid,
  p_admin_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id uuid;
  v_claim record;
  v_business_id uuid;
  v_claimer_id uuid;
  v_remaining_pending bigint;
BEGIN
  -- Enforce admin at SQL level
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized: admin role required';
  END IF;

  v_admin_id := auth.uid();

  -- 1. Lock and fetch claim
  SELECT * INTO v_claim
  FROM business_claims
  WHERE id = p_claim_id
  FOR UPDATE;

  IF v_claim IS NULL THEN
    RETURN jsonb_build_object('error', 'Claim not found');
  END IF;

  -- Idempotency: already rejected is a no-op success
  IF v_claim.status = 'rejected' THEN
    RETURN jsonb_build_object(
      'success', true,
      'business_id', v_claim.business_id,
      'claimer_id', v_claim.claimer_id
    );
  END IF;

  IF v_claim.status != 'pending' THEN
    RETURN jsonb_build_object('error', 'Claim is not pending');
  END IF;

  v_business_id := v_claim.business_id;
  v_claimer_id := v_claim.claimer_id;

  -- 2. Reject the claim
  UPDATE business_claims
  SET status = 'rejected',
      reviewed_at = now(),
      reviewed_by = v_admin_id,
      admin_notes = p_admin_notes
  WHERE id = p_claim_id;

  -- 3. Check remaining pending claims
  SELECT count(*) INTO v_remaining_pending
  FROM business_claims
  WHERE business_id = v_business_id
    AND status = 'pending';

  -- 4. If none remain, reset business claim_status
  IF v_remaining_pending = 0 THEN
    UPDATE businesses
    SET claim_status = 'unclaimed'
    WHERE id = v_business_id;
  END IF;

  -- 5. Audit log
  PERFORM insert_audit_log(
    'listing_claim_rejected',
    'listing',
    v_business_id,
    v_admin_id,
    jsonb_build_object(
      'claim_id', p_claim_id,
      'admin_notes', COALESCE(p_admin_notes, '')
    )
  );

  -- 6. Notify claimer
  INSERT INTO user_notifications (user_id, type, title, message, metadata)
  VALUES (
    v_claimer_id,
    'claim_rejected',
    'Claim Rejected',
    'Your claim has been rejected.' ||
      CASE WHEN p_admin_notes IS NOT NULL AND p_admin_notes != ''
        THEN ' Reason: ' || p_admin_notes
        ELSE ''
      END,
    jsonb_build_object('claimId', p_claim_id, 'businessId', v_business_id, 'notes', COALESCE(p_admin_notes, ''))
  );

  RETURN jsonb_build_object(
    'success', true,
    'business_id', v_business_id,
    'claimer_id', v_claimer_id
  );
END;
$$;

-- Grant execute to authenticated (SQL-level admin check enforced inside functions)
GRANT EXECUTE ON FUNCTION approve_business_claim(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_business_claim(uuid, text) TO authenticated;
