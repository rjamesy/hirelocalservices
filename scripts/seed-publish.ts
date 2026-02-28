#!/usr/bin/env npx tsx
/**
 * Seed Publish Pipeline (Phase 4)
 *
 * Publishes approved seed_candidates → businesses table.
 * Handles batching, idempotency, and safety caps.
 * Each run creates a batch_id for audit + rollback.
 *
 * Usage:
 *   npx tsx scripts/seed-publish.ts --region seq --dry-run
 *   npx tsx scripts/seed-publish.ts --region seq --category house-cleaning --limit 10
 *   npx tsx scripts/seed-publish.ts --region seq --concurrency 3
 *   npx tsx scripts/seed-publish.ts --region seq --force
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import {
  getCandidatesForPublish,
  publishCandidate,
  createPublishRun,
  finalizePublishRun,
  resetPublishCache,
} from '../src/lib/seeding/publish-store'
import type { PublishRunStats } from '../src/lib/seeding/publish-store'
import { refreshSearchIndex } from '../src/lib/seeding/writer'

// ─── CLI Args ────────────────────────────────────────────────────────

interface PublishOpts {
  region: string
  category: string
  limit: number
  dryRun: boolean
  force: boolean
  concurrency: number
}

function parseArgs(): PublishOpts {
  const args = process.argv.slice(2)
  const opts: PublishOpts = {
    region: '',
    category: 'all',
    limit: 0,
    dryRun: false,
    force: false,
    concurrency: 3,
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--region':
        opts.region = args[++i]?.toLowerCase() ?? ''
        break
      case '--category':
        opts.category = args[++i]?.toLowerCase() ?? 'all'
        break
      case '--limit':
        opts.limit = parseInt(args[++i] ?? '0', 10)
        break
      case '--dry-run':
        opts.dryRun = true
        break
      case '--force':
        opts.force = true
        break
      case '--concurrency':
        opts.concurrency = parseInt(args[++i] ?? '3', 10)
        break
    }
  }

  if (!opts.region) {
    console.error('Usage: npx tsx scripts/seed-publish.ts --region <name> [options]')
    console.error('\nOptions:')
    console.error('  --region <name>         Region filter (required)')
    console.error('  --category <slug>       Category filter or "all" (default: all)')
    console.error('  --limit <n>             Max candidates to publish (default: unlimited)')
    console.error('  --dry-run               Show what would happen without publishing')
    console.error('  --force                 Re-publish even if already published')
    console.error('  --concurrency <n>       Parallel publishes (default: 3)')
    process.exit(1)
  }

  return opts
}

// ─── Graceful Shutdown ───────────────────────────────────────────────

let shuttingDown = false

process.on('SIGINT', () => {
  if (shuttingDown) process.exit(1)
  shuttingDown = true
  console.log('\n\nGraceful shutdown requested...')
})

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs()

  // Validate env
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  // Load candidates
  console.log('Loading approved candidates for publishing...')
  const candidates = await getCandidatesForPublish({
    region: opts.region,
    category: opts.category !== 'all' ? opts.category : undefined,
    limit: opts.limit > 0 ? opts.limit : undefined,
    force: opts.force,
  })
  console.log(`  ${candidates.length} candidates loaded`)

  if (candidates.length === 0) {
    console.log('No candidates ready to publish. Run seed-generate-descriptions.ts first.')
    process.exit(0)
  }

  const batchId = randomUUID()

  console.log('='.repeat(60))
  console.log('Seed Publish Pipeline')
  console.log(`  Region:       ${opts.region}`)
  console.log(`  Category:     ${opts.category}`)
  console.log(`  Candidates:   ${candidates.length}`)
  console.log(`  Batch ID:     ${batchId}`)
  console.log(`  Concurrency:  ${opts.concurrency}`)
  console.log(`  Dry run:      ${opts.dryRun}`)
  console.log(`  Force:        ${opts.force}`)
  console.log('='.repeat(60))

  if (opts.dryRun) {
    console.log(`\n[DRY RUN] Would publish ${candidates.length} candidates`)
    console.log(`[DRY RUN] Batch ID would be: ${batchId}`)

    // Show sample of what would be published
    const sample = candidates.slice(0, 5)
    for (const c of sample) {
      console.log(`  - ${c.name} (${c.suburb}, ${c.state}) [confidence: ${c.confidence_score}]`)
    }
    if (candidates.length > 5) {
      console.log(`  ... and ${candidates.length - 5} more`)
    }
    process.exit(0)
  }

  // Create publish run
  const runId = await createPublishRun(
    batchId,
    opts.region,
    opts.category !== 'all' ? opts.category : null
  )

  // Counters
  const stats: PublishRunStats = {
    candidates_attempted: 0,
    published: 0,
    skipped_already_published: 0,
    skipped_ineligible: 0,
    errors: 0,
  }

  // Process in batches
  for (let i = 0; i < candidates.length; i += opts.concurrency) {
    if (shuttingDown) {
      console.log('\nShutdown: stopping publishing')
      break
    }

    const batch = candidates.slice(i, i + opts.concurrency)

    const results = await Promise.allSettled(
      batch.map(async (c) => {
        stats.candidates_attempted++
        return publishCandidate(c, batchId)
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const r = result.value
        switch (r.status) {
          case 'published':
            stats.published++
            break
          case 'skipped_already_published':
            stats.skipped_already_published++
            break
          case 'skipped_ineligible':
            stats.skipped_ineligible++
            break
          case 'error':
            stats.errors++
            console.error(`  ERROR: ${r.placeId} — ${r.error}`)
            break
        }
      } else {
        stats.errors++
        console.error(`  FATAL: ${result.reason}`)
      }
    }

    // Progress
    const processed = Math.min(i + opts.concurrency, candidates.length)
    if (processed % 10 === 0 || i === 0 || processed === candidates.length) {
      console.log(`  Published ${stats.published}/${processed} processed (${stats.skipped_already_published} skipped, ${stats.errors} errors)`)
    }
  }

  // Finalize run
  await finalizePublishRun(runId, stats)

  // Log to audit_log
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  await supabase.rpc('insert_audit_log', {
    p_action: 'seed_publish',
    p_entity_type: 'seed_batch',
    p_details: JSON.stringify({
      batch_id: batchId,
      region: opts.region,
      category: opts.category,
      ...stats,
    }),
  })

  // Refresh search index if any were published
  if (stats.published > 0) {
    console.log('\nRefreshing search index...')
    try {
      await refreshSearchIndex()
      console.log('  Search index refreshed.')
    } catch (err: any) {
      console.error(`  Warning: Failed to refresh search index: ${err.message}`)
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('--- PUBLISH COMPLETE ---')
  console.log(`  Candidates attempted:    ${stats.candidates_attempted}`)
  console.log(`  Published:               ${stats.published}`)
  console.log(`  Skipped (already pub'd): ${stats.skipped_already_published}`)
  console.log(`  Skipped (ineligible):    ${stats.skipped_ineligible}`)
  console.log(`  Errors:                  ${stats.errors}`)
  console.log(`  Batch ID:                ${batchId}`)
  console.log(`  Run ID:                  ${runId}`)
  if (stats.published > 0) {
    console.log(`\n  To rollback: npx tsx scripts/seed-rollback.ts --batch-id ${batchId}`)
  }
  console.log('='.repeat(60))

  resetPublishCache()
  process.exit(stats.errors > 0 && stats.published === 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
