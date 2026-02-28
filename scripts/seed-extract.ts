#!/usr/bin/env npx tsx
/**
 * Seed Extraction Engine
 *
 * Collects and deduplicates Google Place IDs efficiently across
 * multiple anchors and search terms per region. No business inserts —
 * output is unique place_ids, duplicates skipped, API calls, and cost.
 *
 * Usage:
 *   npx tsx scripts/seed-extract.ts --region seq --category house-cleaning --dry-run
 *   npx tsx scripts/seed-extract.ts --region seq --max-api-calls 10
 *   npx tsx scripts/seed-extract.ts --region seq --category all --force
 *
 * Options:
 *   --region <name>        Region preset (required) e.g. seq
 *   --category <slug>      Category slug or "all" (default: all)
 *   --dry-run              Show planned queries without API calls
 *   --force                Re-run queries even if run < 7 days ago
 *   --max-places <n>       Safety cap on unique places (default: 1000)
 *   --max-api-calls <n>    Safety cap on API requests (default: 500)
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import {
  searchPlacesTracked,
  CATEGORY_QUERIES,
  REGIONS,
  getRegion,
  TERM_EXPANSION,
  getSeenPlaceIds,
  wasQueryRunRecently,
  recordQueryRun,
  recordSeenPlacesBatch,
  hashQuery,
} from '../src/lib/seeding'
import type { Region, Anchor } from '../src/lib/seeding'

// ─── CLI Args ────────────────────────────────────────────────────────

interface ExtractOpts {
  region: string
  category: string
  dryRun: boolean
  force: boolean
  maxPlaces: number
  maxApiCalls: number
}

function parseArgs(): ExtractOpts {
  const args = process.argv.slice(2)
  const opts: ExtractOpts = {
    region: '',
    category: 'all',
    dryRun: false,
    force: false,
    maxPlaces: 1000,
    maxApiCalls: 500,
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--region':
        opts.region = args[++i]?.toLowerCase() ?? ''
        break
      case '--category':
        opts.category = args[++i]?.toLowerCase() ?? 'all'
        break
      case '--dry-run':
        opts.dryRun = true
        break
      case '--force':
        opts.force = true
        break
      case '--max-places':
        opts.maxPlaces = parseInt(args[++i] ?? '1000', 10)
        break
      case '--max-api-calls':
        opts.maxApiCalls = parseInt(args[++i] ?? '500', 10)
        break
    }
  }

  if (!opts.region) {
    console.error('Usage: npx tsx scripts/seed-extract.ts --region <name> [options]')
    console.error('\nAvailable regions:', REGIONS.map((r) => r.id).join(', '))
    console.error('Available categories:', CATEGORY_QUERIES.map((c) => c.slug).join(', '), ', all')
    console.error('\nOptions:')
    console.error('  --category <slug>    Category slug or "all" (default: all)')
    console.error('  --dry-run            Show planned queries without API calls')
    console.error('  --force              Re-run queries even if run < 7 days ago')
    console.error('  --max-places <n>     Safety cap on unique places (default: 1000)')
    console.error('  --max-api-calls <n>  Safety cap on API requests (default: 500)')
    process.exit(1)
  }

  return opts
}

// ─── Term Resolution ─────────────────────────────────────────────────

function getTermsForCategory(slug: string): string[] {
  if (TERM_EXPANSION[slug]) return TERM_EXPANSION[slug]
  // Fallback: use single googleQuery from CATEGORY_QUERIES
  const cat = CATEGORY_QUERIES.find((c) => c.slug === slug)
  return cat ? [cat.googleQuery] : []
}

// ─── Graceful Shutdown ───────────────────────────────────────────────

let shuttingDown = false

process.on('SIGINT', () => {
  if (shuttingDown) process.exit(1)
  shuttingDown = true
  console.log('\n\nGraceful shutdown requested. Finishing current query...')
})

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs()

  // Validate env
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  if (!opts.dryRun && !process.env.GOOGLE_PLACES_API_KEY) {
    console.error('Missing GOOGLE_PLACES_API_KEY (required unless --dry-run)')
    process.exit(1)
  }

  // Resolve region
  const region = getRegion(opts.region)
  if (!region) {
    console.error(`Unknown region: ${opts.region}`)
    console.error('Available:', REGIONS.map((r) => `${r.id} (${r.name})`).join(', '))
    process.exit(1)
  }

  // Resolve categories
  const categories = opts.category === 'all'
    ? CATEGORY_QUERIES
    : CATEGORY_QUERIES.filter((c) => c.slug === opts.category)

  if (categories.length === 0) {
    console.error(`Unknown category: ${opts.category}`)
    console.error('Available:', CATEGORY_QUERIES.map((c) => c.slug).join(', '))
    process.exit(1)
  }

  // Build query plan: [{ anchor, term, category, queryHash }]
  const queryPlan: Array<{
    anchor: Anchor
    term: string
    categorySlug: string
    queryHash: string
  }> = []

  for (const cat of categories) {
    const terms = getTermsForCategory(cat.slug)
    for (const anchor of region.anchors) {
      for (const term of terms) {
        queryPlan.push({
          anchor,
          term,
          categorySlug: cat.slug,
          queryHash: hashQuery(region.id, anchor.name, term),
        })
      }
    }
  }

  // Count terms per category for display
  const termsPerCategory = categories.map((c) => getTermsForCategory(c.slug).length)
  const totalTerms = termsPerCategory.reduce((a, b) => a + b, 0)

  console.log('='.repeat(60))
  console.log('Seed Extraction Engine')
  console.log(`  Region:         ${region.id} (${region.name})`)
  console.log(`  Anchors:        ${region.anchors.length}`)
  console.log(`  Categories:     ${categories.length === CATEGORY_QUERIES.length ? 'all (' + categories.length + ')' : categories.map((c) => c.slug).join(', ')}`)
  console.log(`  Total terms:    ${totalTerms}`)
  console.log(`  Total queries:  ${queryPlan.length} (${region.anchors.length} anchors × ${totalTerms} terms)`)
  console.log(`  Max places:     ${opts.maxPlaces}`)
  console.log(`  Max API calls:  ${opts.maxApiCalls}`)
  console.log(`  Dry run:        ${opts.dryRun}`)
  console.log(`  Force:          ${opts.force}`)
  console.log('='.repeat(60))

  if (opts.dryRun) {
    console.log('\n[DRY RUN] Planned queries:\n')
    for (const q of queryPlan) {
      console.log(`  "${q.term}" near ${q.anchor.name} (${q.anchor.radius / 1000}km) [${q.categorySlug}]`)
    }
    console.log(`\n[DRY RUN] Would execute ${queryPlan.length} API calls`)
    console.log(`[DRY RUN] Est. cost: $${(queryPlan.length * 0.032).toFixed(2)} (${queryPlan.length} × $0.032)`)
    process.exit(0)
  }

  // Load existing seen places into memory
  console.log('\nLoading existing seen places...')
  const seenSet = await getSeenPlaceIds()
  console.log(`  ${seenSet.size} previously seen place_ids loaded`)

  // Counters
  const apiCallCounter = { count: 0 }
  let newPlacesCount = 0
  let dupesCount = 0
  let skippedQueries = 0
  let apiErrors = 0
  const newPlacesBatch: Array<{ placeId: string; region: string; category: string; term: string }> = []

  // Execute queries
  for (const q of queryPlan) {
    if (shuttingDown) {
      console.log('\nShutdown: stopping query loop')
      break
    }

    // Safety: max API calls
    if (apiCallCounter.count >= opts.maxApiCalls) {
      console.log(`\n⚠ Max API calls reached (${opts.maxApiCalls}). Stopping.`)
      break
    }

    // Safety: max places
    if (newPlacesCount + seenSet.size >= opts.maxPlaces + seenSet.size - seenSet.size) {
      // Simplified: just check newPlacesCount
      if (newPlacesCount >= opts.maxPlaces) {
        console.log(`\n⚠ Max places reached (${opts.maxPlaces}). Stopping.`)
        break
      }
    }

    // Check if query was run recently
    if (!opts.force) {
      const recent = await wasQueryRunRecently(q.queryHash)
      if (recent) {
        skippedQueries++
        continue
      }
    }

    const searchQuery = `${q.term} in ${q.anchor.name} ${region.state}`
    console.log(`  Searching: "${searchQuery}" ...`)

    try {
      const places = await searchPlacesTracked(
        searchQuery,
        q.anchor.lat,
        q.anchor.lng,
        q.anchor.radius,
        apiCallCounter
      )

      let queryNewCount = 0
      for (const place of places) {
        if (seenSet.has(place.id)) {
          dupesCount++
        } else {
          seenSet.add(place.id)
          newPlacesCount++
          queryNewCount++
          newPlacesBatch.push({
            placeId: place.id,
            region: region.id,
            category: q.categorySlug,
            term: q.term,
          })
        }
      }

      console.log(`    → ${places.length} results (${queryNewCount} new, ${places.length - queryNewCount} dupes)`)

      // Record query run
      await recordQueryRun({
        queryHash: q.queryHash,
        region: region.id,
        category: q.categorySlug,
        anchor: q.anchor.name,
        term: q.term,
        pagesFetched: 1,
        resultsCount: places.length,
      })

      // Batch flush every 100 new places
      if (newPlacesBatch.length >= 100) {
        await recordSeenPlacesBatch(newPlacesBatch)
        newPlacesBatch.length = 0
      }

      // Check max places after this query
      if (newPlacesCount >= opts.maxPlaces) {
        console.log(`\n⚠ Max places reached (${opts.maxPlaces}). Stopping.`)
        break
      }
    } catch (err: any) {
      console.error(`    ✗ API error: ${err.message}`)
      apiErrors++
    }
  }

  // Flush remaining batch
  if (newPlacesBatch.length > 0) {
    await recordSeenPlacesBatch(newPlacesBatch)
  }

  // Summary
  const costPerCall = 0.032
  const totalCost = apiCallCounter.count * costPerCall

  console.log('\n' + '='.repeat(60))
  console.log('--- EXTRACTION COMPLETE ---')
  console.log(`  Region:           ${region.id} (${region.name})`)
  console.log(`  Anchors:          ${region.anchors.length}`)
  console.log(`  Terms per cat:    ${termsPerCategory.join(', ')}`)
  console.log(`  Total queries:    ${queryPlan.length} (${skippedQueries} skipped as recent)`)
  console.log(`  API calls made:   ${apiCallCounter.count}`)
  console.log(`  Unique place_ids: ${seenSet.size} (${newPlacesCount} new, ${seenSet.size - newPlacesCount} already seen)`)
  console.log(`  Duplicates:       ${dupesCount}`)
  console.log(`  API errors:       ${apiErrors}`)
  console.log(`  Est. cost:        $${totalCost.toFixed(2)} (${apiCallCounter.count} text searches × $${costPerCall})`)
  console.log('='.repeat(60))

  process.exit(apiErrors > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
