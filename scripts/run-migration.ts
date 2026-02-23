/**
 * run-migration.ts
 *
 * Runs migration SQL against Supabase database.
 * Tries multiple connection methods.
 *
 * Usage: npx tsx scripts/run-migration.ts
 */

import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0]
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD || 'P0tass!umzs01.'

const dbConfig = {
  host: `db.${projectRef}.supabase.co`,
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
}

const MIGRATION_STATEMENTS = [
  // 1. Add seed columns to businesses
  `ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS is_seed boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS claim_status text NOT NULL DEFAULT 'unclaimed'
      CHECK (claim_status IN ('unclaimed', 'claimed')),
    ADD COLUMN IF NOT EXISTS seed_source text,
    ADD COLUMN IF NOT EXISTS seed_source_id text`,

  // 2. Indexes
  `CREATE INDEX IF NOT EXISTS idx_businesses_is_seed ON businesses(is_seed)`,
  `CREATE INDEX IF NOT EXISTS idx_businesses_claim_status ON businesses(claim_status)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_seed_source ON businesses(seed_source, seed_source_id)
    WHERE seed_source IS NOT NULL AND seed_source_id IS NOT NULL`,

  // 3. Create business_claims table
  `CREATE TABLE IF NOT EXISTS business_claims (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id  uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    claimer_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status       text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    reviewed_at  timestamptz,
    reviewed_by  uuid        REFERENCES profiles(id)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_business_claims_business_id ON business_claims(business_id)`,
  `CREATE INDEX IF NOT EXISTS idx_business_claims_claimer_id ON business_claims(claimer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_business_claims_status ON business_claims(status)`,

  // 4. Enable RLS
  `ALTER TABLE business_claims ENABLE ROW LEVEL SECURITY`,

  // 5. RLS policies
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'business_claims_insert_auth' AND tablename = 'business_claims') THEN
      CREATE POLICY business_claims_insert_auth ON business_claims FOR INSERT WITH CHECK (claimer_id = auth.uid());
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'business_claims_select' AND tablename = 'business_claims') THEN
      CREATE POLICY business_claims_select ON business_claims FOR SELECT USING (claimer_id = auth.uid() OR is_admin());
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'business_claims_update_admin' AND tablename = 'business_claims') THEN
      CREATE POLICY business_claims_update_admin ON business_claims FOR UPDATE USING (is_admin());
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'business_claims_delete_admin' AND tablename = 'business_claims') THEN
      CREATE POLICY business_claims_delete_admin ON business_claims FOR DELETE USING (is_admin());
    END IF;
  END $$`,

  // 6. Update is_business_visible()
  `CREATE OR REPLACE FUNCTION is_business_visible(p_business_id uuid)
  RETURNS boolean AS $$
    SELECT EXISTS (
      SELECT 1
      FROM businesses b
      WHERE b.id = p_business_id
        AND b.status = 'published'
        AND (
          b.is_seed = true
          OR EXISTS (
            SELECT 1 FROM subscriptions s
            WHERE s.business_id = b.id
              AND s.status IN ('active', 'past_due')
          )
        )
    );
  $$ LANGUAGE sql SECURITY DEFINER STABLE`,

  // 7. DROP old search function (required to change return type)
  `DROP FUNCTION IF EXISTS search_businesses(text, double precision, double precision, integer, text, integer, integer)`,

  // 8. Recreate search_businesses with is_seed
  `CREATE OR REPLACE FUNCTION search_businesses(
    p_category_slug TEXT DEFAULT NULL,
    p_lat DOUBLE PRECISION DEFAULT NULL,
    p_lng DOUBLE PRECISION DEFAULT NULL,
    p_radius_km INT DEFAULT 25,
    p_keyword TEXT DEFAULT NULL,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
  )
  RETURNS TABLE(
    id UUID, name TEXT, slug TEXT, phone TEXT, website TEXT, description TEXT,
    status TEXT, is_seed BOOLEAN, suburb TEXT, state TEXT, postcode TEXT,
    service_radius_km INT, distance_m DOUBLE PRECISION, category_names TEXT[],
    avg_rating NUMERIC, review_count BIGINT, photo_url TEXT, total_count BIGINT
  )
  LANGUAGE plpgsql SECURITY DEFINER
  AS $$
  BEGIN
    RETURN QUERY
    WITH filtered_businesses AS (
      SELECT
        b.id AS b_id, b.name AS b_name, b.slug AS b_slug,
        b.phone AS b_phone, b.website AS b_website,
        b.description AS b_description, b.status AS b_status,
        b.is_seed AS b_is_seed, b.created_at AS b_created_at,
        bl.suburb AS b_suburb, bl.state AS b_state,
        bl.postcode AS b_postcode, bl.service_radius_km AS b_service_radius_km,
        CASE
          WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND bl.geom IS NOT NULL THEN
            ST_Distance(bl.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography)
          ELSE NULL
        END AS b_distance_m
      FROM businesses b
      INNER JOIN business_locations bl ON bl.business_id = b.id
      LEFT JOIN subscriptions s ON s.business_id = b.id
      LEFT JOIN business_categories bc ON bc.business_id = b.id
      LEFT JOIN categories c ON c.id = bc.category_id
      WHERE
        b.status = 'published'
        AND (b.is_seed = true OR s.status IN ('active', 'past_due'))
        AND (p_category_slug IS NULL OR c.slug = p_category_slug
             OR c.parent_id IN (SELECT pc.id FROM categories pc WHERE pc.slug = p_category_slug))
        AND (p_lat IS NULL OR p_lng IS NULL
             OR ST_DWithin(bl.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_km * 1000))
        AND (p_keyword IS NULL OR p_keyword = ''
             OR b.name ILIKE '%' || p_keyword || '%'
             OR b.description ILIKE '%' || p_keyword || '%')
      GROUP BY b.id, b.name, b.slug, b.phone, b.website, b.description,
               b.status, b.is_seed, b.created_at,
               bl.suburb, bl.state, bl.postcode, bl.service_radius_km, bl.geom
    )
    SELECT
      fb.b_id, fb.b_name, fb.b_slug, fb.b_phone, fb.b_website,
      fb.b_description, fb.b_status, fb.b_is_seed,
      fb.b_suburb, fb.b_state, fb.b_postcode, fb.b_service_radius_km,
      fb.b_distance_m,
      COALESCE((SELECT array_agg(DISTINCT cat.name ORDER BY cat.name)
                FROM business_categories bcat JOIN categories cat ON cat.id = bcat.category_id
                WHERE bcat.business_id = fb.b_id), ARRAY[]::TEXT[]),
      (SELECT ROUND(AVG(t.rating)::numeric, 1) FROM testimonials t WHERE t.business_id = fb.b_id),
      (SELECT COUNT(*) FROM testimonials t WHERE t.business_id = fb.b_id),
      (SELECT p.url FROM photos p WHERE p.business_id = fb.b_id ORDER BY p.sort_order ASC LIMIT 1),
      COUNT(*) OVER()
    FROM filtered_businesses fb
    ORDER BY
      CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL THEN fb.b_distance_m ELSE NULL END ASC NULLS LAST,
      fb.b_created_at DESC
    LIMIT p_limit OFFSET p_offset;
  END;
  $$`,

  // 9. Grant permissions
  `GRANT EXECUTE ON FUNCTION search_businesses TO authenticated, anon`,
]

async function main() {
  console.log('=== Running Migration ===')
  console.log(`Project: ${projectRef}\n`)

  const client = new pg.Client(dbConfig)

  try {
    console.log('\nConnecting for migration...')
    await client.connect()
    console.log('Connected!\n')

    for (let i = 0; i < MIGRATION_STATEMENTS.length; i++) {
      const sql = MIGRATION_STATEMENTS[i]
      const preview = sql.replace(/\s+/g, ' ').slice(0, 80)
      process.stdout.write(`[${i + 1}/${MIGRATION_STATEMENTS.length}] ${preview}...`)
      try {
        await client.query(sql)
        console.log(' OK')
      } catch (err: any) {
        if (err.message?.includes('already exists')) {
          console.log(' SKIPPED (already exists)')
        } else {
          console.log(` ERROR: ${err.message}`)
          throw err
        }
      }
    }

    console.log('\n=== Migration complete! ===')

    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'businesses' AND column_name IN ('is_seed', 'claim_status', 'seed_source', 'seed_source_id') ORDER BY column_name`
    )
    console.log('\nNew columns:', rows.map(r => r.column_name).join(', '))

    const { rows: tables } = await client.query(
      `SELECT tablename FROM pg_tables WHERE tablename = 'business_claims'`
    )
    console.log('business_claims table:', tables.length > 0 ? 'EXISTS' : 'MISSING')
  } catch (err) {
    console.error('\nFatal error:', err)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
