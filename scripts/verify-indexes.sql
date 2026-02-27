-- Verify core search queries use indexes (run against Supabase SQL editor)
-- Expected: Index Scan / Bitmap Index Scan for each query

-- 1. Search by category + geo
EXPLAIN ANALYZE
SELECT * FROM business_search_index
WHERE 'Cleaning' = ANY(category_names)
  AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint(153.025, -27.47), 4326)::geography, 25000)
LIMIT 20;

-- 2. Full-text keyword search
EXPLAIN ANALYZE
SELECT * FROM business_search_index
WHERE search_vector @@ plainto_tsquery('english', 'plumber')
LIMIT 20;

-- 3. Business by slug (public listing page)
EXPLAIN ANALYZE
SELECT * FROM businesses WHERE slug = 'test-business' LIMIT 1;

-- 4. Eligibility check (billing_status filter)
EXPLAIN ANALYZE
SELECT id, status, verification_status, billing_status, deleted_at
FROM businesses
WHERE billing_status = 'billing_suspended';

-- 5. Claims by business
EXPLAIN ANALYZE
SELECT * FROM business_claims
WHERE business_id = '00000000-0000-0000-0000-000000000000'
  AND status = 'pending';

-- 6. Abuse events count (circuit breaker check)
EXPLAIN ANALYZE
SELECT count(*) FROM abuse_events
WHERE event_type = 'failed_registration'
  AND created_at > now() - interval '5 minutes';

-- 7. Unresolved system alerts
EXPLAIN ANALYZE
SELECT * FROM system_alerts
WHERE resolved_at IS NULL
ORDER BY created_at DESC
LIMIT 50;
