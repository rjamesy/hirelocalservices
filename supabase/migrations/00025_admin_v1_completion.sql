-- 00025_admin_v1_completion.sql
-- Admin V1 Completion: soft delete, account management, notifications, ops reports
-- FULLY IDEMPOTENT: safe to re-run. Uses IF NOT EXISTS, CREATE OR REPLACE, DO $$ blocks.

-- ─── profiles: add admin_notes, suspended_at, suspended_reason ────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS admin_notes text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_reason text;

-- ─── businesses: add deleted_at ───────────────────────────────────────
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_businesses_deleted_at ON businesses (deleted_at) WHERE deleted_at IS NOT NULL;

-- ─── reports: add resolution fields ───────────────────────────────────
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution_outcome text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES profiles(id);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- ─── user_notifications table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}',
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread
  ON user_notifications (user_id, read) WHERE read = FALSE;

-- Enable RLS on user_notifications
DO $$ BEGIN
  ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

-- RLS policies for user_notifications
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_notifications' AND policyname = 'Users can read own notifications') THEN
    CREATE POLICY "Users can read own notifications" ON user_notifications
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_notifications' AND policyname = 'Users can update own notifications') THEN
    CREATE POLICY "Users can update own notifications" ON user_notifications
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_notifications' AND policyname = 'Admins can read all notifications') THEN
    CREATE POLICY "Admins can read all notifications" ON user_notifications
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_notifications' AND policyname = 'Service role can insert notifications') THEN
    CREATE POLICY "Service role can insert notifications" ON user_notifications
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- ─── Update is_search_eligible to exclude deleted ─────────────────────
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
      AND b.billing_status != 'billing_suspended'
      AND bc.has_contact = true
      AND (
        b.claim_status = 'claimed'
        OR (b.is_seed = true AND b.claim_status != 'claimed')
      )
    THEN true ELSE false END
  FROM businesses b
  LEFT JOIN business_contacts bc ON bc.business_id = b.id
  WHERE b.id = p_business_id;

  RETURN COALESCE(v_eligible, false);
END;
$$;

-- ─── Update is_business_visible to exclude deleted ────────────────────
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
      b.status NOT IN ('suspended', 'paused')
      AND b.deleted_at IS NULL
      AND b.billing_status != 'billing_suspended'
    THEN true ELSE false END
  FROM businesses b
  WHERE b.id = p_business_id;

  RETURN COALESCE(v_visible, false);
END;
$$;

-- ─── Update explain_search_eligibility to include not_deleted check ───
CREATE OR REPLACE FUNCTION explain_search_eligibility(p_business_id uuid)
RETURNS TABLE(check_name text, passed boolean, detail text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_biz record;
  v_contact record;
BEGIN
  SELECT * INTO v_biz FROM businesses WHERE id = p_business_id;
  IF v_biz IS NULL THEN
    RETURN QUERY SELECT 'business_exists'::text, false, 'Business not found'::text;
    RETURN;
  END IF;

  SELECT * INTO v_contact FROM business_contacts WHERE business_id = p_business_id LIMIT 1;

  -- not_deleted check
  RETURN QUERY SELECT
    'not_deleted'::text,
    (v_biz.deleted_at IS NULL),
    CASE WHEN v_biz.deleted_at IS NULL THEN 'Not deleted' ELSE 'Soft-deleted at ' || v_biz.deleted_at::text END;

  -- verification check
  RETURN QUERY SELECT
    'verification_approved'::text,
    (v_biz.verification_status = 'approved'),
    'verification_status = ' || COALESCE(v_biz.verification_status::text, 'null');

  -- status check
  RETURN QUERY SELECT
    'status_ok'::text,
    (v_biz.status NOT IN ('suspended', 'paused')),
    'status = ' || COALESCE(v_biz.status::text, 'null');

  -- billing check
  RETURN QUERY SELECT
    'billing_ok'::text,
    (v_biz.billing_status != 'billing_suspended'),
    'billing_status = ' || COALESCE(v_biz.billing_status::text, 'null');

  -- contact check
  RETURN QUERY SELECT
    'has_contact'::text,
    COALESCE(v_contact.has_contact, false),
    CASE WHEN v_contact IS NULL THEN 'No contact record' ELSE 'has_contact = ' || v_contact.has_contact::text END;

  -- claim/seed check
  RETURN QUERY SELECT
    'claimed_or_seed'::text,
    (v_biz.claim_status = 'claimed' OR (v_biz.is_seed = true AND v_biz.claim_status != 'claimed')),
    'claim_status = ' || COALESCE(v_biz.claim_status::text, 'null') || ', is_seed = ' || v_biz.is_seed::text;

  RETURN;
END;
$$;

-- ─── Operational Report RPC: Subscription Metrics ─────────────────────
CREATE OR REPLACE FUNCTION get_subscription_metrics(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_cutoff timestamptz := now() - (p_days || ' days')::interval;
BEGIN
  SELECT jsonb_build_object(
    'active_count', (SELECT count(*) FROM user_subscriptions WHERE status = 'active'),
    'trial_count', (SELECT count(*) FROM user_subscriptions WHERE status = 'active' AND plan = 'free_trial'),
    'past_due_count', (SELECT count(*) FROM user_subscriptions WHERE status = 'past_due'),
    'canceled_count', (SELECT count(*) FROM user_subscriptions WHERE status = 'canceled'),
    'by_plan', (
      SELECT jsonb_agg(jsonb_build_object('plan', plan, 'count', cnt))
      FROM (SELECT plan, count(*) as cnt FROM user_subscriptions WHERE status IN ('active','past_due') GROUP BY plan ORDER BY cnt DESC) sub
    ),
    'new_by_day', (
      SELECT jsonb_agg(jsonb_build_object('date', d, 'count', cnt))
      FROM (
        SELECT date_trunc('day', updated_at)::date as d, count(*) as cnt
        FROM user_subscriptions
        WHERE updated_at >= v_cutoff AND status IN ('active','past_due')
        GROUP BY d ORDER BY d
      ) sub
    ),
    'expiring_trials', (
      SELECT count(*) FROM user_subscriptions
      WHERE plan = 'free_trial' AND status = 'active'
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at <= now() + interval '7 days'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ─── Operational Report RPC: Listing Metrics ──────────────────────────
CREATE OR REPLACE FUNCTION get_listing_metrics(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_cutoff timestamptz := now() - (p_days || ' days')::interval;
BEGIN
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM businesses WHERE deleted_at IS NULL),
    'published', (SELECT count(*) FROM businesses WHERE status = 'published' AND deleted_at IS NULL),
    'draft', (SELECT count(*) FROM businesses WHERE status = 'draft' AND deleted_at IS NULL),
    'suspended', (SELECT count(*) FROM businesses WHERE status = 'suspended' AND deleted_at IS NULL),
    'paused', (SELECT count(*) FROM businesses WHERE status = 'paused' AND deleted_at IS NULL),
    'deleted', (SELECT count(*) FROM businesses WHERE deleted_at IS NOT NULL),
    'by_state', (
      SELECT jsonb_agg(jsonb_build_object('state', state, 'count', cnt))
      FROM (
        SELECT bl.state, count(*) as cnt
        FROM businesses b
        JOIN business_locations bl ON bl.business_id = b.id
        WHERE b.deleted_at IS NULL AND bl.state IS NOT NULL
        GROUP BY bl.state ORDER BY cnt DESC
      ) sub
    ),
    'by_category', (
      SELECT jsonb_agg(jsonb_build_object('category', name, 'count', cnt))
      FROM (
        SELECT c.name, count(*) as cnt
        FROM business_categories bc
        JOIN categories c ON c.id = bc.category_id
        JOIN businesses b ON b.id = bc.business_id
        WHERE b.deleted_at IS NULL
        GROUP BY c.name ORDER BY cnt DESC LIMIT 10
      ) sub
    ),
    'new_by_day', (
      SELECT jsonb_agg(jsonb_build_object('date', d, 'count', cnt))
      FROM (
        SELECT date_trunc('day', created_at)::date as d, count(*) as cnt
        FROM businesses
        WHERE created_at >= v_cutoff AND deleted_at IS NULL
        GROUP BY d ORDER BY d
      ) sub
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ─── Operational Report RPC: Moderation Metrics ───────────────────────
CREATE OR REPLACE FUNCTION get_moderation_metrics(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_cutoff timestamptz := now() - (p_days || ' days')::interval;
BEGIN
  SELECT jsonb_build_object(
    'open_reports', (SELECT count(*) FROM reports WHERE status = 'open'),
    'resolved_reports', (SELECT count(*) FROM reports WHERE status = 'resolved' AND created_at >= v_cutoff),
    'reports_by_reason', (
      SELECT jsonb_agg(jsonb_build_object('reason', reason, 'count', cnt))
      FROM (SELECT reason::text, count(*) as cnt FROM reports WHERE created_at >= v_cutoff GROUP BY reason ORDER BY cnt DESC) sub
    ),
    'reports_by_day', (
      SELECT jsonb_agg(jsonb_build_object('date', d, 'count', cnt))
      FROM (
        SELECT date_trunc('day', created_at)::date as d, count(*) as cnt
        FROM reports WHERE created_at >= v_cutoff GROUP BY d ORDER BY d
      ) sub
    ),
    'verification_decisions', (
      SELECT jsonb_agg(jsonb_build_object('decision', final_decision, 'count', cnt))
      FROM (
        SELECT final_decision::text, count(*) as cnt
        FROM verification_jobs
        WHERE created_at >= v_cutoff AND final_decision IS NOT NULL
        GROUP BY final_decision ORDER BY cnt DESC
      ) sub
    ),
    'claims_by_day', (
      SELECT jsonb_agg(jsonb_build_object('date', d, 'count', cnt))
      FROM (
        SELECT date_trunc('day', created_at)::date as d, count(*) as cnt
        FROM business_claims WHERE created_at >= v_cutoff GROUP BY d ORDER BY d
      ) sub
    ),
    'pending_claims', (SELECT count(*) FROM business_claims WHERE status = 'pending'),
    'pending_verification', (SELECT count(*) FROM businesses WHERE verification_status = 'pending' AND deleted_at IS NULL)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
