-- Migration 00026: Protection Pack v1
-- Idempotent: safe to re-run (uses IF NOT EXISTS, ON CONFLICT DO NOTHING)

-- ─── system_flags table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_flags (
  id integer PRIMARY KEY DEFAULT 1,
  registrations_enabled boolean DEFAULT true,
  listings_enabled boolean DEFAULT true,
  payments_enabled boolean DEFAULT true,
  claims_enabled boolean DEFAULT true,
  maintenance_mode boolean DEFAULT false,
  maintenance_message text DEFAULT 'System temporarily unavailable. Please try again later.',
  captcha_required boolean DEFAULT false,
  listings_require_approval boolean DEFAULT false,
  circuit_breaker_triggered_at timestamptz DEFAULT NULL,
  circuit_breaker_cooldown_minutes integer DEFAULT 15,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Ensure default row always exists
INSERT INTO system_flags (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- RLS for system_flags
ALTER TABLE system_flags ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'system_flags' AND policyname = 'system_flags_public_read'
  ) THEN
    CREATE POLICY system_flags_public_read ON system_flags FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'system_flags' AND policyname = 'system_flags_admin_update'
  ) THEN
    CREATE POLICY system_flags_admin_update ON system_flags FOR UPDATE USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
  END IF;
END $$;

-- ─── abuse_events table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS abuse_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  ip_address text,
  user_id uuid REFERENCES auth.users(id),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abuse_events_created ON abuse_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_abuse_events_type_created ON abuse_events (event_type, created_at DESC);

-- RLS for abuse_events
ALTER TABLE abuse_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'abuse_events' AND policyname = 'abuse_events_admin_read'
  ) THEN
    CREATE POLICY abuse_events_admin_read ON abuse_events FOR SELECT USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'abuse_events' AND policyname = 'abuse_events_service_insert'
  ) THEN
    CREATE POLICY abuse_events_service_insert ON abuse_events FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- ─── payment_events table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  stripe_customer_id text,
  stripe_subscription_id text,
  event_type text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_user ON payment_events (user_id, created_at DESC);

-- RLS for payment_events
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payment_events' AND policyname = 'payment_events_admin_read'
  ) THEN
    CREATE POLICY payment_events_admin_read ON payment_events FOR SELECT USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payment_events' AND policyname = 'payment_events_service_insert'
  ) THEN
    CREATE POLICY payment_events_service_insert ON payment_events FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- ─── SQL Functions ──────────────────────────────────────────────────

-- Count abuse events in a time window (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION get_abuse_event_count(p_event_type text, p_minutes int)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT count(*)
  FROM abuse_events
  WHERE event_type = p_event_type
    AND created_at > now() - (p_minutes || ' minutes')::interval;
$$;

-- Get system flags (SECURITY DEFINER for fast middleware reads)
CREATE OR REPLACE FUNCTION get_system_flags()
RETURNS SETOF system_flags
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT * FROM system_flags WHERE id = 1;
$$;
