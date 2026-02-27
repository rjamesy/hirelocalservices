-- Phase 4: Operational Hardening
-- system_alerts table, soft_launch_mode flag, missing indexes

-- ── system_alerts table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  body TEXT,
  source TEXT,
  metadata JSONB DEFAULT '{}',
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_alerts_unresolved ON system_alerts (created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX idx_system_alerts_severity ON system_alerts (severity, created_at DESC);

ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read system_alerts"
  ON system_alerts FOR SELECT
  USING (is_admin());

CREATE POLICY "Service role can insert system_alerts"
  ON system_alerts FOR INSERT
  WITH CHECK (current_setting('role') = 'service_role');

CREATE POLICY "Admins can update system_alerts"
  ON system_alerts FOR UPDATE
  USING (is_admin());

-- ── soft_launch_mode flag ───────────────────────────────────────────

ALTER TABLE system_flags
  ADD COLUMN IF NOT EXISTS soft_launch_mode BOOLEAN NOT NULL DEFAULT false;

-- ── missing indexes ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_businesses_billing_status
  ON businesses (billing_status);
