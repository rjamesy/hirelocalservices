-- =============================================================================
-- 00003_rls_policies.sql
-- Enable Row Level Security on all tables and create access policies
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enable RLS on every table
-- ---------------------------------------------------------------------------

ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_locations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials        ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports             ENABLE ROW LEVEL SECURITY;
ALTER TABLE postcodes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories          ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Helper: is the current user an admin?
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role = 'admin'
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---------------------------------------------------------------------------
-- Helper: is a business visible to the public?
-- A business is visible when its status is 'published' AND it has an active
-- (or past_due grace-period) subscription.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_business_visible(p_business_id uuid)
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1
        FROM businesses b
        JOIN subscriptions s ON s.business_id = b.id
        WHERE b.id     = p_business_id
          AND b.status = 'published'
          AND s.status IN ('active', 'past_due')
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---------------------------------------------------------------------------
-- Helper: does the current user own a given business?
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION owns_business(p_business_id uuid)
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1 FROM businesses
        WHERE id       = p_business_id
          AND owner_id = auth.uid()
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ===========================================================================
-- PROFILES
-- ===========================================================================

-- Users can read their own profile
CREATE POLICY profiles_select_own ON profiles
    FOR SELECT USING (id = auth.uid() OR is_admin());

-- Users can update their own profile
CREATE POLICY profiles_update_own ON profiles
    FOR UPDATE USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Admin can update any profile
CREATE POLICY profiles_update_admin ON profiles
    FOR UPDATE USING (is_admin());

-- ===========================================================================
-- BUSINESSES
-- ===========================================================================

-- Public can read published businesses with active subscriptions
CREATE POLICY businesses_select_public ON businesses
    FOR SELECT USING (
        (status = 'published' AND is_business_visible(id))
        OR owner_id = auth.uid()
        OR is_admin()
    );

-- Owner can insert their own businesses
CREATE POLICY businesses_insert_owner ON businesses
    FOR INSERT WITH CHECK (owner_id = auth.uid() OR is_admin());

-- Owner can update their own businesses
CREATE POLICY businesses_update_owner ON businesses
    FOR UPDATE USING (owner_id = auth.uid() OR is_admin())
    WITH CHECK (owner_id = auth.uid() OR is_admin());

-- Owner can delete their own businesses
CREATE POLICY businesses_delete_owner ON businesses
    FOR DELETE USING (owner_id = auth.uid() OR is_admin());

-- ===========================================================================
-- BUSINESS_LOCATIONS
-- ===========================================================================

-- Public can read locations of visible businesses
CREATE POLICY business_locations_select_public ON business_locations
    FOR SELECT USING (
        is_business_visible(business_id)
        OR owns_business(business_id)
        OR is_admin()
    );

-- Owner can insert locations for own businesses
CREATE POLICY business_locations_insert_owner ON business_locations
    FOR INSERT WITH CHECK (owns_business(business_id) OR is_admin());

-- Owner can update locations for own businesses
CREATE POLICY business_locations_update_owner ON business_locations
    FOR UPDATE USING (owns_business(business_id) OR is_admin())
    WITH CHECK (owns_business(business_id) OR is_admin());

-- Owner can delete locations for own businesses
CREATE POLICY business_locations_delete_owner ON business_locations
    FOR DELETE USING (owns_business(business_id) OR is_admin());

-- ===========================================================================
-- BUSINESS_CATEGORIES
-- ===========================================================================

-- Public can read categories of visible businesses
CREATE POLICY business_categories_select_public ON business_categories
    FOR SELECT USING (
        is_business_visible(business_id)
        OR owns_business(business_id)
        OR is_admin()
    );

-- Owner can insert categories for own businesses
CREATE POLICY business_categories_insert_owner ON business_categories
    FOR INSERT WITH CHECK (owns_business(business_id) OR is_admin());

-- Owner can update categories for own businesses
CREATE POLICY business_categories_update_owner ON business_categories
    FOR UPDATE USING (owns_business(business_id) OR is_admin())
    WITH CHECK (owns_business(business_id) OR is_admin());

-- Owner can delete categories for own businesses
CREATE POLICY business_categories_delete_owner ON business_categories
    FOR DELETE USING (owns_business(business_id) OR is_admin());

-- ===========================================================================
-- PHOTOS
-- ===========================================================================

-- Public can read photos of visible businesses
CREATE POLICY photos_select_public ON photos
    FOR SELECT USING (
        is_business_visible(business_id)
        OR owns_business(business_id)
        OR is_admin()
    );

-- Owner can insert photos for own businesses
CREATE POLICY photos_insert_owner ON photos
    FOR INSERT WITH CHECK (owns_business(business_id) OR is_admin());

-- Owner can update photos for own businesses
CREATE POLICY photos_update_owner ON photos
    FOR UPDATE USING (owns_business(business_id) OR is_admin())
    WITH CHECK (owns_business(business_id) OR is_admin());

-- Owner can delete photos for own businesses
CREATE POLICY photos_delete_owner ON photos
    FOR DELETE USING (owns_business(business_id) OR is_admin());

-- ===========================================================================
-- TESTIMONIALS
-- ===========================================================================

-- Public can read testimonials of visible businesses
CREATE POLICY testimonials_select_public ON testimonials
    FOR SELECT USING (
        is_business_visible(business_id)
        OR owns_business(business_id)
        OR is_admin()
    );

-- Owner can insert testimonials for own businesses
CREATE POLICY testimonials_insert_owner ON testimonials
    FOR INSERT WITH CHECK (owns_business(business_id) OR is_admin());

-- Owner can update testimonials for own businesses
CREATE POLICY testimonials_update_owner ON testimonials
    FOR UPDATE USING (owns_business(business_id) OR is_admin())
    WITH CHECK (owns_business(business_id) OR is_admin());

-- Owner can delete testimonials for own businesses
CREATE POLICY testimonials_delete_owner ON testimonials
    FOR DELETE USING (owns_business(business_id) OR is_admin());

-- ===========================================================================
-- SUBSCRIPTIONS
-- ===========================================================================

-- Owner can read their own subscriptions
CREATE POLICY subscriptions_select_owner ON subscriptions
    FOR SELECT USING (owns_business(business_id) OR is_admin());

-- Only admin (or service role via API) can insert/update/delete subscriptions
CREATE POLICY subscriptions_insert_admin ON subscriptions
    FOR INSERT WITH CHECK (is_admin());

CREATE POLICY subscriptions_update_admin ON subscriptions
    FOR UPDATE USING (is_admin());

CREATE POLICY subscriptions_delete_admin ON subscriptions
    FOR DELETE USING (is_admin());

-- ===========================================================================
-- REPORTS
-- ===========================================================================

-- Anyone (authenticated or anon) can insert a report
CREATE POLICY reports_insert_anyone ON reports
    FOR INSERT WITH CHECK (true);

-- Admin can read all reports
CREATE POLICY reports_select_admin ON reports
    FOR SELECT USING (is_admin());

-- Admin can update reports (e.g. mark resolved)
CREATE POLICY reports_update_admin ON reports
    FOR UPDATE USING (is_admin());

-- ===========================================================================
-- POSTCODES
-- ===========================================================================

-- Public read access
CREATE POLICY postcodes_select_public ON postcodes
    FOR SELECT USING (true);

-- Admin can manage postcodes
CREATE POLICY postcodes_insert_admin ON postcodes
    FOR INSERT WITH CHECK (is_admin());

CREATE POLICY postcodes_update_admin ON postcodes
    FOR UPDATE USING (is_admin());

CREATE POLICY postcodes_delete_admin ON postcodes
    FOR DELETE USING (is_admin());

-- ===========================================================================
-- CATEGORIES
-- ===========================================================================

-- Public read access
CREATE POLICY categories_select_public ON categories
    FOR SELECT USING (true);

-- Admin can manage categories
CREATE POLICY categories_insert_admin ON categories
    FOR INSERT WITH CHECK (is_admin());

CREATE POLICY categories_update_admin ON categories
    FOR UPDATE USING (is_admin());

CREATE POLICY categories_delete_admin ON categories
    FOR DELETE USING (is_admin());
