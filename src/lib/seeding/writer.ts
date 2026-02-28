/**
 * Writes seed businesses to the database.
 *
 * Inserts into businesses, business_contacts, business_locations,
 * and business_categories tables using the admin (service_role) client.
 */

import { createClient } from '@supabase/supabase-js'
import type { NormalizedBusiness, SeedResult } from './types'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

let cachedAdminId: string | null = null
let cachedCategoryMap: Map<string, string> | null = null

async function getAdminUserId(): Promise<string> {
  if (cachedAdminId) return cachedAdminId
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .single()

  if (error || !data) throw new Error('No admin user found')
  cachedAdminId = data.id
  return data.id
}

async function getCategoryMap(): Promise<Map<string, string>> {
  if (cachedCategoryMap) return cachedCategoryMap
  const supabase = getSupabase()
  const { data, error } = await supabase.from('categories').select('id, slug')
  if (error || !data) throw new Error('Failed to load categories')
  cachedCategoryMap = new Map(data.map((c) => [c.slug, c.id]))
  return cachedCategoryMap
}

/**
 * Insert a single seed business and all related records.
 */
export async function insertSeedBusiness(
  biz: NormalizedBusiness,
  confidence: number,
  description: string
): Promise<SeedResult> {
  const supabase = getSupabase()

  try {
    const adminId = await getAdminUserId()
    const categoryMap = await getCategoryMap()

    const categoryId = categoryMap.get(biz.categorySlug)
    if (!categoryId) {
      return { id: null, error: null, skipped: true, skipReason: 'no_category' }
    }

    // Add a hash from googlePlaceId to slug for uniqueness
    const hash = biz.googlePlaceId.slice(-6).toLowerCase().replace(/[^a-z0-9]/g, '')
    const slug = `${biz.slug}-${hash}`

    // 1. Insert business
    const { data: business, error: bizError } = await supabase
      .from('businesses')
      .insert({
        owner_id: adminId,
        name: biz.name,
        slug,
        description,
        status: 'published',
        verification_status: 'approved',
        is_seed: true,
        claim_status: 'unclaimed',
        seed_source: 'google_places',
        seed_source_id: biz.googlePlaceId,
        seed_confidence: confidence,
        listing_source: 'google_places',
        billing_status: 'seed',
      })
      .select('id')
      .single()

    if (bizError) {
      // Duplicate seed_source constraint — not an error, just already exists
      if (bizError.code === '23505') {
        return { id: null, error: null, skipped: true, skipReason: 'duplicate' }
      }
      return { id: null, error: bizError.message, skipped: false }
    }

    const businessId = business.id

    // 2. Insert business_contacts
    await supabase.from('business_contacts').insert({
      business_id: businessId,
      phone: biz.phone,
      website: biz.website,
    })

    // 3. Insert business_location via RPC
    await supabase.rpc('upsert_business_location', {
      p_business_id: businessId,
      p_suburb: biz.suburb,
      p_state: biz.state,
      p_postcode: biz.postcode,
      p_lat: biz.lat,
      p_lng: biz.lng,
      p_service_radius_km: 25,
    })

    // 4. Insert business_categories
    await supabase.from('business_categories').insert({
      business_id: businessId,
      category_id: categoryId,
      is_primary: true,
    })

    return { id: businessId, error: null, skipped: false }
  } catch (err: any) {
    return { id: null, error: err.message, skipped: false }
  }
}

/**
 * Refresh the search index after a batch of inserts.
 */
export async function refreshSearchIndex(): Promise<void> {
  const supabase = getSupabase()
  await supabase.rpc('refresh_all_search_index')
}

/**
 * Reset cached lookups (for testing or between batches).
 */
export function resetCache(): void {
  cachedAdminId = null
  cachedCategoryMap = null
}
