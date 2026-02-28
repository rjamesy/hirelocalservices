-- Fix: seeded businesses have NULL seed_confidence, failing the >= 0.5 eligibility check.
-- Set confidence to 0.7 for all seeds missing it, then rebuild the search index.

UPDATE businesses
SET seed_confidence = 0.7
WHERE is_seed = true
  AND seed_confidence IS NULL;

-- Refresh the search index so eligible seeds appear in search results
SELECT refresh_all_search_index();
