-- =============================================================================
-- 00045_pw_schema_and_backfill.sql
-- Phase 1: P/W Architecture — Schema + Backfill
--
-- Creates published_listings (P) and working_listings (W) tables.
-- Backfills P0 from existing published/paused/suspended+approved businesses.
-- Backfills W from existing draft + pending_changes businesses.
-- NO changes to the businesses table. Old system runs unchanged.
-- Rollback: DROP TABLE published_listings, working_listings CASCADE;
--
-- ── BACKFILL DECISIONS (explicit) ──────────────────────────────────────────
--
-- PHOTOS/TESTIMONIALS IN P0:
--   P0 snapshots the "current public set" — photos/testimonials WHERE
--   status='live'. This is a BEST-EFFORT P0 BOOTSTRAP. Rationale:
--   - For published businesses, status='live' = what visitors see right now.
--   - pending_add items were never shown publicly (awaiting approval).
--   - pending_delete items are still live (shown until next approval), so
--     they remain status='live' and ARE included in the P0 snapshot.
--   - This snapshot represents the public view at migration time.
--
-- PENDING_CHANGES SCOPE:
--   The legacy PendingChanges type contains ONLY text fields:
--     name, description, phone, email_contact, website, abn.
--   Location and categories were NEVER part of pending_changes — in the
--   legacy model they are written directly to business_locations and
--   business_categories (immediate, not deferred).
--
-- W BACKFILL — LOCATION/CATEGORIES FOR EDIT ROWS:
--   Since pending_changes never contained location or categories, the W
--   backfill for edit rows (change_type='edit') COPY-FORWARDS current
--   values from business_locations and business_categories. This is correct
--   because the relational tables hold the latest values — there is no
--   "pending" version of location/categories in the legacy model.
--
-- =============================================================================


-- ─── 1. Create published_listings (P) ──────────────────────────────────────

CREATE TABLE published_listings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  amendment             INT NOT NULL DEFAULT 0,
  is_current            BOOLEAN NOT NULL DEFAULT TRUE,
  visibility_status     TEXT NOT NULL DEFAULT 'live'
                        CHECK (visibility_status IN ('live', 'paused', 'suspended')),

  -- Business details (snapshot — immutable after creation)
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL,
  description           TEXT,
  phone                 TEXT,
  email_contact         TEXT,
  website               TEXT,
  abn                   TEXT,

  -- Location (denormalized snapshot — immutable after creation)
  address_text          TEXT,
  suburb                TEXT,
  state                 TEXT,
  postcode              TEXT,
  lat                   DOUBLE PRECISION,
  lng                   DOUBLE PRECISION,
  service_radius_km     INT,

  -- Categories (denormalized snapshot — immutable after creation)
  category_ids          UUID[] DEFAULT '{}',
  category_names        TEXT[] DEFAULT '{}',
  primary_category_id   UUID,

  -- Media (denormalized JSONB snapshots — immutable after creation)
  -- Best-effort P0 bootstrap: snapshots status='live' items at migration time
  photos_snapshot       JSONB DEFAULT '[]',
  testimonials_snapshot JSONB DEFAULT '[]',

  -- Approval metadata
  approved_by           UUID REFERENCES profiles(id),
  approval_comment      TEXT,
  verification_job_id   UUID REFERENCES verification_jobs(id),
  approved_at           TIMESTAMPTZ DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No duplicate amendments per business
ALTER TABLE published_listings
  ADD CONSTRAINT published_listings_business_amendment_unique
  UNIQUE (business_id, amendment);

-- One current P per business (DB-enforced)
CREATE UNIQUE INDEX published_listings_one_current_per_business
  ON published_listings (business_id)
  WHERE is_current = TRUE;

-- FK lookups
CREATE INDEX idx_published_listings_business_id
  ON published_listings (business_id);

-- Amendment history queries
CREATE INDEX idx_published_listings_amendment_history
  ON published_listings (business_id, amendment DESC);

-- Public read fast path
CREATE INDEX idx_published_listings_current_live
  ON published_listings (business_id)
  WHERE is_current = TRUE AND visibility_status = 'live';


-- ─── 2. Create working_listings (W) ────────────────────────────────────────

CREATE TABLE working_listings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id             UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- Business details (editable)
  name                    TEXT NOT NULL,
  description             TEXT,
  phone                   TEXT,
  email_contact           TEXT,
  website                 TEXT,
  abn                     TEXT,

  -- Location (editable)
  address_text            TEXT,
  suburb                  TEXT,
  state                   TEXT,
  postcode                TEXT,
  lat                     DOUBLE PRECISION,
  lng                     DOUBLE PRECISION,
  service_radius_km       INT DEFAULT 25,

  -- Categories (editable)
  primary_category_id     UUID,
  secondary_category_ids  UUID[] DEFAULT '{}',

  -- Review lifecycle
  review_status           TEXT NOT NULL DEFAULT 'draft'
                          CHECK (review_status IN ('draft', 'pending', 'changes_required')),
  change_type             TEXT NOT NULL DEFAULT 'new'
                          CHECK (change_type IN ('new', 'edit')),
  rejection_reason        TEXT,
  rejection_count         INT DEFAULT 0,
  verification_job_id     UUID REFERENCES verification_jobs(id),
  submitted_at            TIMESTAMPTZ,
  reviewed_at             TIMESTAMPTZ,
  reviewed_by             UUID REFERENCES profiles(id),
  archived_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one active W per business (DB-enforced)
CREATE UNIQUE INDEX working_listings_one_active_per_business
  ON working_listings (business_id)
  WHERE archived_at IS NULL;

-- FK lookups
CREATE INDEX idx_working_listings_business_id
  ON working_listings (business_id);

-- Admin queue: pending reviews
CREATE INDEX idx_working_listings_admin_queue
  ON working_listings (review_status)
  WHERE archived_at IS NULL;

-- updated_at trigger (reuses existing function)
CREATE TRIGGER trg_working_listings_updated_at
  BEFORE UPDATE ON working_listings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ─── 3. RLS policies ───────────────────────────────────────────────────────

ALTER TABLE published_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_listings ENABLE ROW LEVEL SECURITY;

-- P: public can read current+live, owner reads all theirs, admin reads all
CREATE POLICY published_listings_select ON published_listings
  FOR SELECT USING (
    (is_current = TRUE AND visibility_status = 'live')
    OR owns_business(business_id)
    OR is_admin()
  );

CREATE POLICY published_listings_insert ON published_listings
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY published_listings_update ON published_listings
  FOR UPDATE USING (
    owns_business(business_id) OR is_admin()
  ) WITH CHECK (
    owns_business(business_id) OR is_admin()
  );

CREATE POLICY published_listings_delete ON published_listings
  FOR DELETE USING (is_admin());

-- W: owner reads/writes theirs, admin reads/writes all. Never public.
CREATE POLICY working_listings_select ON working_listings
  FOR SELECT USING (
    owns_business(business_id) OR is_admin()
  );

CREATE POLICY working_listings_insert ON working_listings
  FOR INSERT WITH CHECK (
    owns_business(business_id) OR is_admin()
  );

CREATE POLICY working_listings_update ON working_listings
  FOR UPDATE USING (
    owns_business(business_id) OR is_admin()
  ) WITH CHECK (
    owns_business(business_id) OR is_admin()
  );

CREATE POLICY working_listings_delete ON working_listings
  FOR DELETE USING (is_admin());


-- ─── 4. Backfill P0 rows ───────────────────────────────────────────────────
--
-- ELIGIBILITY: verification_status='approved'
--              AND status IN ('published','paused','suspended')
--              AND deleted_at IS NULL
--
-- VISIBILITY_STATUS MAPPING:
--   status='published' → 'live'
--   status='paused'    → 'paused'
--   status='suspended' → 'suspended'
--
-- SNAPSHOT SOURCES:
--   Text fields:    businesses columns (name, description, phone, email_contact, website, abn)
--   Location:       business_locations (LEFT JOIN — may not exist for all)
--   Categories:     business_categories JOIN categories (LEFT JOIN LATERAL)
--   Photos:         photos WHERE status='live' → JSONB array (best-effort P0 bootstrap)
--   Testimonials:   testimonials WHERE status='live' → JSONB array (best-effort P0 bootstrap)
--   approved_at:    latest approved verification_job updated_at, fallback business.updated_at

INSERT INTO published_listings (
  business_id,
  amendment,
  is_current,
  visibility_status,
  name,
  slug,
  description,
  phone,
  email_contact,
  website,
  abn,
  address_text,
  suburb,
  state,
  postcode,
  lat,
  lng,
  service_radius_km,
  category_ids,
  category_names,
  primary_category_id,
  photos_snapshot,
  testimonials_snapshot,
  approved_at,
  created_at
)
SELECT
  b.id,
  0,
  TRUE,
  CASE
    WHEN b.status = 'published' THEN 'live'
    WHEN b.status = 'paused'    THEN 'paused'
    WHEN b.status = 'suspended' THEN 'suspended'
  END,
  b.name,
  b.slug,
  b.description,
  b.phone,
  b.email_contact,
  b.website,
  b.abn,
  bl.address_text,
  bl.suburb,
  bl.state,
  bl.postcode,
  bl.lat,
  bl.lng,
  bl.service_radius_km,
  COALESCE(cat_agg.cat_ids, '{}'),
  COALESCE(cat_agg.cat_names, '{}'),
  cat_agg.primary_id,
  COALESCE(photo_agg.snapshot, '[]'::jsonb),
  COALESCE(test_agg.snapshot, '[]'::jsonb),
  COALESCE(vj_agg.approved_at, b.updated_at),
  b.created_at
FROM businesses b
LEFT JOIN business_locations bl
  ON bl.business_id = b.id
LEFT JOIN LATERAL (
  SELECT
    ARRAY_AGG(bc.category_id)        AS cat_ids,
    ARRAY_AGG(c.name)                AS cat_names,
    (SELECT bc2.category_id
       FROM business_categories bc2
      WHERE bc2.business_id = b.id AND bc2.is_primary = true
      LIMIT 1)                       AS primary_id
  FROM business_categories bc
  JOIN categories c ON c.id = bc.category_id
  WHERE bc.business_id = b.id
) cat_agg ON TRUE
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',         p.id,
      'url',        p.url,
      'sort_order', p.sort_order
    ) ORDER BY p.sort_order
  ) AS snapshot
  FROM photos p
  WHERE p.business_id = b.id AND p.status = 'live'
) photo_agg ON TRUE
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',          t.id,
      'author_name', t.author_name,
      'text',        t.text,
      'rating',      t.rating
    ) ORDER BY t.created_at
  ) AS snapshot
  FROM testimonials t
  WHERE t.business_id = b.id AND t.status = 'live'
) test_agg ON TRUE
LEFT JOIN LATERAL (
  SELECT vj2.updated_at AS approved_at
  FROM verification_jobs vj2
  WHERE vj2.business_id = b.id AND vj2.final_decision = 'approved'
  ORDER BY vj2.updated_at DESC
  LIMIT 1
) vj_agg ON TRUE
WHERE b.deleted_at IS NULL
  AND b.verification_status = 'approved'
  AND b.status IN ('published', 'paused', 'suspended');


-- ─── 5. Backfill W rows — Source A: Drafts ─────────────────────────────────
--
-- ELIGIBILITY: status='draft' AND deleted_at IS NULL
--
-- REVIEW_STATUS MAPPING:
--   verification_status='pending'  → 'pending'  (submitted for first review)
--   verification_status='rejected' → 'changes_required' (rejected, user needs to fix)
--   anything else                  → 'draft'    (in progress)
--
-- CHANGE_TYPE: always 'new' (draft = never published)
--
-- FIELD SOURCES:
--   Text fields:    businesses columns
--   Location:       business_locations (current values — only source available)
--   Categories:     business_categories (current values — only source available)

INSERT INTO working_listings (
  business_id,
  name,
  description,
  phone,
  email_contact,
  website,
  abn,
  address_text,
  suburb,
  state,
  postcode,
  lat,
  lng,
  service_radius_km,
  primary_category_id,
  secondary_category_ids,
  review_status,
  change_type,
  submitted_at,
  created_at,
  updated_at
)
SELECT
  b.id,
  b.name,
  b.description,
  b.phone,
  b.email_contact,
  b.website,
  b.abn,
  bl.address_text,
  bl.suburb,
  bl.state,
  bl.postcode,
  bl.lat,
  bl.lng,
  bl.service_radius_km,
  cat_agg.primary_id,
  COALESCE(cat_agg.secondary_ids, '{}'),
  CASE
    WHEN b.verification_status = 'pending'  THEN 'pending'
    WHEN b.verification_status = 'rejected' THEN 'changes_required'
    ELSE 'draft'
  END,
  'new',
  CASE WHEN b.verification_status = 'pending' THEN b.updated_at ELSE NULL END,
  b.created_at,
  b.updated_at
FROM businesses b
LEFT JOIN business_locations bl
  ON bl.business_id = b.id
LEFT JOIN LATERAL (
  SELECT
    (SELECT bc2.category_id
       FROM business_categories bc2
      WHERE bc2.business_id = b.id AND bc2.is_primary = true
      LIMIT 1) AS primary_id,
    ARRAY(
      SELECT bc3.category_id
        FROM business_categories bc3
       WHERE bc3.business_id = b.id AND bc3.is_primary = false
    ) AS secondary_ids
) cat_agg ON TRUE
WHERE b.deleted_at IS NULL
  AND b.status = 'draft';


-- ─── 6. Backfill W rows — Source B: Published with pending_changes ─────────
--
-- ELIGIBILITY: pending_changes IS NOT NULL
--              AND status != 'draft' (drafts handled above)
--              AND deleted_at IS NULL
--
-- REVIEW_STATUS MAPPING:
--   verification_status='pending'  → 'pending'          (edits under review)
--   verification_status='rejected' → 'changes_required' (edits rejected)
--   anything else                  → 'draft'            (unsaved pending changes)
--
-- CHANGE_TYPE: always 'edit' (has an existing published version)
--
-- FIELD SOURCES — TEXT FIELDS:
--   pending_changes contains ONLY: name, description, phone, email_contact,
--   website, abn. These are merged over the base businesses columns using
--   COALESCE(pending_changes->>'field', businesses.field).
--
-- FIELD SOURCES — LOCATION:
--   Copy-forward from business_locations (current values). Location was
--   NEVER part of pending_changes in the legacy model — location edits
--   were applied immediately to business_locations.
--
-- FIELD SOURCES — CATEGORIES:
--   Copy-forward from business_categories (current values). Categories were
--   NEVER part of pending_changes in the legacy model — category edits
--   were applied immediately to business_categories.

INSERT INTO working_listings (
  business_id,
  name,
  description,
  phone,
  email_contact,
  website,
  abn,
  address_text,
  suburb,
  state,
  postcode,
  lat,
  lng,
  service_radius_km,
  primary_category_id,
  secondary_category_ids,
  review_status,
  change_type,
  submitted_at,
  created_at,
  updated_at
)
SELECT
  b.id,
  -- Text fields: merge pending_changes over base (pending_changes has priority)
  COALESCE(b.pending_changes->>'name',          b.name),
  COALESCE(b.pending_changes->>'description',   b.description),
  COALESCE(b.pending_changes->>'phone',          b.phone),
  COALESCE(b.pending_changes->>'email_contact',  b.email_contact),
  COALESCE(b.pending_changes->>'website',        b.website),
  COALESCE(b.pending_changes->>'abn',            b.abn),
  -- Location: copy-forward (never in pending_changes)
  bl.address_text,
  bl.suburb,
  bl.state,
  bl.postcode,
  bl.lat,
  bl.lng,
  bl.service_radius_km,
  -- Categories: copy-forward (never in pending_changes)
  cat_agg.primary_id,
  COALESCE(cat_agg.secondary_ids, '{}'),
  CASE
    WHEN b.verification_status = 'pending'  THEN 'pending'
    WHEN b.verification_status = 'rejected' THEN 'changes_required'
    ELSE 'draft'
  END,
  'edit',
  CASE WHEN b.verification_status = 'pending' THEN b.updated_at ELSE NULL END,
  b.updated_at,
  b.updated_at
FROM businesses b
LEFT JOIN business_locations bl
  ON bl.business_id = b.id
LEFT JOIN LATERAL (
  SELECT
    (SELECT bc2.category_id
       FROM business_categories bc2
      WHERE bc2.business_id = b.id AND bc2.is_primary = true
      LIMIT 1) AS primary_id,
    ARRAY(
      SELECT bc3.category_id
        FROM business_categories bc3
       WHERE bc3.business_id = b.id AND bc3.is_primary = false
    ) AS secondary_ids
) cat_agg ON TRUE
WHERE b.deleted_at IS NULL
  AND b.pending_changes IS NOT NULL
  AND b.status != 'draft';


-- ─── 7. Verification queries ───────────────────────────────────────────────
-- Run these after migration to validate backfill correctness.
-- These are SELECT-only — they do not modify data.

-- 7a. P0 count vs eligible businesses count (should match)
-- Expected: these two counts are equal
DO $$
DECLARE
  p_count INT;
  eligible_count INT;
BEGIN
  SELECT count(*) INTO p_count FROM published_listings;

  SELECT count(*) INTO eligible_count FROM businesses
  WHERE deleted_at IS NULL
    AND verification_status = 'approved'
    AND status IN ('published', 'paused', 'suspended');

  RAISE NOTICE 'P0 rows created: %. Eligible businesses: %. Match: %',
    p_count, eligible_count, (p_count = eligible_count);

  IF p_count != eligible_count THEN
    RAISE WARNING 'P0 COUNT MISMATCH: created % but expected %', p_count, eligible_count;
  END IF;
END $$;

-- 7b. W count by source (drafts vs pending_changes)
DO $$
DECLARE
  w_new_count INT;
  w_edit_count INT;
  draft_count INT;
  pending_changes_count INT;
BEGIN
  SELECT count(*) INTO w_new_count
  FROM working_listings WHERE archived_at IS NULL AND change_type = 'new';

  SELECT count(*) INTO w_edit_count
  FROM working_listings WHERE archived_at IS NULL AND change_type = 'edit';

  SELECT count(*) INTO draft_count
  FROM businesses WHERE deleted_at IS NULL AND status = 'draft';

  SELECT count(*) INTO pending_changes_count
  FROM businesses WHERE deleted_at IS NULL AND pending_changes IS NOT NULL AND status != 'draft';

  RAISE NOTICE 'W rows (new): %. Draft businesses: %. Match: %',
    w_new_count, draft_count, (w_new_count = draft_count);
  RAISE NOTICE 'W rows (edit): %. Pending_changes businesses: %. Match: %',
    w_edit_count, pending_changes_count, (w_edit_count = pending_changes_count);

  IF w_new_count != draft_count THEN
    RAISE WARNING 'W NEW COUNT MISMATCH: created % but expected %', w_new_count, draft_count;
  END IF;
  IF w_edit_count != pending_changes_count THEN
    RAISE WARNING 'W EDIT COUNT MISMATCH: created % but expected %', w_edit_count, pending_changes_count;
  END IF;
END $$;

-- 7c. Ensure exactly one current P per business (unique index should guarantee this)
DO $$
DECLARE
  violation_count INT;
BEGIN
  SELECT count(*) INTO violation_count
  FROM (
    SELECT business_id, count(*) AS cnt
    FROM published_listings
    WHERE is_current = TRUE
    GROUP BY business_id
    HAVING count(*) > 1
  ) dupes;

  RAISE NOTICE 'Businesses with multiple current P rows: % (should be 0)', violation_count;

  IF violation_count > 0 THEN
    RAISE WARNING 'CRITICAL: % businesses have multiple current P rows!', violation_count;
  END IF;
END $$;

-- 7d. Ensure at most one active W per business (unique index should guarantee this)
DO $$
DECLARE
  violation_count INT;
BEGIN
  SELECT count(*) INTO violation_count
  FROM (
    SELECT business_id, count(*) AS cnt
    FROM working_listings
    WHERE archived_at IS NULL
    GROUP BY business_id
    HAVING count(*) > 1
  ) dupes;

  RAISE NOTICE 'Businesses with multiple active W rows: % (should be 0)', violation_count;

  IF violation_count > 0 THEN
    RAISE WARNING 'CRITICAL: % businesses have multiple active W rows!', violation_count;
  END IF;
END $$;

-- 7e. No business should have both a P0 AND a W with change_type='new'
-- (a "new" W implies no prior publication, so P0 should not exist)
DO $$
DECLARE
  violation_count INT;
BEGIN
  SELECT count(*) INTO violation_count
  FROM published_listings pl
  JOIN working_listings w ON w.business_id = pl.business_id
  WHERE pl.is_current = TRUE
    AND w.archived_at IS NULL
    AND w.change_type = 'new';

  RAISE NOTICE 'Businesses with P0 AND new W: % (should be 0)', violation_count;

  IF violation_count > 0 THEN
    RAISE WARNING 'DATA ISSUE: % businesses have both P0 and change_type=new W', violation_count;
  END IF;
END $$;

-- 7f. P0 visibility_status distribution
DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE '── P0 visibility_status distribution ──';
  FOR rec IN
    SELECT visibility_status, count(*) AS cnt
    FROM published_listings
    WHERE is_current = TRUE
    GROUP BY visibility_status
    ORDER BY visibility_status
  LOOP
    RAISE NOTICE '  %: %', rec.visibility_status, rec.cnt;
  END LOOP;
END $$;

-- 7g. W review_status distribution
DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE '── W review_status distribution ──';
  FOR rec IN
    SELECT review_status, change_type, count(*) AS cnt
    FROM working_listings
    WHERE archived_at IS NULL
    GROUP BY review_status, change_type
    ORDER BY review_status, change_type
  LOOP
    RAISE NOTICE '  % (%): %', rec.review_status, rec.change_type, rec.cnt;
  END LOOP;
END $$;
