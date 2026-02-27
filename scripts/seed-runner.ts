#!/usr/bin/env npx tsx
/**
 * Google Places Seed Runner
 *
 * Interactive CLI that seeds the database with businesses from Google Places API.
 *
 * Usage:
 *   npx tsx scripts/seed-runner.ts --city sydney --category plumber --dry-run
 *   npx tsx scripts/seed-runner.ts --city melbourne --limit 50
 *   npx tsx scripts/seed-runner.ts --city all --category all
 *
 * Options:
 *   --city <name>       City name or "all" (required)
 *   --category <slug>   Category slug or "all" (default: all)
 *   --dry-run           Show what would be inserted without writing
 *   --limit <n>         Max businesses to insert (default: 100)
 *
 * Requires env vars (reads from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GOOGLE_PLACES_API_KEY
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import {
  searchPlaces,
  normalizeBusiness,
  checkDuplicate,
  calculateConfidence,
  generateDescription,
  insertSeedBusiness,
  isBlacklisted,
  refreshSearchIndex,
  CATEGORY_QUERIES,
} from '../src/lib/seeding'
import type { SeedBatchStats, CityRegion, CategoryQuery } from '../src/lib/seeding'

// ─── City Regions ────────────────────────────────────────────────────

const CITIES: CityRegion[] = [
  // NSW
  { name: 'sydney', state: 'NSW', lat: -33.8688, lng: 151.2093, radius: 30000 },
  { name: 'newcastle', state: 'NSW', lat: -32.9283, lng: 151.7817, radius: 20000 },
  { name: 'wollongong', state: 'NSW', lat: -34.4278, lng: 150.8931, radius: 15000 },
  { name: 'central-coast', state: 'NSW', lat: -33.4260, lng: 151.3420, radius: 15000 },
  // VIC
  { name: 'melbourne', state: 'VIC', lat: -37.8136, lng: 144.9631, radius: 30000 },
  { name: 'geelong', state: 'VIC', lat: -38.1499, lng: 144.3617, radius: 15000 },
  { name: 'ballarat', state: 'VIC', lat: -37.5622, lng: 143.8503, radius: 12000 },
  { name: 'bendigo', state: 'VIC', lat: -36.7570, lng: 144.2785, radius: 12000 },
  // QLD
  { name: 'brisbane', state: 'QLD', lat: -27.4698, lng: 153.0251, radius: 30000 },
  { name: 'gold-coast', state: 'QLD', lat: -28.0167, lng: 153.4000, radius: 20000 },
  { name: 'sunshine-coast', state: 'QLD', lat: -26.6500, lng: 153.0667, radius: 15000 },
  { name: 'townsville', state: 'QLD', lat: -19.2590, lng: 146.8169, radius: 15000 },
  { name: 'cairns', state: 'QLD', lat: -16.9186, lng: 145.7781, radius: 12000 },
  // SA
  { name: 'adelaide', state: 'SA', lat: -34.9285, lng: 138.6007, radius: 25000 },
  // WA
  { name: 'perth', state: 'WA', lat: -31.9505, lng: 115.8605, radius: 30000 },
  { name: 'fremantle', state: 'WA', lat: -32.0569, lng: 115.7439, radius: 10000 },
  // TAS
  { name: 'hobart', state: 'TAS', lat: -42.8821, lng: 147.3272, radius: 15000 },
  { name: 'launceston', state: 'TAS', lat: -41.4332, lng: 147.1441, radius: 12000 },
  // NT
  { name: 'darwin', state: 'NT', lat: -12.4634, lng: 130.8456, radius: 15000 },
  { name: 'alice-springs', state: 'NT', lat: -23.6980, lng: 133.8807, radius: 10000 },
  // ACT
  { name: 'canberra', state: 'ACT', lat: -35.2809, lng: 149.1300, radius: 20000 },
]

// ─── CLI Args ────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = {
    city: '',
    category: 'all',
    dryRun: false,
    limit: 100,
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--city':
        opts.city = args[++i]?.toLowerCase() ?? ''
        break
      case '--category':
        opts.category = args[++i]?.toLowerCase() ?? 'all'
        break
      case '--dry-run':
        opts.dryRun = true
        break
      case '--limit':
        opts.limit = parseInt(args[++i] ?? '100', 10)
        break
    }
  }

  if (!opts.city) {
    console.error('Usage: npx tsx scripts/seed-runner.ts --city <name> [--category <slug>] [--dry-run] [--limit <n>]')
    console.error('\nAvailable cities:', CITIES.map((c) => c.name).join(', '), ', all')
    console.error('Available categories:', CATEGORY_QUERIES.map((c) => c.slug).join(', '), ', all')
    process.exit(1)
  }

  return opts
}

// ─── Stats Tracking ──────────────────────────────────────────────────

function createStats(): SeedBatchStats {
  return { total: 0, inserted: 0, duplicates: 0, blacklisted: 0, lowConfidence: 0, noPhone: 0, noCategory: 0, errors: 0 }
}

function printStats(stats: SeedBatchStats, label: string) {
  console.log(`\n--- ${label} ---`)
  console.log(`  Total found:     ${stats.total}`)
  console.log(`  Inserted:        ${stats.inserted}`)
  console.log(`  Duplicates:      ${stats.duplicates}`)
  console.log(`  Blacklisted:     ${stats.blacklisted}`)
  console.log(`  Low confidence:  ${stats.lowConfidence}`)
  console.log(`  No phone:        ${stats.noPhone}`)
  console.log(`  No category:     ${stats.noCategory}`)
  console.log(`  Errors:          ${stats.errors}`)
}

// ─── Graceful Shutdown ───────────────────────────────────────────────

let shuttingDown = false

process.on('SIGINT', () => {
  if (shuttingDown) process.exit(1)
  shuttingDown = true
  console.log('\n\nGraceful shutdown requested. Finishing current batch...')
})

// ─── Main ────────────────────────────────────────────────────────────

async function processCityCategory(
  city: CityRegion,
  category: CategoryQuery,
  stats: SeedBatchStats,
  opts: { dryRun: boolean; limit: number; requirePhone: boolean; minConfidence: number }
): Promise<void> {
  const query = `${category.googleQuery} in ${city.name} ${city.state}`
  console.log(`\n  Searching: "${query}"`)

  try {
    const places = await searchPlaces(query, city.lat, city.lng, city.radius)
    console.log(`  Found ${places.length} results`)

    for (const place of places) {
      if (shuttingDown || stats.inserted >= opts.limit) break
      stats.total++

      const normalized = normalizeBusiness(place, category.slug)

      // Check blacklist
      const blocked = await isBlacklisted(place.id, normalized.name)
      if (blocked) {
        stats.blacklisted++
        continue
      }

      // Check duplicate
      const dup = await checkDuplicate(normalized)
      if (dup.isDuplicate) {
        stats.duplicates++
        continue
      }

      // Calculate confidence
      const confidence = calculateConfidence(normalized)
      if (confidence < opts.minConfidence) {
        stats.lowConfidence++
        continue
      }

      // Check phone requirement
      if (opts.requirePhone && !normalized.phone) {
        stats.noPhone++
        continue
      }

      // Generate description
      const description = generateDescription(normalized)

      if (opts.dryRun) {
        console.log(`    [DRY RUN] Would insert: ${normalized.name} (${normalized.suburb ?? '?'}, ${normalized.state ?? '?'}) confidence=${confidence}`)
        stats.inserted++
        continue
      }

      // Insert
      const result = await insertSeedBusiness(normalized, confidence, description)
      if (result.skipped) {
        if (result.skipReason === 'duplicate') stats.duplicates++
        else if (result.skipReason === 'no_category') stats.noCategory++
        continue
      }
      if (result.error) {
        console.error(`    Error inserting ${normalized.name}: ${result.error}`)
        stats.errors++
        continue
      }

      stats.inserted++
      console.log(`    Inserted: ${normalized.name} (confidence=${confidence})`)
    }
  } catch (err: any) {
    console.error(`  API error: ${err.message}`)
    stats.errors++
  }
}

async function main() {
  const opts = parseArgs()

  // Validate env
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.error('Missing GOOGLE_PLACES_API_KEY')
    process.exit(1)
  }

  // Resolve cities
  const cities = opts.city === 'all'
    ? CITIES
    : CITIES.filter((c) => c.name === opts.city)

  if (cities.length === 0) {
    console.error(`Unknown city: ${opts.city}`)
    console.error('Available:', CITIES.map((c) => c.name).join(', '))
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

  console.log('='.repeat(60))
  console.log(`Google Places Seed Runner`)
  console.log(`  Cities:     ${cities.map((c) => c.name).join(', ')}`)
  console.log(`  Categories: ${categories.length === CATEGORY_QUERIES.length ? 'all' : categories.map((c) => c.slug).join(', ')}`)
  console.log(`  Limit:      ${opts.limit}`)
  console.log(`  Dry run:    ${opts.dryRun}`)
  console.log('='.repeat(60))

  const globalStats = createStats()

  for (const city of cities) {
    if (shuttingDown || globalStats.inserted >= opts.limit) break

    console.log(`\n[${city.name.toUpperCase()}, ${city.state}]`)

    for (const category of categories) {
      if (shuttingDown || globalStats.inserted >= opts.limit) break

      await processCityCategory(city, category, globalStats, {
        dryRun: opts.dryRun,
        limit: opts.limit,
        requirePhone: false,
        minConfidence: 0.5,
      })
    }
  }

  // Refresh search index after all inserts
  if (!opts.dryRun && globalStats.inserted > 0) {
    console.log('\nRefreshing search index...')
    await refreshSearchIndex()
    console.log('Search index refreshed.')
  }

  printStats(globalStats, 'FINAL RESULTS')
  process.exit(globalStats.errors > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
