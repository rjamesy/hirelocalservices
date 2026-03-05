'use server'

import { createClient } from '@/lib/supabase/server'
import { ITEMS_PER_PAGE } from '@/lib/constants'
import type { ListingSource } from '@/lib/types'
import log from '@/lib/logger'

// ─── Types ──────────────────────────────────────────────────────────

export interface SearchBusinessesResult {
  id: string
  name: string
  slug: string
  phone: string | null
  website: string | null
  description: string | null
  listing_source: ListingSource
  is_claimed: boolean
  suburb: string | null
  state: string | null
  postcode: string | null
  service_radius_km: number | null
  distance_m: number | null
  category_names: string[]
  avg_rating: number | null
  review_count: number
  photo_url: string | null
  total_count: number
}

export interface SearchBusinessesResponse {
  results: SearchBusinessesResult[]
  totalCount: number
  page: number
  totalPages: number
  error?: string
}

export interface LocationToken {
  suburb: string
  state: string
  postcode: string
}

export interface ValidatedSearchParams {
  businessName?: string
  category?: string
  location?: LocationToken
  radius_km?: number
  keyword?: string
  page?: number
}

// ─── Location Validation ────────────────────────────────────────────

export async function validateLocationToken(
  token: LocationToken
): Promise<{ valid: boolean; lat?: number; lng?: number; error?: string }> {
  const supabase = await createClient()

  // Build query: match all provided fields
  let query = supabase
    .from('postcodes')
    .select('suburb, state, postcode, lat, lng')

  if (token.postcode) {
    query = query.eq('postcode', token.postcode)
  }
  if (token.suburb) {
    query = query.ilike('suburb', token.suburb)
  }
  if (token.state) {
    query = query.eq('state', String(token.state).toUpperCase())
  }

  const { data, error } = await query.limit(1).maybeSingle()

  if (error || !data) {
    return {
      valid: false,
      error: 'Please select a valid suburb or postcode from the list.',
    }
  }

  return { valid: true, lat: data.lat, lng: data.lng }
}

// ─── Server Actions ─────────────────────────────────────────────────

export async function searchBusinesses(
  params: ValidatedSearchParams
): Promise<SearchBusinessesResponse> {
  const supabase = await createClient()

  const page = Math.max(1, Math.min(params.page ?? 1, 1000))
  const offset = (page - 1) * ITEMS_PER_PAGE
  const businessName = (params.businessName?.trim() || '').slice(0, 200)
  const hasBusinessName = businessName.length > 0

  // ── Server-side validation ──
  // Rule: if no business name, location is required
  if (!hasBusinessName && !params.location) {
    return {
      results: [],
      totalCount: 0,
      page,
      totalPages: 0,
      error: 'Please enter a suburb or postcode, or search by business name.',
    }
  }

  // Resolve and validate location if provided
  let lat: number | null = null
  let lng: number | null = null

  if (params.location) {
    const validation = await validateLocationToken(params.location)
    if (!validation.valid) {
      return {
        results: [],
        totalCount: 0,
        page,
        totalPages: 0,
        error: validation.error,
      }
    }
    lat = validation.lat ?? null
    lng = validation.lng ?? null
  }

  // Determine radius: only apply if we have coordinates (clamped to 1–200 km)
  const rawRadius = params.radius_km ?? 25
  const radiusKm = lat && lng ? Math.max(1, Math.min(rawRadius, 200)) : null

  // ── Build the keyword for the RPC ──
  // Combine businessName and keyword if both present (limit length)
  const keyword = businessName || (params.keyword?.trim() || '').slice(0, 200) || null

  // Call the database RPC function
  const { data, error } = await supabase.rpc('search_businesses', {
    p_category_slug: params.category || null,
    p_lat: lat,
    p_lng: lng,
    p_radius_km: radiusKm ?? 25,
    p_keyword: keyword,
    p_limit: ITEMS_PER_PAGE,
    p_offset: offset,
  })

  if (error) {
    log.error({ error }, 'Search RPC error')
    return {
      results: [],
      totalCount: 0,
      page,
      totalPages: 0,
    }
  }

  const results = (data ?? []) as SearchBusinessesResult[]
  const totalCount = results.length > 0 ? Number(results[0].total_count) : 0
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  return {
    results,
    totalCount,
    page,
    totalPages,
  }
}

// ─── Legacy helpers (kept for backward compatibility) ───────────────

export async function lookupPostcode(
  postcode: string
): Promise<{
  suburb: string
  state: string
  lat: number
  lng: number
} | null> {
  if (!/^\d{4}$/.test(postcode)) {
    return null
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('postcodes')
    .select('suburb, state, lat, lng')
    .eq('postcode', postcode)
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return {
    suburb: data.suburb,
    state: data.state,
    lat: data.lat,
    lng: data.lng,
  }
}

export async function lookupSuburb(
  query: string
): Promise<
  Array<{
    postcode: string
    suburb: string
    state: string
    lat: number
    lng: number
  }>
> {
  if (!query || query.length < 2) {
    return []
  }

  const supabase = await createClient()

  const isPostcodeSearch = /^\d{1,4}$/.test(query)

  let dbQuery = supabase
    .from('postcodes')
    .select('postcode, suburb, state, lat, lng')
    .limit(10)

  if (isPostcodeSearch) {
    dbQuery = dbQuery.ilike('postcode', `${query}%`)
  } else {
    dbQuery = dbQuery.ilike('suburb', `%${query}%`)
  }

  const { data, error } = await dbQuery.order('suburb', { ascending: true })

  if (error || !data) {
    return []
  }

  return data.map((row) => ({
    postcode: row.postcode,
    suburb: row.suburb,
    state: row.state,
    lat: row.lat,
    lng: row.lng,
  }))
}
