-- =============================================================================
-- 00004_seed_categories.sql
-- Seed service categories for Australian local services directory
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: slugify function for consistent slug generation
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    -- Parent category IDs
    v_cleaning        uuid;
    v_home_maint      uuid;
    v_outdoor         uuid;
    v_automotive      uuid;
    v_moving          uuid;
    v_pest            uuid;
    v_pet             uuid;
    v_beauty          uuid;
    v_it              uuid;
    v_events          uuid;
BEGIN

    -- -----------------------------------------------------------------------
    -- Parent categories
    -- -----------------------------------------------------------------------

    INSERT INTO categories (name, slug, parent_id)
    VALUES ('Cleaning', 'cleaning', NULL)
    RETURNING id INTO v_cleaning;

    INSERT INTO categories (name, slug, parent_id)
    VALUES ('Home Maintenance', 'home-maintenance', NULL)
    RETURNING id INTO v_home_maint;

    INSERT INTO categories (name, slug, parent_id)
    VALUES ('Outdoor', 'outdoor', NULL)
    RETURNING id INTO v_outdoor;

    INSERT INTO categories (name, slug, parent_id)
    VALUES ('Automotive', 'automotive', NULL)
    RETURNING id INTO v_automotive;

    INSERT INTO categories (name, slug, parent_id)
    VALUES ('Moving & Delivery', 'moving-delivery', NULL)
    RETURNING id INTO v_moving;

    INSERT INTO categories (name, slug, parent_id)
    VALUES ('Pest Control', 'pest-control', NULL)
    RETURNING id INTO v_pest;

    INSERT INTO categories (name, slug, parent_id)
    VALUES ('Pet Services', 'pet-services', NULL)
    RETURNING id INTO v_pet;

    INSERT INTO categories (name, slug, parent_id)
    VALUES ('Beauty & Wellness', 'beauty-wellness', NULL)
    RETURNING id INTO v_beauty;

    INSERT INTO categories (name, slug, parent_id)
    VALUES ('IT & Tech', 'it-tech', NULL)
    RETURNING id INTO v_it;

    INSERT INTO categories (name, slug, parent_id)
    VALUES ('Events', 'events', NULL)
    RETURNING id INTO v_events;

    -- -----------------------------------------------------------------------
    -- Cleaning children
    -- -----------------------------------------------------------------------
    INSERT INTO categories (name, slug, parent_id) VALUES
        ('House Cleaning',       'house-cleaning',       v_cleaning),
        ('Office Cleaning',      'office-cleaning',      v_cleaning),
        ('Carpet Cleaning',      'carpet-cleaning',      v_cleaning),
        ('Window Cleaning',      'window-cleaning',      v_cleaning),
        ('End of Lease Cleaning','end-of-lease-cleaning', v_cleaning),
        ('Aircon Cleaning',      'aircon-cleaning',      v_cleaning);

    -- -----------------------------------------------------------------------
    -- Home Maintenance children
    -- -----------------------------------------------------------------------
    INSERT INTO categories (name, slug, parent_id) VALUES
        ('Handyman',   'handyman',   v_home_maint),
        ('Painting',   'painting',   v_home_maint),
        ('Plumbing',   'plumbing',   v_home_maint),
        ('Electrical', 'electrical', v_home_maint),
        ('Carpentry',  'carpentry',  v_home_maint),
        ('Fencing',    'fencing',    v_home_maint),
        ('Roofing',    'roofing',    v_home_maint),
        ('Guttering',  'guttering',  v_home_maint);

    -- -----------------------------------------------------------------------
    -- Outdoor children
    -- -----------------------------------------------------------------------
    INSERT INTO categories (name, slug, parent_id) VALUES
        ('Lawn Mowing',      'lawn-mowing',      v_outdoor),
        ('Gardening',        'gardening',         v_outdoor),
        ('Tree Removal',     'tree-removal',      v_outdoor),
        ('Landscaping',      'landscaping',       v_outdoor),
        ('Pressure Washing', 'pressure-washing',  v_outdoor);

    -- -----------------------------------------------------------------------
    -- Automotive children
    -- -----------------------------------------------------------------------
    INSERT INTO categories (name, slug, parent_id) VALUES
        ('Mobile Mechanic', 'mobile-mechanic', v_automotive),
        ('Car Detailing',   'car-detailing',   v_automotive),
        ('Towing',          'towing',          v_automotive);

    -- -----------------------------------------------------------------------
    -- Moving & Delivery children
    -- -----------------------------------------------------------------------
    INSERT INTO categories (name, slug, parent_id) VALUES
        ('Removalists',       'removalists',       v_moving),
        ('Furniture Assembly', 'furniture-assembly', v_moving),
        ('Courier',           'courier',            v_moving),
        ('Rubbish Removal',   'rubbish-removal',    v_moving);

    -- -----------------------------------------------------------------------
    -- Pest Control children
    -- -----------------------------------------------------------------------
    INSERT INTO categories (name, slug, parent_id) VALUES
        ('General Pest Control', 'general-pest-control', v_pest),
        ('Termite Inspection',   'termite-inspection',   v_pest),
        ('Rodent Control',       'rodent-control',       v_pest);

    -- -----------------------------------------------------------------------
    -- Pet Services children
    -- -----------------------------------------------------------------------
    INSERT INTO categories (name, slug, parent_id) VALUES
        ('Dog Walking',  'dog-walking',  v_pet),
        ('Pet Grooming', 'pet-grooming', v_pet),
        ('Pet Sitting',  'pet-sitting',  v_pet);

    -- -----------------------------------------------------------------------
    -- Beauty & Wellness children
    -- -----------------------------------------------------------------------
    INSERT INTO categories (name, slug, parent_id) VALUES
        ('Mobile Hairdresser', 'mobile-hairdresser', v_beauty),
        ('Mobile Beauty',      'mobile-beauty',      v_beauty),
        ('Massage Therapist',  'massage-therapist',  v_beauty);

    -- -----------------------------------------------------------------------
    -- IT & Tech children
    -- -----------------------------------------------------------------------
    INSERT INTO categories (name, slug, parent_id) VALUES
        ('Computer Repair',  'computer-repair',  v_it),
        ('Phone Repair',     'phone-repair',     v_it),
        ('Smart Home Setup', 'smart-home-setup', v_it);

    -- -----------------------------------------------------------------------
    -- Events children
    -- -----------------------------------------------------------------------
    INSERT INTO categories (name, slug, parent_id) VALUES
        ('Photography', 'photography', v_events),
        ('DJ',          'dj',          v_events),
        ('Catering',    'catering',    v_events),
        ('Party Hire',  'party-hire',  v_events);

END $$;
