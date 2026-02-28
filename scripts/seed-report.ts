#!/usr/bin/env npx tsx
/**
 * Seed Candidates Report
 *
 * Outputs quality stats for seed_candidates table.
 *
 * Usage:
 *   npx tsx scripts/seed-report.ts
 *   npx tsx scripts/seed-report.ts --region seq
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import {
  getCandidateStats,
  getTopSuburbs,
  getRejectionReasons,
} from '../src/lib/seeding/normalize-store'

function parseArgs(): { region?: string } {
  const args = process.argv.slice(2)
  const opts: { region?: string } = {}

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--region') opts.region = args[++i]?.toLowerCase()
  }

  return opts
}

async function main() {
  const opts = parseArgs()

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const regionLabel = opts.region ?? 'all regions'
  console.log('='.repeat(60))
  console.log(`Seed Candidates Report — ${regionLabel}`)
  console.log('='.repeat(60))

  // Stats
  const stats = await getCandidateStats(opts.region)

  if (stats.total === 0) {
    console.log('\nNo seed candidates found. Run seed-normalize.ts first.')
    process.exit(0)
  }

  console.log('\n--- Overview ---')
  console.log(`  Total candidates:     ${stats.total}`)
  console.log(`  Ready for AI:         ${stats.ready_for_ai} (${pct(stats.ready_for_ai, stats.total)})`)
  console.log(`  Rejected:             ${stats.rejected_low_quality} (${pct(stats.rejected_low_quality, stats.total)})`)
  console.log(`  Pending:              ${stats.pending} (${pct(stats.pending, stats.total)})`)

  console.log('\n--- Contact Coverage ---')
  console.log(`  With phone:           ${stats.with_phone} (${pct(stats.with_phone, stats.total)})`)
  console.log(`  With website:         ${stats.with_website} (${pct(stats.with_website, stats.total)})`)
  console.log(`  Avg confidence:       ${stats.avg_confidence}`)

  // Rejection reasons
  const rejections = await getRejectionReasons(opts.region)
  if (rejections.length > 0) {
    console.log('\n--- Rejection Reasons ---')
    for (const { reason, count } of rejections.slice(0, 10)) {
      console.log(`  ${reason.padEnd(20)} ${count} (${pct(count, stats.rejected_low_quality)})`)
    }
  }

  // Top suburbs
  const suburbs = await getTopSuburbs(opts.region, 10)
  if (suburbs.length > 0) {
    console.log('\n--- Top Suburbs ---')
    for (const s of suburbs) {
      console.log(`  ${s.suburb}, ${s.state}`.padEnd(30) + `${s.count}`)
    }
  }

  console.log('\n' + '='.repeat(60))
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.round((n / total) * 100)}%`
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
