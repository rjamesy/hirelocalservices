/**
 * Read/write functions for Phase 2 seed normalisation tables:
 * - seed_place_details  (raw Google response cache)
 * - seed_candidates     (normalised candidate records)
 */

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── seed_place_details ─────────────────────────────────────────────

export interface PlaceDetailRow {
  place_id: string
  fetched_at: string
  status: 'ok' | 'not_found' | 'error'
  api_error_code: string | null
  raw_json: Record<string, unknown>
  fields_version: string
}

/** Check if place details are cached and fresh (< 30 days) */
export async function isDetailsCached(placeId: string): Promise<boolean> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('seed_place_details')
    .select('fetched_at, status')
    .eq('place_id', placeId)
    .maybeSingle()

  if (!data) return false
  if (data.status !== 'ok') return false

  const fetched = new Date(data.fetched_at)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  return fetched > thirtyDaysAgo
}

/** Get cached place details row */
export async function getCachedDetails(placeId: string): Promise<PlaceDetailRow | null> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('seed_place_details')
    .select('*')
    .eq('place_id', placeId)
    .maybeSingle()
  return data as PlaceDetailRow | null
}

/** Store raw Google Place Details response */
export async function storePlaceDetails(
  placeId: string,
  status: 'ok' | 'not_found' | 'error',
  rawJson: Record<string, unknown>,
  apiErrorCode?: string
): Promise<void> {
  const supabase = getSupabase()
  await supabase.from('seed_place_details').upsert(
    {
      place_id: placeId,
      fetched_at: new Date().toISOString(),
      status,
      api_error_code: apiErrorCode ?? null,
      raw_json: rawJson,
      fields_version: 'v1',
    },
    { onConflict: 'place_id' }
  )
}

// ─── seed_candidates ────────────────────────────────────────────────

export interface SeedCandidateRow {
  id?: string
  place_id: string
  source_region: string | null
  source_category: string | null
  name: string
  address_line: string | null
  suburb: string
  postcode: string
  state: string
  country: string
  lat: number
  lng: number
  phone_e164: string | null
  website_url: string | null
  google_maps_url: string | null
  rating: number | null
  user_ratings_total: number | null
  opening_hours_json: Record<string, unknown> | null
  categories: string[]
  google_types: string[]
  confidence_score: number
  confidence_reasons: string[]
  completeness_flags: string[]
  status: 'pending' | 'ready_for_ai' | 'rejected_low_quality'
}

/** Upsert a single seed candidate by place_id */
export async function upsertCandidate(candidate: SeedCandidateRow): Promise<void> {
  const supabase = getSupabase()
  await supabase.from('seed_candidates').upsert(
    {
      place_id: candidate.place_id,
      source_region: candidate.source_region,
      source_category: candidate.source_category,
      name: candidate.name,
      address_line: candidate.address_line,
      suburb: candidate.suburb,
      postcode: candidate.postcode,
      state: candidate.state,
      country: candidate.country,
      lat: candidate.lat,
      lng: candidate.lng,
      phone_e164: candidate.phone_e164,
      website_url: candidate.website_url,
      google_maps_url: candidate.google_maps_url,
      rating: candidate.rating,
      user_ratings_total: candidate.user_ratings_total,
      opening_hours_json: candidate.opening_hours_json,
      categories: candidate.categories,
      google_types: candidate.google_types,
      confidence_score: candidate.confidence_score,
      confidence_reasons: candidate.confidence_reasons,
      completeness_flags: candidate.completeness_flags,
      status: candidate.status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'place_id' }
  )
}

/** Batch upsert candidates (chunks of 200) */
export async function upsertCandidatesBatch(candidates: SeedCandidateRow[]): Promise<void> {
  if (candidates.length === 0) return
  const supabase = getSupabase()
  const now = new Date().toISOString()
  const rows = candidates.map((c) => ({
    place_id: c.place_id,
    source_region: c.source_region,
    source_category: c.source_category,
    name: c.name,
    address_line: c.address_line,
    suburb: c.suburb,
    postcode: c.postcode,
    state: c.state,
    country: c.country,
    lat: c.lat,
    lng: c.lng,
    phone_e164: c.phone_e164,
    website_url: c.website_url,
    google_maps_url: c.google_maps_url,
    rating: c.rating,
    user_ratings_total: c.user_ratings_total,
    opening_hours_json: c.opening_hours_json,
    categories: c.categories,
    google_types: c.google_types,
    confidence_score: c.confidence_score,
    confidence_reasons: c.confidence_reasons,
    completeness_flags: c.completeness_flags,
    status: c.status,
    updated_at: now,
  }))

  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200)
    await supabase.from('seed_candidates').upsert(chunk, { onConflict: 'place_id' })
  }
}

// ─── Queries for seed_seen_places (read) ────────────────────────────

export interface SeenPlaceRow {
  place_id: string
  source_region: string
  source_category: string
}

/** Load place_ids from seed_seen_places, optionally filtered */
export async function getSeenPlaces(filters?: {
  region?: string
  category?: string
  limit?: number
}): Promise<SeenPlaceRow[]> {
  const supabase = getSupabase()
  const results: SeenPlaceRow[] = []
  let from = 0
  const pageSize = 1000

  while (true) {
    let query = supabase
      .from('seed_seen_places')
      .select('place_id, source_region, source_category')

    if (filters?.region) query = query.eq('source_region', filters.region)
    if (filters?.category) query = query.eq('source_category', filters.category)

    query = query.range(from, from + pageSize - 1)

    const { data } = await query
    if (!data || data.length === 0) break

    for (const row of data) results.push(row as SeenPlaceRow)

    if (filters?.limit && results.length >= filters.limit) {
      return results.slice(0, filters.limit)
    }
    if (data.length < pageSize) break
    from += pageSize
  }

  return results
}

// ─── Report queries ─────────────────────────────────────────────────

export interface CandidateStats {
  total: number
  ready_for_ai: number
  rejected_low_quality: number
  pending: number
  with_phone: number
  with_website: number
  avg_confidence: number
}

export async function getCandidateStats(region?: string): Promise<CandidateStats> {
  const supabase = getSupabase()
  let query = supabase.from('seed_candidates').select('status, phone_e164, website_url, confidence_score')
  if (region) query = query.eq('source_region', region)

  const { data } = await query
  if (!data || data.length === 0) {
    return { total: 0, ready_for_ai: 0, rejected_low_quality: 0, pending: 0, with_phone: 0, with_website: 0, avg_confidence: 0 }
  }

  const total = data.length
  const ready_for_ai = data.filter((r) => r.status === 'ready_for_ai').length
  const rejected_low_quality = data.filter((r) => r.status === 'rejected_low_quality').length
  const pending = data.filter((r) => r.status === 'pending').length
  const with_phone = data.filter((r) => r.phone_e164).length
  const with_website = data.filter((r) => r.website_url).length
  const avg_confidence = data.reduce((sum, r) => sum + Number(r.confidence_score), 0) / total

  return { total, ready_for_ai, rejected_low_quality, pending, with_phone, with_website, avg_confidence: Math.round(avg_confidence * 100) / 100 }
}

export interface SuburbCount {
  suburb: string
  state: string
  count: number
}

export async function getTopSuburbs(region?: string, limit = 10): Promise<SuburbCount[]> {
  const supabase = getSupabase()
  let query = supabase.from('seed_candidates').select('suburb, state')
  if (region) query = query.eq('source_region', region)

  const { data } = await query
  if (!data) return []

  const counts = new Map<string, { suburb: string; state: string; count: number }>()
  for (const row of data) {
    const key = `${row.suburb}|${row.state}`
    const existing = counts.get(key)
    if (existing) {
      existing.count++
    } else {
      counts.set(key, { suburb: row.suburb, state: row.state, count: 1 })
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export async function getRejectionReasons(region?: string): Promise<Array<{ reason: string; count: number }>> {
  const supabase = getSupabase()
  let query = supabase
    .from('seed_candidates')
    .select('confidence_reasons')
    .eq('status', 'rejected_low_quality')
  if (region) query = query.eq('source_region', region)

  const { data } = await query
  if (!data) return []

  // Collect all reject reasons (the last reason in confidence_reasons typically holds reject info)
  // For better tracking, we look at what's missing from completeness_flags
  // But since we store reject reason in the normalize script, let's use a simpler approach:
  // We'll aggregate based on what's missing
  const reasons = new Map<string, number>()
  for (const row of data) {
    // confidence_reasons contains scoring breakdown, not rejection reasons directly
    // We need to check what's missing - fetch completeness_flags too
  }

  // Re-fetch with completeness_flags
  let query2 = supabase
    .from('seed_candidates')
    .select('completeness_flags, phone_e164, website_url, categories')
    .eq('status', 'rejected_low_quality')
  if (region) query2 = query2.eq('source_region', region)

  const { data: data2 } = await query2
  if (!data2) return []

  for (const row of data2) {
    const flags = row.completeness_flags as string[]
    if (!flags.includes('has_suburb') || !flags.includes('has_state') || !flags.includes('has_postcode')) {
      reasons.set('missing_address', (reasons.get('missing_address') ?? 0) + 1)
    } else if (!row.phone_e164 && !row.website_url) {
      reasons.set('no_contact', (reasons.get('no_contact') ?? 0) + 1)
    } else if (!row.categories || (row.categories as string[]).length === 0) {
      reasons.set('no_category', (reasons.get('no_category') ?? 0) + 1)
    } else {
      reasons.set('low_confidence', (reasons.get('low_confidence') ?? 0) + 1)
    }
  }

  return Array.from(reasons.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
}
