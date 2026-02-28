#!/usr/bin/env npx tsx
/**
 * Seed Rollback (Phase 4)
 *
 * Rolls back a published batch by deleting businesses and
 * resetting candidate publish status.
 *
 * Usage:
 *   npx tsx scripts/seed-rollback.ts --batch-id <uuid>
 *   npx tsx scripts/seed-rollback.ts --batch-id <uuid> --dry-run
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import {
  rollbackBatch,
  getPublishRunByBatchId,
} from '../src/lib/seeding/publish-store'
import { refreshSearchIndex } from '../src/lib/seeding/writer'
import { createClient } from '@supabase/supabase-js'

// ─── CLI Args ────────────────────────────────────────────────────────

interface RollbackOpts {
  batchId: string
  dryRun: boolean
}

function parseArgs(): RollbackOpts {
  const args = process.argv.slice(2)
  const opts: RollbackOpts = {
    batchId: '',
    dryRun: false,
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--batch-id':
        opts.batchId = args[++i] ?? ''
        break
      case '--dry-run':
        opts.dryRun = true
        break
    }
  }

  if (!opts.batchId) {
    console.error('Usage: npx tsx scripts/seed-rollback.ts --batch-id <uuid> [--dry-run]')
    process.exit(1)
  }

  return opts
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs()

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  // Look up the publish run
  const run = await getPublishRunByBatchId(opts.batchId)
  if (!run) {
    console.error(`No publish run found for batch ID: ${opts.batchId}`)
    process.exit(1)
  }

  if (run.rolled_back_at) {
    console.error(`Batch ${opts.batchId} was already rolled back at ${run.rolled_back_at}`)
    process.exit(1)
  }

  // Count affected businesses
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('seed_batch_id', opts.batchId)

  const bizCount = businesses?.length ?? 0

  console.log('='.repeat(60))
  console.log('Seed Rollback')
  console.log(`  Batch ID:      ${opts.batchId}`)
  console.log(`  Published at:  ${run.run_started_at}`)
  console.log(`  Region:        ${run.region ?? 'all'}`)
  console.log(`  Category:      ${run.category ?? 'all'}`)
  console.log(`  Published:     ${run.published} businesses`)
  console.log(`  Found in DB:   ${bizCount} businesses`)
  console.log(`  Dry run:       ${opts.dryRun}`)
  console.log('='.repeat(60))

  if (bizCount === 0) {
    console.log('No businesses to rollback.')
    process.exit(0)
  }

  if (opts.dryRun) {
    console.log(`\n[DRY RUN] Would delete ${bizCount} businesses:`)
    for (const b of (businesses ?? []).slice(0, 10)) {
      console.log(`  - ${b.name} (${b.id})`)
    }
    if (bizCount > 10) {
      console.log(`  ... and ${bizCount - 10} more`)
    }
    process.exit(0)
  }

  console.log(`\nRolling back ${bizCount} businesses...`)
  const result = await rollbackBatch(opts.batchId)

  if (result.error) {
    console.error(`Rollback error: ${result.error}`)
    process.exit(1)
  }

  // Log to audit_log
  await supabase.rpc('insert_audit_log', {
    p_action: 'seed_rollback',
    p_entity_type: 'seed_batch',
    p_details: JSON.stringify({
      batch_id: opts.batchId,
      businesses_deleted: result.businessesDeleted,
      candidates_reset: result.candidatesReset,
    }),
  })

  // Refresh search index
  console.log('Refreshing search index...')
  try {
    await refreshSearchIndex()
    console.log('  Search index refreshed.')
  } catch (err: any) {
    console.error(`  Warning: Failed to refresh search index: ${err.message}`)
  }

  console.log('\n' + '='.repeat(60))
  console.log('--- ROLLBACK COMPLETE ---')
  console.log(`  Businesses deleted:    ${result.businessesDeleted}`)
  console.log(`  Candidates reset:      ${result.candidatesReset}`)
  console.log('='.repeat(60))

  process.exit(0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
