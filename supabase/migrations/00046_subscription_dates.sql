-- 00046: Add subscription date tracking columns
-- subscribed_at: when the user first subscribed (never changes)
-- plan_changed_at: when the user last changed their plan

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS subscribed_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_changed_at timestamptz;

-- Backfill subscribed_at from created_at for existing subscriptions
UPDATE user_subscriptions
SET subscribed_at = COALESCE(current_period_start, updated_at)
WHERE subscribed_at IS NULL AND status != 'canceled';

-- Backfill plan_changed_at from updated_at for existing subscriptions
UPDATE user_subscriptions
SET plan_changed_at = updated_at
WHERE plan_changed_at IS NULL AND status != 'canceled';
