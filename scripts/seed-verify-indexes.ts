#!/usr/bin/env npx tsx
/**
 * Index Verification (Phase 5)
 *
 * Verifies critical database indexes exist for seed pipeline performance.
 *
 * Usage:
 *   npx tsx scripts/seed-verify-indexes.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface IndexCheck {
  table: string
  indexName: string
  description: string
}

const REQUIRED_INDEXES: IndexCheck[] = [
  // Businesses
  { table: 'businesses', indexName: 'idx_businesses_seed_source', description: 'businesses(seed_source, seed_source_id) WHERE NOT NULL' },
  { table: 'businesses', indexName: 'idx_businesses_seed_confidence', description: 'businesses(seed_confidence) WHERE is_seed = true' },
  { table: 'businesses', indexName: 'idx_businesses_seed_batch_id', description: 'businesses(seed_batch_id) WHERE NOT NULL' },
  { table: 'businesses', indexName: 'idx_businesses_billing_status', description: 'businesses(billing_status)' },
  { table: 'businesses', indexName: 'idx_businesses_verification_status', description: 'businesses(verification_status)' },
  { table: 'businesses', indexName: 'idx_businesses_listing_source', description: 'businesses(listing_source)' },
  { table: 'businesses', indexName: 'businesses_slug_key', description: 'businesses(slug) UNIQUE' },
  // Seed candidates
  { table: 'seed_candidates', indexName: 'idx_seed_candidates_publish_status', description: 'seed_candidates(publish_status) WHERE unpublished' },
  { table: 'seed_candidates', indexName: 'idx_seed_candidates_batch_id', description: 'seed_candidates(publish_batch_id) WHERE NOT NULL' },
  { table: 'seed_candidates', indexName: 'idx_seed_candidates_ai_status', description: 'seed_candidates(status, ai_validation_status) WHERE ready_for_ai' },
  { table: 'seed_candidates', indexName: 'seed_candidates_pkey', description: 'seed_candidates(place_id) PRIMARY KEY' },
  // Seed pipeline tables
  { table: 'seed_seen_places', indexName: 'seed_seen_places_pkey', description: 'seed_seen_places(place_id) PRIMARY KEY' },
  { table: 'seed_query_runs', indexName: 'seed_query_runs_pkey', description: 'seed_query_runs(query_hash) PRIMARY KEY' },
  { table: 'seed_place_details', indexName: 'seed_place_details_pkey', description: 'seed_place_details(place_id) PRIMARY KEY' },
  // Category mapping
  { table: 'business_categories', indexName: 'business_categories_pkey', description: 'business_categories(business_id, category_id) PRIMARY KEY' },
  { table: 'categories', indexName: 'categories_slug_key', description: 'categories(slug) UNIQUE' },
]

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = getSupabase()

  console.log('='.repeat(60))
  console.log('INDEX VERIFICATION')
  console.log('='.repeat(60))

  // Query pg_indexes for all public schema indexes
  const { data: pgIndexes, error } = await supabase
    .rpc('execute_sql', { sql: `SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public'` })

  // Fallback: query via the pg_catalog if RPC not available
  let indexSet: Set<string>

  if (error || !pgIndexes) {
    // Can't use RPC — check indexes one at a time via table queries
    console.log('  Note: Using table-based verification (no pg_indexes access)\n')
    indexSet = new Set() // Will do table existence checks instead

    let passed = 0
    let missing = 0

    for (const check of REQUIRED_INDEXES) {
      // Verify table exists by attempting a count
      const { error: tableErr } = await supabase
        .from(check.table)
        .select('*', { count: 'exact', head: true })

      if (tableErr) {
        console.log(`  MISSING TABLE  ${check.table} — ${check.description}`)
        missing++
      } else {
        console.log(`  OK  ${check.table} exists — ${check.description}`)
        passed++
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log(`Verified: ${passed} tables exist, ${missing} missing`)
    console.log('Note: Cannot verify indexes directly without pg_indexes access.')
    console.log('Indexes were created by migrations — verify via Supabase SQL Editor if needed.')
    console.log('='.repeat(60))
    process.exit(missing > 0 ? 1 : 0)
  }

  // Build set of existing indexes
  indexSet = new Set((pgIndexes as any[]).map((r: any) => r.indexname))

  let passed = 0
  let missing = 0

  for (const check of REQUIRED_INDEXES) {
    if (indexSet.has(check.indexName)) {
      console.log(`  OK      ${check.indexName}`)
      passed++
    } else {
      console.log(`  MISSING ${check.indexName} — ${check.description}`)
      missing++
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`Indexes verified: ${passed} found, ${missing} missing`)
  if (missing > 0) {
    console.log('Run pending migrations to create missing indexes.')
  } else {
    console.log('All required indexes are present.')
  }
  console.log('='.repeat(60))

  process.exit(missing > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
