-- =============================================================================
-- 00009_add_plan_tier.sql
-- Add plan tier and stripe_price_id columns to subscriptions table
-- =============================================================================

ALTER TABLE subscriptions
  ADD COLUMN plan text NOT NULL DEFAULT 'basic'
    CHECK (plan IN ('free_trial', 'basic', 'premium', 'premium_annual')),
  ADD COLUMN stripe_price_id text;
