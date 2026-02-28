/**
 * Read/write functions for seed extraction tracking tables:
 * - seed_seen_places  (dedup across runs)
 * - seed_query_runs   (skip recent identical queries)
 */

import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** Check if a place_id has already been seen */
export async function isPlaceSeen(placeId: string): Promise<boolean> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('seed_seen_places')
    .select('place_id')
    .eq('place_id', placeId)
    .limit(1)
    .maybeSingle()
  return !!data
}

/** Record a single newly seen place */
export async function recordSeenPlace(
  placeId: string,
  region: string,
  category: string,
  term: string
): Promise<void> {
  const supabase = getSupabase()
  await supabase.from('seed_seen_places').upsert(
    {
      place_id: placeId,
      last_seen_at: new Date().toISOString(),
      source_region: region,
      source_category: category,
      source_term: term,
    },
    { onConflict: 'place_id' }
  )
}

/** Batch upsert seen places (efficient for bulk inserts) */
export async function recordSeenPlacesBatch(
  places: Array<{ placeId: string; region: string; category: string; term: string }>
): Promise<void> {
  if (places.length === 0) return
  const supabase = getSupabase()
  const now = new Date().toISOString()
  const rows = places.map((p) => ({
    place_id: p.placeId,
    last_seen_at: now,
    source_region: p.region,
    source_category: p.category,
    source_term: p.term,
  }))
  // Upsert in chunks of 500
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    await supabase.from('seed_seen_places').upsert(chunk, { onConflict: 'place_id' })
  }
}

/** Load all seen place_ids into an in-memory Set */
export async function getSeenPlaceIds(): Promise<Set<string>> {
  const supabase = getSupabase()
  const ids = new Set<string>()
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data } = await supabase
      .from('seed_seen_places')
      .select('place_id')
      .range(from, from + pageSize - 1)
    if (!data || data.length === 0) break
    for (const row of data) ids.add(row.place_id)
    if (data.length < pageSize) break
    from += pageSize
  }
  return ids
}

/** Check if a query was run within the last 7 days */
export async function wasQueryRunRecently(queryHash: string): Promise<boolean> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('seed_query_runs')
    .select('last_run_at')
    .eq('query_hash', queryHash)
    .maybeSingle()
  if (!data) return false
  const lastRun = new Date(data.last_run_at)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  return lastRun > sevenDaysAgo
}

/** Record a completed query run */
export async function recordQueryRun(params: {
  queryHash: string
  region: string
  category: string
  anchor: string
  term: string
  pagesFetched: number
  resultsCount: number
}): Promise<void> {
  const supabase = getSupabase()
  await supabase.from('seed_query_runs').upsert(
    {
      query_hash: params.queryHash,
      region: params.region,
      category: params.category,
      anchor: params.anchor,
      term: params.term,
      last_run_at: new Date().toISOString(),
      pages_fetched: params.pagesFetched,
      results_count: params.resultsCount,
    },
    { onConflict: 'query_hash' }
  )
}

/** Generate a deterministic hash for a query combination */
export function hashQuery(region: string, anchor: string, term: string): string {
  return createHash('md5').update(`${region}|${anchor}|${term}`).digest('hex')
}
