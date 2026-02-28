/**
 * Apply migration 00032: seed extraction tables
 */
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0]

const client = new pg.Client({
  host: `db.${projectRef}.supabase.co`,
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD || 'P0tass!umzs01.',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
})

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS seed_seen_places (
    place_id TEXT PRIMARY KEY,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_region TEXT NOT NULL,
    source_category TEXT NOT NULL,
    source_term TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS seed_query_runs (
    query_hash TEXT PRIMARY KEY,
    region TEXT NOT NULL,
    category TEXT NOT NULL,
    anchor TEXT NOT NULL,
    term TEXT NOT NULL,
    last_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    pages_fetched INT NOT NULL DEFAULT 0,
    results_count INT NOT NULL DEFAULT 0
  )`,

  `ALTER TABLE seed_seen_places ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE seed_query_runs ENABLE ROW LEVEL SECURITY`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role manages seed_seen_places' AND tablename = 'seed_seen_places') THEN
      CREATE POLICY "Service role manages seed_seen_places" ON seed_seen_places FOR ALL USING (current_setting('role') = 'service_role');
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role manages seed_query_runs' AND tablename = 'seed_query_runs') THEN
      CREATE POLICY "Service role manages seed_query_runs" ON seed_query_runs FOR ALL USING (current_setting('role') = 'service_role');
    END IF;
  END $$`,
]

async function main() {
  console.log('=== Migration 00032: seed_extraction ===')
  console.log(`Connecting to db.${projectRef}.supabase.co...`)

  await client.connect()
  console.log('Connected!\n')

  for (let i = 0; i < STATEMENTS.length; i++) {
    const sql = STATEMENTS[i]
    const preview = sql.replace(/\s+/g, ' ').slice(0, 70)
    process.stdout.write(`[${i + 1}/${STATEMENTS.length}] ${preview}...`)
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

  // Verify tables exist
  const { rows } = await client.query(
    `SELECT tablename FROM pg_tables WHERE tablename IN ('seed_seen_places', 'seed_query_runs') ORDER BY tablename`
  )
  console.log('\nTables:', rows.map((r) => r.tablename).join(', '))
  console.log('=== Migration complete ===')

  await client.end()
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
