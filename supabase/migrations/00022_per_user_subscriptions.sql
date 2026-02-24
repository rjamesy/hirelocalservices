-- Migration: Per-user subscriptions
-- Moves from per-business (subscriptions) to per-user (user_subscriptions)

-- 1. Create user_subscriptions table
CREATE TABLE user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) UNIQUE,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text NOT NULL DEFAULT 'active',
  plan text NOT NULL DEFAULT 'free_trial',
  stripe_price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  trial_ends_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- 2. Add billing_status to businesses
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'active'
  CHECK (billing_status IN ('active', 'trial', 'billing_suspended'));
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- 3. Migrate existing subscription data into user_subscriptions
INSERT INTO user_subscriptions (user_id, stripe_customer_id, stripe_subscription_id,
  status, plan, stripe_price_id, current_period_start, current_period_end,
  cancel_at_period_end, trial_ends_at, updated_at)
SELECT b.owner_id, s.stripe_customer_id, s.stripe_subscription_id,
  s.status, s.plan, s.stripe_price_id, s.current_period_start,
  s.current_period_end, s.cancel_at_period_end,
  CASE WHEN s.plan = 'free_trial' THEN s.current_period_end ELSE NULL END,
  s.updated_at
FROM subscriptions s
JOIN businesses b ON b.id = s.business_id
ON CONFLICT (user_id) DO NOTHING;

-- 4. Backfill billing_status on businesses
UPDATE businesses b SET billing_status = 'trial', trial_ends_at = us.trial_ends_at
FROM user_subscriptions us
WHERE us.user_id = b.owner_id AND us.plan = 'free_trial' AND us.status = 'active';

UPDATE businesses b SET billing_status = 'active'
FROM user_subscriptions us
WHERE us.user_id = b.owner_id AND us.plan != 'free_trial'
  AND us.status IN ('active', 'past_due');

-- 5. Add max_premium_listings system setting
INSERT INTO system_settings (key, value) VALUES ('max_premium_listings', '10')
ON CONFLICT (key) DO NOTHING;

-- 6. Update is_search_eligible to use billing_status instead of subscription join
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

-- 7. Enable RLS on user_subscriptions
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own subscription"
  ON user_subscriptions FOR SELECT USING (auth.uid() = user_id);
