/**
 * run-migration-phase1.ts
 *
 * Runs Phase 1 migration SQL files against Supabase database.
 * Migrations: 00011-00014 (verification pipeline, search index)
 *
 * Usage: npx tsx scripts/run-migration-phase1.ts
 */

import { config } from 'dotenv'
import pg from 'pg'
import { readFileSync } from 'fs'
import { join } from 'path'

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

const MIGRATION_FILES = [
  '00011_phase1_enums_and_tables.sql',
  '00012_phase1_alter_businesses.sql',
  '00013_phase1_search_index.sql',
  '00014_phase1_search_function.sql',
]

async function main() {
  console.log('=== Running Phase 1 Migrations ===')
  console.log(`Project: ${projectRef}\n`)

  const client = new pg.Client(dbConfig)

  try {
    console.log('Connecting...')
    await client.connect()
    console.log('Connected!\n')

    for (const file of MIGRATION_FILES) {
      const filePath = join(__dirname, '..', 'supabase', 'migrations', file)
      console.log(`\n--- Running ${file} ---`)

      const sql = readFileSync(filePath, 'utf-8')

      try {
        await client.query(sql)
        console.log(`  OK`)
      } catch (err: any) {
        console.error(`  ERROR: ${err.message}`)
        throw err
      }
    }

    console.log('\n=== All Phase 1 migrations complete! ===')

    // Verify
    const { rows: cols } = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'businesses'
       AND column_name IN ('verification_status', 'listing_source')
       ORDER BY column_name`
    )
    console.log('\nNew business columns:', cols.map(r => r.column_name).join(', '))

    const { rows: tables } = await client.query(
      `SELECT tablename FROM pg_tables
       WHERE tablename IN ('business_contacts', 'verification_jobs', 'admin_reviews', 'business_search_index')
       ORDER BY tablename`
    )
    console.log('New tables:', tables.map(r => r.tablename).join(', '))

    const { rows: indexCount } = await client.query(
      `SELECT COUNT(*) as cnt FROM business_search_index`
    )
    console.log('Search index entries:', indexCount[0].cnt)
  } catch (err) {
    console.error('\nFatal error:', err)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
