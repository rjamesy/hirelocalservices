-- =============================================================================
-- 00002_create_tables.sql
-- Create all tables, indexes, and triggers for Hire Local Services
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------------

-- profiles
CREATE TABLE profiles (
    id         uuid        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    email      text        NOT NULL,
    role       text        NOT NULL DEFAULT 'business'
                           CHECK (role IN ('business', 'admin')),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- businesses
CREATE TABLE businesses (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name          text        NOT NULL,
    slug          text        NOT NULL UNIQUE,
    phone         text,
    website       text,
    email_contact text,
    description   text,
    abn           text,
    status        text        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'published', 'suspended')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- business_locations
CREATE TABLE business_locations (
    id                uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id       uuid             NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    address_text      text,
    suburb            text,
    state             text,
    postcode          text,
    lat               double precision,
    lng               double precision,
    geom              geography(Point, 4326),
    service_radius_km int              NOT NULL DEFAULT 25
);

-- categories
CREATE TABLE categories (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name      text NOT NULL,
    slug      text NOT NULL UNIQUE,
    parent_id uuid REFERENCES categories(id) ON DELETE SET NULL
);

-- business_categories (join table)
CREATE TABLE business_categories (
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (business_id, category_id)
);

-- photos
CREATE TABLE photos (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    url         text        NOT NULL,
    sort_order  int         NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- testimonials
CREATE TABLE testimonials (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    author_name text        NOT NULL,
    text        text        NOT NULL,
    rating      int         NOT NULL CHECK (rating >= 1 AND rating <= 5),
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- subscriptions
CREATE TABLE subscriptions (
    id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id            uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
    stripe_customer_id     text,
    stripe_subscription_id text        UNIQUE,
    status                 text        NOT NULL DEFAULT 'incomplete'
                                       CHECK (status IN ('incomplete', 'active', 'past_due', 'canceled', 'unpaid')),
    current_period_end     timestamptz,
    cancel_at_period_end   boolean     NOT NULL DEFAULT false,
    updated_at             timestamptz NOT NULL DEFAULT now()
);

-- reports
CREATE TABLE reports (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    reporter_ip_hash text       NOT NULL,
    reason          text        NOT NULL,
    details         text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    status          text        NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open', 'resolved'))
);

-- postcodes
CREATE TABLE postcodes (
    id       serial           PRIMARY KEY,
    postcode text             NOT NULL,
    suburb   text             NOT NULL,
    state    text             NOT NULL,
    lat      double precision NOT NULL,
    lng      double precision NOT NULL
);

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------

-- businesses
CREATE INDEX idx_businesses_slug      ON businesses(slug);
CREATE INDEX idx_businesses_owner_id  ON businesses(owner_id);
CREATE INDEX idx_businesses_status    ON businesses(status);

-- business_locations
CREATE INDEX idx_business_locations_business_id ON business_locations(business_id);
CREATE INDEX idx_business_locations_geom        ON business_locations USING GIST (geom);

-- categories
CREATE INDEX idx_categories_slug      ON categories(slug);
CREATE INDEX idx_categories_parent_id ON categories(parent_id);

-- photos
CREATE INDEX idx_photos_business_id ON photos(business_id);

-- testimonials
CREATE INDEX idx_testimonials_business_id ON testimonials(business_id);

-- subscriptions
CREATE INDEX idx_subscriptions_business_id            ON subscriptions(business_id);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);

-- reports
CREATE INDEX idx_reports_business_id ON reports(business_id);
CREATE INDEX idx_reports_status      ON reports(status);

-- postcodes
CREATE INDEX idx_postcodes_postcode ON postcodes(postcode);
CREATE INDEX idx_postcodes_suburb   ON postcodes(suburb);

-- ---------------------------------------------------------------------------
-- TRIGGER FUNCTION: auto-update updated_at
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to businesses
CREATE TRIGGER trg_businesses_updated_at
    BEFORE UPDATE ON businesses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to subscriptions
CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
