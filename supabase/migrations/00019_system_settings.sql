-- 00019: System settings (admin-controlled key-value store)

CREATE TABLE IF NOT EXISTS public.system_settings (
  key        text        PRIMARY KEY,
  value      jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid        REFERENCES public.profiles(id)
);

-- RLS: admin only
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage system_settings"
  ON public.system_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Seed default values (idempotent)
INSERT INTO public.system_settings (key, value) VALUES
  ('openai_api_key', 'null'::jsonb),
  ('seed_visibility_days', '30'::jsonb),
  ('mask_seed_phone', 'true'::jsonb),
  ('seed_exposure_level', '"normal"'::jsonb),
  ('seed_source_osm', 'true'::jsonb),
  ('seed_source_manual', 'true'::jsonb),
  ('ranking_weight_premium_annual', '40'::jsonb),
  ('ranking_weight_premium', '30'::jsonb),
  ('ranking_weight_basic', '10'::jsonb),
  ('ranking_weight_trial', '0'::jsonb),
  ('exposure_balance_strength', '10'::jsonb),
  ('email_template_subject', '"Your business has been listed on HireLocalServices"'::jsonb),
  ('email_template_body', '"Hi,\n\nYour business has been listed on HireLocalServices.com.au.\n\nView your listing: {view_url}\n\nIf you did not request this listing, you can unlist it here: {unlist_url}\n\nRegards,\nHireLocalServices Team"'::jsonb),
  ('ai_verification_enabled', 'true'::jsonb),
  ('ai_verification_strictness', '"normal"'::jsonb)
ON CONFLICT (key) DO NOTHING;
