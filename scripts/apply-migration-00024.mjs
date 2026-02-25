#!/usr/bin/env node
/**
 * Apply migration 00024_admin_v1_normalization.sql to Supabase
 * via the Management API (requires access token).
 *
 * Usage: node scripts/apply-migration-00024.mjs
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

const PROJECT_REF = 'hqaeezfsetzyubcmbwbv'
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || process.argv[2]

if (!ACCESS_TOKEN) {
  console.error('Usage: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration-00024.mjs')
  console.error('   or: node scripts/apply-migration-00024.mjs <access-token>')
  process.exit(1)
}

/**
 * Execute SQL via Supabase Management API.
 */
async function executeSql(sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ query: sql }),
    }
  )

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${text}`)
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function main() {
  console.log('Testing connection to Supabase Management API...')
  try {
    const test = await executeSql('SELECT 1 AS ok')
    console.log('Connection OK:', JSON.stringify(test).substring(0, 100))
  } catch (err) {
    console.error('Connection failed:', err.message)
    process.exit(1)
  }
  console.log()

  const migrationPath = resolve(process.cwd(), 'supabase/migrations/00024_admin_v1_normalization.sql')
  const fullSql = readFileSync(migrationPath, 'utf-8')

  console.log('Applying migration 00024_admin_v1_normalization.sql...\n')

  try {
    const result = await executeSql(fullSql)
    console.log('Migration applied successfully!')
    if (result) console.log('Result:', JSON.stringify(result).substring(0, 200))
  } catch (err) {
    console.error('Migration error:', err.message)
    process.exit(1)
  }

  console.log()
  console.log('═══════════════════════════════════════════════')
  console.log(' VERIFICATION')
  console.log('═══════════════════════════════════════════════\n')

  // 1. Check new columns exist
  console.log('1. Checking suspended_reason / suspended_at columns...')
  const cols = await executeSql(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'businesses'
      AND column_name IN ('suspended_reason', 'suspended_at')
    ORDER BY column_name
  `)
  console.log('  ', JSON.stringify(cols))
  console.log()

  // 2. Check constraint
  console.log('2. Checking businesses_owner_id_required constraint...')
  const constraints = await executeSql(`
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE table_name = 'businesses' AND constraint_name = 'businesses_owner_id_required'
  `)
  console.log('  ', JSON.stringify(constraints))
  console.log()

  // 3. Check partial unique index
  console.log('3. Checking idx_user_subscriptions_one_active_per_user index...')
  const indexes = await executeSql(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'user_subscriptions'
      AND indexname = 'idx_user_subscriptions_one_active_per_user'
  `)
  console.log('  ', JSON.stringify(indexes))
  console.log()

  // 4. Subscription uniqueness — no duplicate active subs per user
  console.log('4. Checking subscription uniqueness (no duplicate active per user)...')
  const dups = await executeSql(`
    SELECT user_id, COUNT(*) AS cnt
    FROM user_subscriptions
    WHERE status NOT IN ('canceled', 'unpaid')
    GROUP BY user_id
    HAVING COUNT(*) > 1
  `)
  console.log('   Duplicate active subs:', JSON.stringify(dups))
  console.log()

  // 5. User subscriptions summary
  console.log('5. User subscriptions summary...')
  const subSummary = await executeSql(`
    SELECT status, COUNT(*) AS cnt
    FROM user_subscriptions
    GROUP BY status
    ORDER BY cnt DESC
  `)
  console.log('  ', JSON.stringify(subSummary))
  console.log()

  // 6. Billing status distribution
  console.log('6. Billing status distribution on businesses...')
  const billingDist = await executeSql(`
    SELECT billing_status, COUNT(*) AS cnt
    FROM businesses
    GROUP BY billing_status
    ORDER BY cnt DESC
  `)
  console.log('  ', JSON.stringify(billingDist))
  console.log()

  // 7. explain_search_eligibility function
  console.log('7. Checking explain_search_eligibility function...')
  const funcs = await executeSql(`
    SELECT routine_name FROM information_schema.routines
    WHERE routine_name = 'explain_search_eligibility' AND routine_schema = 'public'
  `)
  console.log('  ', JSON.stringify(funcs))
  console.log()

  // 8. Test on a sample business
  console.log('8. Testing explain_search_eligibility on a sample business...')
  const sampleBiz = await executeSql(`
    SELECT id, name FROM businesses
    WHERE status = 'published' AND claim_status = 'claimed' AND is_seed = false
    LIMIT 1
  `)
  if (Array.isArray(sampleBiz) && sampleBiz.length > 0) {
    const bizId = sampleBiz[0].id
    console.log(`   Business: ${sampleBiz[0].name} (${bizId})`)
    const eligibility = await executeSql(
      `SELECT * FROM explain_search_eligibility('${bizId}')`
    )
    console.log('  ', JSON.stringify(eligibility, null, 2))
  } else {
    console.log('   No published claimed non-seed businesses found.')
    console.log('   Sample result:', JSON.stringify(sampleBiz))
  }
  console.log()

  // 9. Search index vs published listings
  console.log('9. Published listings in search index...')
  const searchCount = await executeSql(`SELECT COUNT(*) AS cnt FROM business_search_index`)
  const publishedCount = await executeSql(`
    SELECT COUNT(*) AS cnt FROM businesses
    WHERE status = 'published' AND verification_status = 'approved'
      AND billing_status != 'billing_suspended'
  `)
  console.log('   Search index entries:', JSON.stringify(searchCount))
  console.log('   Eligible published:', JSON.stringify(publishedCount))
  console.log()

  // 10. Admin RLS policy
  console.log('10. Checking admin RLS policy on user_subscriptions...')
  const policies = await executeSql(`
    SELECT policyname FROM pg_policies
    WHERE tablename = 'user_subscriptions'
      AND policyname = 'Admins can read all subscriptions'
  `)
  console.log('  ', JSON.stringify(policies))
  console.log()

  console.log('═══════════════════════════════════════════════')
  console.log(' MIGRATION COMPLETE')
  console.log('═══════════════════════════════════════════════')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
