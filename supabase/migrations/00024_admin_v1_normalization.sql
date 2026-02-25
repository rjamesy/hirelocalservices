-- Migration: Admin v1 normalization
-- Adds suspended_reason/suspended_at, owner_id constraint, subscription repair,
-- unique index, explain_search_eligibility RPC, and admin RLS policy.

-- ─── 1a. Schema changes ─────────────────────────────────────────────

-- Add suspended columns to businesses
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS suspended_reason text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

-- Non-seed listings must have owner_id
ALTER TABLE businesses ADD CONSTRAINT businesses_owner_id_required
  CHECK (is_seed = true OR owner_id IS NOT NULL);

-- Unique index on stripe_subscription_id (non-null only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_sub_id
  ON user_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- ─── 1b. Subscription repair ────────────────────────────────────────

-- Step 1: Cancel all duplicate subscriptions, keeping only the best per user
WITH ranked AS (
  SELECT id, user_id, status,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        CASE status
          WHEN 'active' THEN 0
          WHEN 'past_due' THEN 1
          WHEN 'incomplete' THEN 2
          WHEN 'unpaid' THEN 3
          WHEN 'canceled' THEN 4
          ELSE 5
        END,
        updated_at DESC NULLS LAST
    ) AS rn
  FROM user_subscriptions
)
UPDATE user_subscriptions
SET status = 'canceled', updated_at = now()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
  AND status NOT IN ('canceled');

-- Step 2: Drop old unique constraint on user_id (if exists) to replace
-- with partial unique index that allows multiple canceled rows
ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_user_id_key;

-- Step 3: Add partial unique index — only one non-canceled/non-unpaid row per user
CREATE UNIQUE INDEX idx_user_subscriptions_one_active_per_user
  ON user_subscriptions (user_id)
  WHERE status NOT IN ('canceled', 'unpaid');

-- ─── 1c. Fix SQL functions ──────────────────────────────────────────

-- Re-create is_search_eligible using billing_status (not legacy subscriptions join)
CREATE OR REPLACE FUNCTION is_search_eligible(p_business_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM businesses b
    JOIN business_contacts bc ON bc.business_id = b.id
    WHERE b.id = p_business_id
      AND b.verification_status = 'approved'
      AND b.status NOT IN ('suspended', 'paused')
      AND b.billing_status != 'billing_suspended'
      AND bc.has_contact = true
      AND b.claim_status = 'claimed'
  );
$$;

-- Re-create is_business_visible using billing_status (not legacy subscriptions join)
CREATE OR REPLACE FUNCTION is_business_visible(p_business_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM businesses b
    WHERE b.id = p_business_id
      AND b.verification_status = 'approved'
      AND b.status NOT IN ('suspended')
      AND b.billing_status != 'billing_suspended'
  );
$$;

-- Create explain_search_eligibility RPC function
CREATE OR REPLACE FUNCTION explain_search_eligibility(p_business_id uuid)
RETURNS TABLE (check_name text, passed boolean, detail text)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_biz RECORD;
  v_contact RECORD;
  v_owner_sub RECORD;
BEGIN
  -- Check business exists
  SELECT id, verification_status, status, billing_status, claim_status, owner_id, is_seed
  INTO v_biz FROM businesses WHERE id = p_business_id;

  IF v_biz IS NULL THEN
    RETURN QUERY SELECT 'business_exists'::text, false, 'Business not found'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'business_exists'::text, true, 'Business found'::text;

  -- Check verification_approved
  RETURN QUERY SELECT
    'verification_approved'::text,
    v_biz.verification_status = 'approved',
    ('verification_status = ' || COALESCE(v_biz.verification_status::text, 'NULL'))::text;

  -- Check not_suspended_or_paused
  RETURN QUERY SELECT
    'not_suspended_or_paused'::text,
    v_biz.status NOT IN ('suspended', 'paused'),
    ('status = ' || COALESCE(v_biz.status::text, 'NULL'))::text;

  -- Check billing_ok
  RETURN QUERY SELECT
    'billing_ok'::text,
    v_biz.billing_status != 'billing_suspended',
    ('billing_status = ' || COALESCE(v_biz.billing_status::text, 'NULL'))::text;

  -- Check has_contact
  SELECT has_contact INTO v_contact
  FROM business_contacts WHERE business_id = p_business_id;

  RETURN QUERY SELECT
    'has_contact'::text,
    COALESCE(v_contact.has_contact, false),
    CASE WHEN v_contact IS NULL THEN 'No business_contacts row'
         ELSE 'has_contact = ' || v_contact.has_contact::text END;

  -- Check is_claimed
  RETURN QUERY SELECT
    'is_claimed'::text,
    v_biz.claim_status = 'claimed',
    ('claim_status = ' || COALESCE(v_biz.claim_status::text, 'NULL'))::text;

  -- Check owner_entitlements (for non-seed businesses with owner_id)
  IF NOT v_biz.is_seed AND v_biz.owner_id IS NOT NULL THEN
    SELECT status INTO v_owner_sub
    FROM user_subscriptions
    WHERE user_id = v_biz.owner_id
      AND status NOT IN ('canceled', 'unpaid')
    LIMIT 1;

    RETURN QUERY SELECT
      'owner_entitlements'::text,
      v_owner_sub IS NOT NULL AND v_owner_sub.status IN ('active', 'past_due'),
      CASE WHEN v_owner_sub IS NULL THEN 'No active user_subscription found'
           ELSE 'user_subscription status = ' || v_owner_sub.status END;
  END IF;
END;
$$;

-- ─── 1d. Admin RLS policy on user_subscriptions ─────────────────────

-- Allow admins to read all user_subscriptions
CREATE POLICY "Admins can read all subscriptions"
  ON user_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );
