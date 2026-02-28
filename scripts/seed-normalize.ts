#!/usr/bin/env npx tsx
/**
 * Seed Normalization Pipeline (Phase 2)
 *
 * Fetches Google Place Details for place_ids collected in Phase 1,
 * normalises into seed_candidates with confidence scoring.
 * No business inserts — output is seed_candidates table.
 *
 * Usage:
 *   npx tsx scripts/seed-normalize.ts --region seq --dry-run
 *   npx tsx scripts/seed-normalize.ts --region seq --category house-cleaning --max-api-calls 50
 *   npx tsx scripts/seed-normalize.ts --region seq --limit 100 --concurrency 3
 *   npx tsx scripts/seed-normalize.ts --region seq --force --min-confidence 0.5
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { getPlaceDetails } from '../src/lib/seeding/google-places-adapter'
import { normalizePhone, normalizeWebsite, parseAddress } from '../src/lib/seeding/normalizer'
import { isBlacklisted } from '../src/lib/seeding/blacklist'
import { mapGoogleTypes } from '../src/lib/seeding/google-type-mapper'
import { scoreCandidate, decideStatus } from '../src/lib/seeding/candidate-scorer'
import {
  isDetailsCached,
  getCachedDetails,
  storePlaceDetails,
  upsertCandidatesBatch,
  getSeenPlaces,
} from '../src/lib/seeding/normalize-store'
import type { PlaceResult } from '../src/lib/seeding/types'
import type { SeedCandidateRow } from '../src/lib/seeding/normalize-store'

// ─── CLI Args ────────────────────────────────────────────────────────

interface NormalizeOpts {
  region: string
  category: string
  limit: number
  maxApiCalls: number
  dryRun: boolean
  force: boolean
  concurrency: number
  minConfidence: number
}

function parseArgs(): NormalizeOpts {
  const args = process.argv.slice(2)
  const opts: NormalizeOpts = {
    region: '',
    category: 'all',
    limit: 0, // 0 = no limit
    maxApiCalls: 500,
    dryRun: false,
    force: false,
    concurrency: 3,
    minConfidence: 0.5,
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
      case '--max-api-calls':
        opts.maxApiCalls = parseInt(args[++i] ?? '500', 10)
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
      case '--min-confidence':
        opts.minConfidence = parseFloat(args[++i] ?? '0.5')
        break
    }
  }

  if (!opts.region) {
    console.error('Usage: npx tsx scripts/seed-normalize.ts --region <name> [options]')
    console.error('\nOptions:')
    console.error('  --region <name>         Region filter (required)')
    console.error('  --category <slug>       Category filter or "all" (default: all)')
    console.error('  --limit <n>             Max place_ids to process (default: unlimited)')
    console.error('  --max-api-calls <n>     Safety cap on API requests (default: 500)')
    console.error('  --dry-run               Show what would happen without API calls')
    console.error('  --force                 Re-fetch even if cached < 30 days')
    console.error('  --concurrency <n>       Parallel API requests (default: 3)')
    console.error('  --min-confidence <n>    Min confidence for ready_for_ai (default: 0.5)')
    process.exit(1)
  }

  return opts
}

// ─── Place Details Normalisation ─────────────────────────────────────

const AU_STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT']

function normalizePlace(
  place: PlaceResult,
  sourceRegion: string | null,
  sourceCategory: string | null,
  minConfidence: number
): { candidate: SeedCandidateRow; rejectReason?: string } | null {
  const name = place.displayName?.text
  if (!name) return null

  // Parse address
  const addr = parseAddress(place)

  // Fallback: parse postcode from formattedAddress if missing
  let postcode = addr.postcode
  let suburb = addr.suburb
  let state = addr.state

  if ((!suburb || !state || !postcode) && place.formattedAddress) {
    // Try regex: "... Suburb STATE POSTCODE, Australia"
    const match = place.formattedAddress.match(
      /([A-Za-z\s]+?)\s+(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\s+(\d{4})/
    )
    if (match) {
      if (!suburb) suburb = match[1].trim()
      if (!state) state = match[2]
      if (!postcode) postcode = match[3]
    }
  }

  // Phone normalisation
  const phone = normalizePhone(place.nationalPhoneNumber ?? place.internationalPhoneNumber)

  // Website normalisation
  const website = normalizeWebsite(place.websiteUri)

  // Google types
  const googleTypes = place.types ?? []

  // Map to internal categories
  const categories = mapGoogleTypes(googleTypes, sourceCategory ?? undefined)

  // Opening hours
  const openingHours = place.regularOpeningHours?.weekdayDescriptions
    ? { weekdayDescriptions: place.regularOpeningHours.weekdayDescriptions }
    : null

  // Score
  const scoreInput = {
    phone_e164: phone,
    website_url: website,
    user_ratings_total: place.userRatingCount ?? null,
    opening_hours_json: openingHours,
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    suburb,
    state,
    postcode,
    categories,
  }
  const { score, reasons, completenessFlags } = scoreCandidate(scoreInput)

  // Build candidate row
  const candidate: SeedCandidateRow = {
    place_id: place.id,
    source_region: sourceRegion,
    source_category: sourceCategory,
    name,
    address_line: addr.streetAddress,
    suburb: suburb ?? '',
    postcode: postcode ?? '',
    state: state ?? '',
    country: 'AU',
    lat: place.location?.latitude ?? 0,
    lng: place.location?.longitude ?? 0,
    phone_e164: phone,
    website_url: website,
    google_maps_url: place.googleMapsUri ?? null,
    rating: place.rating ?? null,
    user_ratings_total: place.userRatingCount ?? null,
    opening_hours_json: openingHours,
    categories,
    google_types: googleTypes,
    confidence_score: score,
    confidence_reasons: reasons,
    completeness_flags: completenessFlags,
    status: 'pending', // Will be set below
  }

  // Decide status (blacklist check done separately by caller)
  // For now, set status based on data quality only
  const statusInput = {
    confidence_score: score,
    min_confidence: minConfidence,
    phone_e164: phone,
    website_url: website,
    suburb,
    state,
    postcode,
    categories,
    is_blacklisted: false, // Will be overridden if blacklisted
  }
  const { status, rejectReason } = decideStatus(statusInput)
  candidate.status = status

  return { candidate, rejectReason }
}

// ─── Concurrency Helper ─────────────────────────────────────────────

async function processInBatches<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return results
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
  if (!opts.dryRun && !process.env.GOOGLE_PLACES_API_KEY) {
    console.error('Missing GOOGLE_PLACES_API_KEY (required unless --dry-run)')
    process.exit(1)
  }

  // Load place_ids from seed_seen_places
  console.log('Loading place_ids from seed_seen_places...')
  const filters: { region?: string; category?: string; limit?: number } = {}
  if (opts.region) filters.region = opts.region
  if (opts.category !== 'all') filters.category = opts.category
  if (opts.limit > 0) filters.limit = opts.limit

  const seenPlaces = await getSeenPlaces(filters)
  console.log(`  ${seenPlaces.length} place_ids loaded`)

  if (seenPlaces.length === 0) {
    console.log('No place_ids to process. Run seed-extract.ts first.')
    process.exit(0)
  }

  console.log('='.repeat(60))
  console.log('Seed Normalization Pipeline')
  console.log(`  Region:         ${opts.region}`)
  console.log(`  Category:       ${opts.category}`)
  console.log(`  Place IDs:      ${seenPlaces.length}`)
  console.log(`  Max API calls:  ${opts.maxApiCalls}`)
  console.log(`  Concurrency:    ${opts.concurrency}`)
  console.log(`  Min confidence: ${opts.minConfidence}`)
  console.log(`  Dry run:        ${opts.dryRun}`)
  console.log(`  Force:          ${opts.force}`)
  console.log('='.repeat(60))

  if (opts.dryRun) {
    // Check how many would need API calls
    let needsFetch = 0
    let cached = 0
    for (const sp of seenPlaces) {
      const isCached = await isDetailsCached(sp.place_id)
      if (isCached && !opts.force) cached++
      else needsFetch++
    }
    console.log(`\n[DRY RUN] ${cached} cached, ${needsFetch} need API fetch`)
    console.log(`[DRY RUN] Est. API calls: ${needsFetch}`)
    console.log(`[DRY RUN] Est. cost: $${(needsFetch * 0.017).toFixed(2)} (${needsFetch} × $0.017 Place Details Basic)`)
    process.exit(0)
  }

  // Counters
  let apiCalls = 0
  let fetchedOk = 0
  let fetchedNotFound = 0
  let fetchedError = 0
  let cachedUsed = 0
  let normalized = 0
  let readyForAi = 0
  let rejected = 0
  let blacklisted = 0
  let pending = 0
  const rejectReasons = new Map<string, number>()
  const candidateBatch: SeedCandidateRow[] = []

  // Process each place_id
  for (let i = 0; i < seenPlaces.length; i++) {
    if (shuttingDown) {
      console.log('\nShutdown: stopping processing')
      break
    }

    if (apiCalls >= opts.maxApiCalls) {
      console.log(`\n  Max API calls reached (${opts.maxApiCalls}). Stopping.`)
      break
    }

    const sp = seenPlaces[i]

    // Progress
    if ((i + 1) % 25 === 0 || i === 0) {
      console.log(`\n  Processing ${i + 1}/${seenPlaces.length}...`)
    }

    // Check cache
    let place: PlaceResult | null = null

    if (!opts.force) {
      const cached = await isDetailsCached(sp.place_id)
      if (cached) {
        const row = await getCachedDetails(sp.place_id)
        if (row && row.status === 'ok') {
          place = row.raw_json as unknown as PlaceResult
          cachedUsed++
        }
      }
    }

    // Fetch from API if not cached
    if (!place) {
      if (apiCalls >= opts.maxApiCalls) {
        console.log(`\n  Max API calls reached (${opts.maxApiCalls}). Stopping.`)
        break
      }

      try {
        apiCalls++
        place = await getPlaceDetails(sp.place_id)

        if (place) {
          await storePlaceDetails(sp.place_id, 'ok', place as unknown as Record<string, unknown>)
          fetchedOk++
        } else {
          await storePlaceDetails(sp.place_id, 'not_found', {})
          fetchedNotFound++
          continue
        }
      } catch (err: any) {
        const errorCode = err.message?.match(/(\d{3})/)?.[1] ?? 'unknown'
        await storePlaceDetails(sp.place_id, 'error', { error: err.message }, errorCode)
        fetchedError++
        continue
      }
    }

    // Normalize
    const result = normalizePlace(place, sp.source_region, sp.source_category, opts.minConfidence)
    if (!result) continue

    // Blacklist check
    const blocked = await isBlacklisted(sp.place_id, result.candidate.name)
    if (blocked) {
      result.candidate.status = 'rejected_low_quality'
      blacklisted++
      rejectReasons.set('blacklisted', (rejectReasons.get('blacklisted') ?? 0) + 1)
    }

    normalized++

    if (result.candidate.status === 'ready_for_ai') readyForAi++
    else if (result.candidate.status === 'rejected_low_quality') {
      rejected++
      if (result.rejectReason && !blocked) {
        rejectReasons.set(result.rejectReason, (rejectReasons.get(result.rejectReason) ?? 0) + 1)
      }
    } else {
      pending++
    }

    candidateBatch.push(result.candidate)

    // Flush batch every 50
    if (candidateBatch.length >= 50) {
      await upsertCandidatesBatch(candidateBatch)
      candidateBatch.length = 0
    }
  }

  // Flush remaining
  if (candidateBatch.length > 0) {
    await upsertCandidatesBatch(candidateBatch)
  }

  // Cost: Place Details (Basic) = $0.017 per call
  const costPerCall = 0.017
  const totalCost = apiCalls * costPerCall

  console.log('\n' + '='.repeat(60))
  console.log('--- NORMALIZATION COMPLETE ---')
  console.log(`  Place IDs processed:  ${Math.min(seenPlaces.length, normalized + fetchedNotFound + fetchedError + cachedUsed)}`)
  console.log(`  API calls made:       ${apiCalls} (${cachedUsed} from cache)`)
  console.log(`  Fetched OK:           ${fetchedOk}`)
  console.log(`  Not found:            ${fetchedNotFound}`)
  console.log(`  API errors:           ${fetchedError}`)
  console.log(`  Normalized:           ${normalized}`)
  console.log(`  Ready for AI:         ${readyForAi}`)
  console.log(`  Rejected:             ${rejected}`)
  console.log(`  Blacklisted:          ${blacklisted}`)
  console.log(`  Pending:              ${pending}`)
  if (rejectReasons.size > 0) {
    console.log(`  Rejection breakdown:`)
    for (const [reason, count] of Array.from(rejectReasons.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${reason}: ${count}`)
    }
  }
  console.log(`  Est. cost:            $${totalCost.toFixed(2)} (${apiCalls} × $${costPerCall} Place Details Basic)`)
  console.log('='.repeat(60))

  process.exit(fetchedError > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
