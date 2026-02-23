-- 00020: Audit log table + write function

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  action      text        NOT NULL,
  entity_type text,
  entity_id   uuid,
  actor_id    uuid        REFERENCES public.profiles(id),
  details     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_audit_log_action_created
  ON public.audit_log (action, created_at DESC);

CREATE INDEX idx_audit_log_actor_created
  ON public.audit_log (actor_id, created_at DESC);

CREATE INDEX idx_audit_log_entity
  ON public.audit_log (entity_type, entity_id);

-- RLS: admin SELECT only, no direct INSERT (use function)
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit_log"
  ON public.audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- SECURITY DEFINER function for server-side writes
CREATE OR REPLACE FUNCTION public.insert_audit_log(
  p_action      text,
  p_entity_type text DEFAULT NULL,
  p_entity_id   uuid DEFAULT NULL,
  p_actor_id    uuid DEFAULT NULL,
  p_details     jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.audit_log (action, entity_type, entity_id, actor_id, details)
  VALUES (p_action, p_entity_type, p_entity_id, p_actor_id, p_details);
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_audit_log(text, text, uuid, uuid, jsonb) TO authenticated;
