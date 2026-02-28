#!/usr/bin/env npx tsx
/**
 * Seed Coverage Report (Phase 5)
 *
 * Generates a comprehensive coverage audit of published seed listings.
 *
 * Usage:
 *   npx tsx scripts/seed-coverage-report.ts
 *   npx tsx scripts/seed-coverage-report.ts --region seq
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

interface ReportOpts {
  region: string
}

function parseArgs(): ReportOpts {
  const args = process.argv.slice(2)
  const opts: ReportOpts = { region: '' }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--region') opts.region = args[++i]?.toLowerCase() ?? ''
  }
  return opts
}

async function main() {
  const opts = parseArgs()

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = getSupabase()

  console.log('='.repeat(60))
  console.log('SEED COVERAGE REPORT')
  if (opts.region) console.log(`  Region filter: ${opts.region}`)
  console.log('='.repeat(60))

  // ─── 1. Total published seed listings ─────────────────────────────

  let bizQuery = supabase
    .from('businesses')
    .select('id, name, slug, seed_confidence, listing_source, seed_batch_id')
    .eq('is_seed', true)
    .eq('status', 'published')

  const { data: seedBusinesses } = await bizQuery
  const total = seedBusinesses?.length ?? 0
  console.log(`\nTotal published seed listings: ${total}`)

  if (total === 0) {
    console.log('No seed listings found.')
    process.exit(0)
  }

  // ─── 2. Load locations for state/suburb analysis ──────────────────

  const bizIds = seedBusinesses!.map((b) => b.id)
  const locationMap = new Map<string, { suburb: string; state: string; postcode: string }>()

  for (let i = 0; i < bizIds.length; i += 500) {
    const chunk = bizIds.slice(i, i + 500)
    const { data: locs } = await supabase
      .from('business_locations')
      .select('business_id, suburb, state, postcode')
      .in('business_id', chunk)

    for (const loc of locs ?? []) {
      locationMap.set(loc.business_id, { suburb: loc.suburb, state: loc.state, postcode: loc.postcode })
    }
  }

  // ─── 3. Per-state counts ──────────────────────────────────────────

  const stateCounts = new Map<string, number>()
  for (const loc of locationMap.values()) {
    const state = loc.state ?? 'Unknown'
    stateCounts.set(state, (stateCounts.get(state) ?? 0) + 1)
  }

  console.log('\n--- Per State ---')
  for (const [state, count] of [...stateCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${state}: ${count}`)
  }

  // ─── 4. Per-suburb counts + top 10 ───────────────────────────────

  const suburbCounts = new Map<string, { suburb: string; state: string; count: number }>()
  for (const loc of locationMap.values()) {
    const key = `${loc.suburb}|${loc.state}`
    const existing = suburbCounts.get(key)
    if (existing) {
      existing.count++
    } else {
      suburbCounts.set(key, { suburb: loc.suburb, state: loc.state, count: 1 })
    }
  }

  const sortedSuburbs = [...suburbCounts.values()].sort((a, b) => b.count - a.count)

  console.log('\n--- Top 10 Suburbs ---')
  for (const s of sortedSuburbs.slice(0, 10)) {
    console.log(`  ${s.suburb}, ${s.state}: ${s.count}`)
  }

  // Suburbs with < 3 listings
  const lowSuburbs = sortedSuburbs.filter((s) => s.count < 3)
  console.log(`\nSuburbs with < 3 listings: ${lowSuburbs.length}`)
  if (lowSuburbs.length > 0 && lowSuburbs.length <= 20) {
    for (const s of lowSuburbs) {
      console.log(`  ${s.suburb}, ${s.state}: ${s.count}`)
    }
  }

  // ─── 5. Per-category counts ───────────────────────────────────────

  const categoryCounts = new Map<string, number>()
  for (let i = 0; i < bizIds.length; i += 500) {
    const chunk = bizIds.slice(i, i + 500)
    const { data: cats } = await supabase
      .from('business_categories')
      .select('business_id, category_id')
      .in('business_id', chunk)

    for (const cat of cats ?? []) {
      categoryCounts.set(cat.category_id, (categoryCounts.get(cat.category_id) ?? 0) + 1)
    }
  }

  // Resolve category names
  const { data: allCats } = await supabase.from('categories').select('id, name, slug')
  const catNameMap = new Map((allCats ?? []).map((c) => [c.id, { name: c.name, slug: c.slug }]))

  const sortedCats = [...categoryCounts.entries()]
    .map(([id, count]) => ({ id, name: catNameMap.get(id)?.name ?? id, slug: catNameMap.get(id)?.slug ?? id, count }))
    .sort((a, b) => b.count - a.count)

  console.log('\n--- Per Category ---')
  for (const c of sortedCats) {
    console.log(`  ${c.name} (${c.slug}): ${c.count}`)
  }

  // Categories with low coverage (< 5)
  const lowCats = sortedCats.filter((c) => c.count < 5)
  if (lowCats.length > 0) {
    console.log(`\nCategories with < 5 listings: ${lowCats.length}`)
    for (const c of lowCats) {
      console.log(`  ${c.name}: ${c.count}`)
    }
  }

  // ─── 6. Contact coverage ─────────────────────────────────────────

  let withPhone = 0
  let withWebsite = 0

  for (let i = 0; i < bizIds.length; i += 500) {
    const chunk = bizIds.slice(i, i + 500)
    const { data: contacts } = await supabase
      .from('business_contacts')
      .select('business_id, phone, website')
      .in('business_id', chunk)

    for (const c of contacts ?? []) {
      if (c.phone) withPhone++
      if (c.website) withWebsite++
    }
  }

  console.log('\n--- Contact Coverage ---')
  console.log(`  With phone:   ${withPhone}/${total} (${((withPhone / total) * 100).toFixed(1)}%)`)
  console.log(`  With website: ${withWebsite}/${total} (${((withWebsite / total) * 100).toFixed(1)}%)`)

  // ─── 7. Description source (AI vs fallback) ──────────────────────

  // Get from seed_candidates for published ones
  const publishedPlaceIds: string[] = []
  for (const biz of seedBusinesses!) {
    // seed_source_id is the place_id
    if (biz.listing_source === 'google_places') {
      // We need to query seed_candidates for description_source
    }
  }

  // Query seed_candidates for description stats
  let candQuery = supabase
    .from('seed_candidates')
    .select('description_source, confidence_score')
    .eq('publish_status', 'published')

  if (opts.region) candQuery = candQuery.eq('source_region', opts.region)

  const { data: publishedCandidates } = await candQuery

  if (publishedCandidates && publishedCandidates.length > 0) {
    const aiCount = publishedCandidates.filter((c) => c.description_source === 'openai').length
    const fallbackCount = publishedCandidates.filter((c) => c.description_source === 'fallback').length
    const avgConfidence = publishedCandidates.reduce((sum, c) => sum + Number(c.confidence_score), 0) / publishedCandidates.length

    console.log('\n--- Description Source ---')
    console.log(`  AI (OpenAI):  ${aiCount} (${((aiCount / publishedCandidates.length) * 100).toFixed(1)}%)`)
    console.log(`  Fallback:     ${fallbackCount} (${((fallbackCount / publishedCandidates.length) * 100).toFixed(1)}%)`)
    console.log(`\n--- Confidence ---`)
    console.log(`  Average confidence: ${avgConfidence.toFixed(2)}`)
  } else {
    console.log('\n--- Description Source ---')
    console.log('  No published candidates found in seed_candidates table.')
  }

  // ─── 8. Candidate pipeline summary ───────────────────────────────

  const { data: allCandidates } = await supabase
    .from('seed_candidates')
    .select('status, publish_status, ai_validation_status')

  if (allCandidates && allCandidates.length > 0) {
    const totalCandidates = allCandidates.length
    const readyForAi = allCandidates.filter((c) => c.status === 'ready_for_ai').length
    const rejected = allCandidates.filter((c) => c.status === 'rejected_low_quality').length
    const aiApproved = allCandidates.filter((c) => c.ai_validation_status === 'approved').length
    const published = allCandidates.filter((c) => c.publish_status === 'published').length
    const unpublished = allCandidates.filter((c) => c.publish_status === 'unpublished').length
    const rolledBack = allCandidates.filter((c) => c.publish_status === 'rolled_back').length

    console.log('\n--- Pipeline Summary ---')
    console.log(`  Total candidates:     ${totalCandidates}`)
    console.log(`  Ready for AI:         ${readyForAi}`)
    console.log(`  Rejected:             ${rejected}`)
    console.log(`  AI approved:          ${aiApproved}`)
    console.log(`  Published:            ${published}`)
    console.log(`  Unpublished:          ${unpublished}`)
    console.log(`  Rolled back:          ${rolledBack}`)
  }

  console.log('\n' + '='.repeat(60))
  console.log('REPORT COMPLETE')
  console.log('='.repeat(60))
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
