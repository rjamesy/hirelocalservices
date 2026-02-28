-- Add reset control columns to system_flags
ALTER TABLE system_flags
  ADD COLUMN IF NOT EXISTS allow_operational_reset boolean NOT NULL DEFAULT false;
ALTER TABLE system_flags
  ADD COLUMN IF NOT EXISTS production_environment boolean NOT NULL DEFAULT false;

-- Deterministic operational data reset function
CREATE OR REPLACE FUNCTION admin_reset_operational_data(
  confirm_phrase text,
  dry_run boolean DEFAULT false,
  production_confirm text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_counts jsonb := '{}'::jsonb;
  v_total bigint := 0;
  v_validation jsonb;
  v_result jsonb;
  v_table_name text;
  v_count bigint;
  v_tables_to_count text[] := ARRAY[
    'abuse_events', 'admin_reviews', 'business_categories', 'business_claims',
    'business_contacts', 'business_locations', 'business_metrics',
    'business_search_index', 'businesses', 'otp_verifications',
    'payment_events', 'photos', 'reports', 'seed_ai_runs', 'seed_blacklist',
    'seed_candidates', 'seed_place_details', 'seed_publish_runs',
    'seed_query_runs', 'seed_seen_places', 'subscriptions', 'system_alerts',
    'testimonials', 'user_notifications', 'user_subscriptions',
    'verification_jobs'
  ];
BEGIN
  -- Guard 1: Authentication
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Guard 2: Admin role
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = v_actor_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin privileges required';
  END IF;

  -- Guard 3: Reset flag enabled
  IF NOT (SELECT allow_operational_reset FROM system_flags LIMIT 1) THEN
    RAISE EXCEPTION 'Operational reset not enabled. Enable in System Settings first.';
  END IF;

  -- Guard 4: Confirmation phrase
  IF confirm_phrase IS DISTINCT FROM 'RESET ALL OPERATIONAL DATA' THEN
    RAISE EXCEPTION 'Invalid confirmation phrase';
  END IF;

  -- Guard 5: Production environment requires second phrase
  IF (SELECT production_environment FROM system_flags LIMIT 1) THEN
    IF production_confirm IS DISTINCT FROM 'CONFIRM PRODUCTION RESET' THEN
      RAISE EXCEPTION 'Production environment requires second confirmation phrase: CONFIRM PRODUCTION RESET';
    END IF;
  END IF;

  -- Collect pre-truncate row counts
  FOREACH v_table_name IN ARRAY v_tables_to_count LOOP
    EXECUTE format('SELECT count(*) FROM %I', v_table_name) INTO v_count;
    v_counts := v_counts || jsonb_build_object(v_table_name, v_count);
    v_total := v_total + v_count;
  END LOOP;

  -- Build validation (reference tables must have data)
  v_validation := jsonb_build_object(
    'categories_count', (SELECT count(*) FROM categories),
    'postcodes_count', (SELECT count(*) FROM postcodes)
  );

  -- If dry run, add post-truncate checks as current state and return
  IF dry_run THEN
    v_validation := v_validation || jsonb_build_object(
      'businesses_count', (SELECT count(*) FROM businesses),
      'business_claims_count', (SELECT count(*) FROM business_claims),
      'user_subscriptions_count', (SELECT count(*) FROM user_subscriptions),
      'seed_candidates_count', (SELECT count(*) FROM seed_candidates),
      'seed_query_runs_count', (SELECT count(*) FROM seed_query_runs),
      'seed_publish_runs_count', (SELECT count(*) FROM seed_publish_runs),
      'all_passed', (
        (SELECT count(*) FROM categories) > 0
        AND (SELECT count(*) FROM postcodes) > 0
      )
    );

    RETURN jsonb_build_object(
      'dry_run', true,
      'tables_cleared', 26,
      'rows_to_remove', v_counts,
      'total_rows_to_remove', v_total,
      'validation', v_validation,
      'executed_by', v_actor_id,
      'executed_at', now()
    );
  END IF;

  -- Execute truncate (single statement, all 26 tables)
  TRUNCATE
    business_metrics, photos, testimonials, business_categories,
    verification_jobs, business_claims, business_contacts,
    business_search_index, business_locations, subscriptions,
    user_subscriptions, user_notifications, abuse_events, reports,
    admin_reviews, payment_events, otp_verifications, system_alerts,
    seed_seen_places, seed_query_runs, seed_place_details,
    seed_candidates, seed_ai_runs, seed_blacklist, seed_publish_runs,
    businesses
  RESTART IDENTITY CASCADE;

  -- Post-truncate validation
  v_validation := v_validation || jsonb_build_object(
    'businesses_count', (SELECT count(*) FROM businesses),
    'business_claims_count', (SELECT count(*) FROM business_claims),
    'user_subscriptions_count', (SELECT count(*) FROM user_subscriptions),
    'seed_candidates_count', (SELECT count(*) FROM seed_candidates),
    'seed_query_runs_count', (SELECT count(*) FROM seed_query_runs),
    'seed_publish_runs_count', (SELECT count(*) FROM seed_publish_runs),
    'all_passed', (
      (SELECT count(*) FROM categories) > 0
      AND (SELECT count(*) FROM postcodes) > 0
      AND (SELECT count(*) FROM businesses) = 0
      AND (SELECT count(*) FROM business_claims) = 0
      AND (SELECT count(*) FROM user_subscriptions) = 0
      AND (SELECT count(*) FROM seed_candidates) = 0
      AND (SELECT count(*) FROM seed_query_runs) = 0
      AND (SELECT count(*) FROM seed_publish_runs) = 0
    )
  );

  -- Build result
  v_result := jsonb_build_object(
    'dry_run', false,
    'tables_cleared', 26,
    'rows_removed', v_counts,
    'total_rows_removed', v_total,
    'validation', v_validation,
    'executed_by', v_actor_id,
    'executed_at', now()
  );

  -- Insert audit log FIRST
  INSERT INTO audit_log (action, actor_id, details)
  VALUES ('operational_reset_executed', v_actor_id, v_result);

  -- THEN disable flag
  UPDATE system_flags SET allow_operational_reset = false;

  RETURN v_result;
END;
$$;
