-- 00049: Subscription lifecycle granular billing statuses
--
-- Adds new billing_status values:
--   'paused_subscription_expired' — subscription period ended (cancelled)
--   'paused_payment_failed'       — final payment attempt failed
--
-- Also updates is_search_eligible() and is_business_visible() to use
-- a whitelist approach (IN ('active', 'trial', 'seed')) instead of
-- != 'billing_suspended' so any future "bad" statuses are auto-excluded.

-- 1. Expand billing_status CHECK constraint
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_billing_status_check;
ALTER TABLE businesses ADD CONSTRAINT businesses_billing_status_check
  CHECK (billing_status IN (
    'active', 'trial', 'billing_suspended', 'seed',
    'paused_subscription_expired', 'paused_payment_failed'
  ));

-- 2. Update is_search_eligible to use whitelist approach
CREATE OR REPLACE FUNCTION is_search_eligible(p_business_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_eligible boolean := false;
BEGIN
  SELECT INTO v_eligible
    CASE WHEN
      b.verification_status = 'approved'
      AND b.status NOT IN ('suspended', 'paused')
      AND b.deleted_at IS NULL
      AND b.billing_status IN ('active', 'trial', 'seed')
      AND bc.has_contact = true
      AND (
        b.claim_status = 'claimed'
        OR (
          b.is_seed = true
          AND b.claim_status != 'claimed'
          AND COALESCE(b.seed_confidence, 0) >= 0.5
        )
      )
    THEN true ELSE false END
  FROM businesses b
  LEFT JOIN business_contacts bc ON bc.business_id = b.id
  WHERE b.id = p_business_id;

  RETURN COALESCE(v_eligible, false);
END;
$$;

-- 3. Update is_business_visible to use whitelist approach
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
      AND b.billing_status IN ('active', 'trial', 'seed')
    THEN true ELSE false END
  FROM businesses b
  WHERE b.id = p_business_id;

  RETURN COALESCE(v_visible, false);
END;
$$;
