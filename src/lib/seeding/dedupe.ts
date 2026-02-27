/**
 * Deduplication engine for seed listings.
 *
 * Checks multiple signals to avoid inserting duplicate businesses:
 * 1. Exact match on seed_source_id (Google Place ID)
 * 2. Exact match on slug
 * 3. Fuzzy match on name + suburb
 */

import { createClient } from '@supabase/supabase-js'
import type { NormalizedBusiness } from './types'

type DedupeResult = {
  isDuplicate: boolean
  existingId?: string
  matchType?: 'source_id' | 'slug' | 'name_suburb'
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Simple similarity check — case-insensitive token overlap.
 * Returns a score from 0 to 1.
 */
function nameSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean))
  const tokensB = new Set(b.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean))
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  let overlap = 0
  tokensA.forEach((t) => {
    if (tokensB.has(t)) overlap++
  })
  return (2 * overlap) / (tokensA.size + tokensB.size)
}

export async function checkDuplicate(biz: NormalizedBusiness): Promise<DedupeResult> {
  const supabase = getSupabase()

  // 1. Exact match on Google Place ID
  const { data: sourceMatch } = await supabase
    .from('businesses')
    .select('id')
    .eq('seed_source', 'google_places')
    .eq('seed_source_id', biz.googlePlaceId)
    .maybeSingle()

  if (sourceMatch) {
    return { isDuplicate: true, existingId: sourceMatch.id, matchType: 'source_id' }
  }

  // 2. Exact match on slug
  const { data: slugMatch } = await supabase
    .from('businesses')
    .select('id')
    .eq('slug', biz.slug)
    .maybeSingle()

  if (slugMatch) {
    return { isDuplicate: true, existingId: slugMatch.id, matchType: 'slug' }
  }

  // 3. Fuzzy match on name + suburb (only if suburb is known)
  if (biz.suburb) {
    const { data: nameMatches } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('deleted_at', null)
      .limit(20)

    // We need to check businesses in the same suburb
    // Query businesses that have a location in the same suburb
    const { data: suburbMatches } = await supabase
      .from('business_search_index')
      .select('business_id, name')
      .eq('suburb', biz.suburb)
      .limit(50)

    if (suburbMatches) {
      for (const match of suburbMatches) {
        if (nameSimilarity(biz.name, match.name) >= 0.85) {
          return { isDuplicate: true, existingId: match.business_id, matchType: 'name_suburb' }
        }
      }
    }
  }

  return { isDuplicate: false }
}
