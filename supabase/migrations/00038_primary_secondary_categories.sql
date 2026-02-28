-- Primary + Secondary categories (same parent group only)

-- 1. Add is_primary column
ALTER TABLE business_categories
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

-- 2. Unique index: one primary per business
CREATE UNIQUE INDEX IF NOT EXISTS business_one_primary_category
  ON business_categories(business_id)
  WHERE is_primary = true;

-- 3. Trigger: enforce same parent group + no group selection
CREATE OR REPLACE FUNCTION enforce_same_category_group()
RETURNS trigger AS $$
DECLARE
  primary_cat uuid;
  primary_group uuid;
  new_group uuid;
BEGIN
  -- Reject group categories (parent_id IS NULL means it's a group header)
  SELECT parent_id INTO new_group FROM categories WHERE id = NEW.category_id;
  IF new_group IS NULL THEN
    RAISE EXCEPTION 'Cannot assign a group category directly; choose a child category';
  END IF;

  -- If this IS the primary, allow it
  IF NEW.is_primary THEN
    RETURN NEW;
  END IF;

  -- Secondary: primary must exist first
  SELECT category_id INTO primary_cat
  FROM business_categories
  WHERE business_id = NEW.business_id AND is_primary = true
  LIMIT 1;

  IF primary_cat IS NULL THEN
    RAISE EXCEPTION 'Primary category must be set before adding secondary categories';
  END IF;

  -- Check same group
  SELECT parent_id INTO primary_group FROM categories WHERE id = primary_cat;

  IF primary_group IS DISTINCT FROM new_group THEN
    RAISE EXCEPTION 'Secondary categories must be within the same group as the primary category';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_same_category_group
  BEFORE INSERT OR UPDATE ON business_categories
  FOR EACH ROW EXECUTE FUNCTION enforce_same_category_group();

-- 4. Backfill existing data
-- Disable trigger during backfill (existing data may have cross-group categories)
ALTER TABLE business_categories DISABLE TRIGGER trg_enforce_same_category_group;

-- Mark one category per business as primary (first alphabetically by name)
UPDATE business_categories bc
SET is_primary = true
FROM (
  SELECT DISTINCT ON (bc2.business_id) bc2.business_id, bc2.category_id
  FROM business_categories bc2
  JOIN categories c ON c.id = bc2.category_id
  ORDER BY bc2.business_id, c.name
) first_cat
WHERE bc.business_id = first_cat.business_id
  AND bc.category_id = first_cat.category_id;

-- Delete cross-group secondaries (categories not in same parent group as primary)
DELETE FROM business_categories bc
WHERE bc.is_primary = false
  AND EXISTS (
    SELECT 1 FROM business_categories primary_bc
    JOIN categories pc ON pc.id = primary_bc.category_id
    JOIN categories sc ON sc.id = bc.category_id
    WHERE primary_bc.business_id = bc.business_id
      AND primary_bc.is_primary = true
      AND pc.parent_id IS DISTINCT FROM sc.parent_id
  );

-- Re-enable trigger
ALTER TABLE business_categories ENABLE TRIGGER trg_enforce_same_category_group;
