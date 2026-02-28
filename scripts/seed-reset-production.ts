#!/usr/bin/env npx tsx
/**
 * Production Seed Reset (Phase 5)
 *
 * Safely resets all seed data from production.
 * - Soft-deletes businesses where is_seed = true AND claim_status != 'claimed'
 * - Deletes seed_candidates, seed_place_details, seed_seen_places data
 * - Preserves users, subscriptions, claimed businesses
 * - Logs reset in audit_log
 *
 * Safety:
 * - Detects production environment
 * - Requires typed confirmation phrase: CONFIRM_PRODUCTION_SEED_RESET
 *
 * Usage:
 *   npx tsx scripts/seed-reset-production.ts --dry-run
 *   npx tsx scripts/seed-reset-production.ts --confirm CONFIRM_PRODUCTION_SEED_RESET
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import * as readline from 'readline'

const CONFIRM_PHRASE = 'CONFIRM_PRODUCTION_SEED_RESET'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface ResetOpts {
  dryRun: boolean
  confirm: string
}

function parseArgs(): ResetOpts {
  const args = process.argv.slice(2)
  const opts: ResetOpts = { dryRun: false, confirm: '' }
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        opts.dryRun = true
        break
      case '--confirm':
        opts.confirm = args[++i] ?? ''
        break
    }
  }
  return opts
}

function isProductionEnv(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  // Production indicators: not localhost, not 127.0.0.1
  return !url.includes('localhost') && !url.includes('127.0.0.1')
}

async function main() {
  const opts = parseArgs()

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const isProd = isProductionEnv()
  const supabase = getSupabase()

  // ─── Assess what will be affected ─────────────────────────────────

  console.log('Assessing seed data...\n')

  // Count seed businesses (unclaimed only — claimed are preserved)
  const { data: seedBiz } = await supabase
    .from('businesses')
    .select('id, name, claim_status')
    .eq('is_seed', true)

  const unclaimedSeeds = (seedBiz ?? []).filter((b) => b.claim_status !== 'claimed')
  const claimedSeeds = (seedBiz ?? []).filter((b) => b.claim_status === 'claimed')

  // Count pipeline tables
  const { count: candidateCount } = await supabase
    .from('seed_candidates')
    .select('*', { count: 'exact', head: true })

  const { count: detailsCount } = await supabase
    .from('seed_place_details')
    .select('*', { count: 'exact', head: true })

  const { count: seenCount } = await supabase
    .from('seed_seen_places')
    .select('*', { count: 'exact', head: true })

  const { count: queryRunsCount } = await supabase
    .from('seed_query_runs')
    .select('*', { count: 'exact', head: true })

  console.log('='.repeat(60))
  console.log('PRODUCTION SEED RESET')
  console.log(`  Environment:        ${isProd ? 'PRODUCTION' : 'development'}`)
  console.log(`  Supabase URL:       ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
  console.log('='.repeat(60))
  console.log('\n--- Will be affected ---')
  console.log(`  Seed businesses (unclaimed, soft-delete): ${unclaimedSeeds.length}`)
  console.log(`  Seed businesses (claimed, PRESERVED):     ${claimedSeeds.length}`)
  console.log(`  seed_candidates rows to delete:           ${candidateCount ?? 0}`)
  console.log(`  seed_place_details rows to delete:        ${detailsCount ?? 0}`)
  console.log(`  seed_seen_places rows to delete:          ${seenCount ?? 0}`)
  console.log(`  seed_query_runs rows to delete:           ${queryRunsCount ?? 0}`)
  console.log('\n--- Will be PRESERVED ---')
  console.log(`  All user accounts`)
  console.log(`  All subscriptions`)
  console.log(`  All claimed businesses (${claimedSeeds.length})`)
  console.log(`  All non-seed businesses`)
  console.log(`  Audit log entries`)

  if (opts.dryRun) {
    console.log('\n[DRY RUN] No changes made.')
    process.exit(0)
  }

  // ─── Safety confirmation ──────────────────────────────────────────

  if (isProd && opts.confirm !== CONFIRM_PHRASE) {
    console.error(`\nERROR: Production environment detected.`)
    console.error(`You must pass --confirm ${CONFIRM_PHRASE}`)
    console.error(`\nExample:`)
    console.error(`  npx tsx scripts/seed-reset-production.ts --confirm ${CONFIRM_PHRASE}`)
    process.exit(1)
  }

  if (!isProd && opts.confirm !== CONFIRM_PHRASE) {
    // For non-prod, prompt interactively
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const answer = await new Promise<string>((resolve) => {
      rl.question(`\nType "${CONFIRM_PHRASE}" to proceed: `, resolve)
    })
    rl.close()

    if (answer.trim() !== CONFIRM_PHRASE) {
      console.log('Reset cancelled.')
      process.exit(0)
    }
  }

  console.log('\nProceeding with reset...\n')

  // ─── 1. Soft-delete unclaimed seed businesses ─────────────────────

  console.log('Soft-deleting unclaimed seed businesses...')
  const now = new Date().toISOString()

  for (let i = 0; i < unclaimedSeeds.length; i += 100) {
    const chunk = unclaimedSeeds.slice(i, i + 100)
    const ids = chunk.map((b) => b.id)

    // Delete related records first
    for (const bizId of ids) {
      await supabase.from('business_categories').delete().eq('business_id', bizId)
      await supabase.from('business_contacts').delete().eq('business_id', bizId)
      await supabase.from('business_locations').delete().eq('business_id', bizId)
      await supabase.from('business_search_index').delete().eq('business_id', bizId)
    }

    // Soft-delete: set deleted_at, status to 'suspended'
    await supabase
      .from('businesses')
      .update({ deleted_at: now, status: 'suspended' })
      .in('id', ids)

    console.log(`  Soft-deleted ${Math.min(i + 100, unclaimedSeeds.length)}/${unclaimedSeeds.length}`)
  }

  // ─── 2. Delete pipeline tables data ───────────────────────────────

  console.log('Deleting seed_candidates...')
  await supabase.from('seed_candidates').delete().neq('place_id', '')  // delete all

  console.log('Deleting seed_place_details...')
  await supabase.from('seed_place_details').delete().neq('place_id', '')

  console.log('Deleting seed_seen_places...')
  await supabase.from('seed_seen_places').delete().neq('place_id', '')

  console.log('Deleting seed_query_runs...')
  await supabase.from('seed_query_runs').delete().neq('query_hash', '')

  // ─── 3. Log in audit table ────────────────────────────────────────

  console.log('Logging reset to audit_log...')
  await supabase.rpc('insert_audit_log', {
    p_action: 'seed_production_reset',
    p_entity_type: 'system',
    p_details: JSON.stringify({
      businesses_soft_deleted: unclaimedSeeds.length,
      claimed_preserved: claimedSeeds.length,
      candidates_deleted: candidateCount ?? 0,
      place_details_deleted: detailsCount ?? 0,
      seen_places_deleted: seenCount ?? 0,
      query_runs_deleted: queryRunsCount ?? 0,
      reset_at: now,
    }),
  })

  // ─── 4. Refresh search index ──────────────────────────────────────

  console.log('Refreshing search index...')
  try {
    await supabase.rpc('refresh_all_search_index')
    console.log('  Search index refreshed.')
  } catch (err: any) {
    console.error(`  Warning: Failed to refresh search index: ${err.message}`)
  }

  console.log('\n' + '='.repeat(60))
  console.log('--- RESET COMPLETE ---')
  console.log(`  Businesses soft-deleted: ${unclaimedSeeds.length}`)
  console.log(`  Businesses preserved:    ${claimedSeeds.length}`)
  console.log(`  Pipeline tables cleared`)
  console.log('='.repeat(60))
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
