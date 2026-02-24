-- Add pending_changes column for draft/publish model
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS pending_changes jsonb;

-- Add 'paused' to status constraint
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_status_check;
ALTER TABLE businesses ADD CONSTRAINT businesses_status_check
  CHECK (status IN ('draft', 'published', 'suspended', 'paused'));

-- Update is_search_eligible to exclude paused listings
CREATE OR REPLACE FUNCTION is_search_eligible(p_business_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM businesses b
    JOIN business_contacts bc ON bc.business_id = b.id
    WHERE b.id = p_business_id
      AND b.verification_status = 'approved'
      AND b.status NOT IN ('suspended', 'paused')
      AND bc.has_contact = true
      AND b.claim_status = 'claimed'
      AND (b.listing_source != 'manual' OR EXISTS (
        SELECT 1 FROM subscriptions s
        WHERE s.business_id = b.id AND s.status IN ('active', 'past_due')
      ))
  );
$$;
