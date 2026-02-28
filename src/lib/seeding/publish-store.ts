/**
 * DB functions for the Phase 4 publish pipeline.
 *
 * Handles publishing approved seed_candidates → businesses table,
 * plus batch logging via seed_publish_runs.
 */

import { createClient } from '@supabase/supabase-js'
import { slugify } from './normalizer'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── Caches ─────────────────────────────────────────────────────────

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

export function resetPublishCache(): void {
  cachedAdminId = null
  cachedCategoryMap = null
}

// ─── Candidate types ────────────────────────────────────────────────

export interface PublishCandidate {
  place_id: string
  name: string
  suburb: string
  postcode: string
  state: string
  lat: number
  lng: number
  phone_e164: string | null
  website_url: string | null
  categories: string[]
  confidence_score: number
  description: string
  description_source: string
  publish_status: string
  published_business_id: string | null
}

export interface PublishResult {
  placeId: string
  businessId: string | null
  status: 'published' | 'skipped_already_published' | 'skipped_ineligible' | 'error'
  error?: string
}

// ─── Load candidates for publish ────────────────────────────────────

export async function getCandidatesForPublish(filters?: {
  region?: string
  category?: string
  limit?: number
  force?: boolean
}): Promise<PublishCandidate[]> {
  const supabase = getSupabase()
  const results: any[] = []
  let from = 0
  const pageSize = 500

  while (true) {
    let query = supabase
      .from('seed_candidates')
      .select('place_id, name, suburb, postcode, state, lat, lng, phone_e164, website_url, categories, confidence_score, description, description_source, publish_status, published_business_id')
      .eq('status', 'ready_for_ai')
      .eq('ai_validation_status', 'approved')
      .not('description', 'is', null)

    if (!filters?.force) {
      query = query.eq('publish_status', 'unpublished')
    }

    if (filters?.region) query = query.eq('source_region', filters.region)
    if (filters?.category) query = query.eq('source_category', filters.category)

    query = query.range(from, from + pageSize - 1)

    const { data } = await query
    if (!data || data.length === 0) break

    results.push(...data)

    if (filters?.limit && results.length >= filters.limit) {
      return results.slice(0, filters.limit)
    }
    if (data.length < pageSize) break
    from += pageSize
  }

  return results
}

// ─── Publish a single candidate ─────────────────────────────────────

export async function publishCandidate(
  candidate: PublishCandidate,
  batchId: string
): Promise<PublishResult> {
  const supabase = getSupabase()

  // Already published — idempotent skip
  if (candidate.publish_status === 'published' && candidate.published_business_id) {
    return { placeId: candidate.place_id, businessId: candidate.published_business_id, status: 'skipped_already_published' }
  }

  // Eligibility check: must have description, confidence >= 0.5, at least one category
  if (!candidate.description || candidate.confidence_score < 0.5 || candidate.categories.length === 0) {
    await updateCandidatePublishStatus(candidate.place_id, 'skipped', null, batchId, 'ineligible')
    return { placeId: candidate.place_id, businessId: null, status: 'skipped_ineligible' }
  }

  try {
    const adminId = await getAdminUserId()
    const categoryMap = await getCategoryMap()

    // Find the first valid category
    let categoryId: string | null = null
    for (const slug of candidate.categories) {
      const cid = categoryMap.get(slug)
      if (cid) { categoryId = cid; break }
    }
    if (!categoryId) {
      await updateCandidatePublishStatus(candidate.place_id, 'skipped', null, batchId, 'no_matching_category')
      return { placeId: candidate.place_id, businessId: null, status: 'skipped_ineligible' }
    }

    // Generate unique slug
    const hash = candidate.place_id.slice(-6).toLowerCase().replace(/[^a-z0-9]/g, '')
    const slug = `${slugify(candidate.name)}-${hash}`

    // 1. Insert business
    const { data: business, error: bizError } = await supabase
      .from('businesses')
      .insert({
        owner_id: adminId,
        name: candidate.name,
        slug,
        description: candidate.description,
        status: 'published',
        verification_status: 'approved',
        is_seed: true,
        claim_status: 'unclaimed',
        seed_source: 'google_places',
        seed_source_id: candidate.place_id,
        seed_confidence: candidate.confidence_score,
        listing_source: 'google_places',
        billing_status: 'seed',
        seed_batch_id: batchId,
      })
      .select('id')
      .single()

    if (bizError) {
      // Duplicate seed_source constraint — already published
      if (bizError.code === '23505') {
        await updateCandidatePublishStatus(candidate.place_id, 'skipped', null, batchId, 'duplicate_business')
        return { placeId: candidate.place_id, businessId: null, status: 'skipped_already_published' }
      }
      throw new Error(bizError.message)
    }

    const businessId = business.id

    // 2. Insert business_contacts
    await supabase.from('business_contacts').insert({
      business_id: businessId,
      phone: candidate.phone_e164,
      website: candidate.website_url,
    })

    // 3. Insert business_location via RPC
    await supabase.rpc('upsert_business_location', {
      p_business_id: businessId,
      p_suburb: candidate.suburb,
      p_state: candidate.state,
      p_postcode: candidate.postcode,
      p_lat: candidate.lat,
      p_lng: candidate.lng,
      p_service_radius_km: 25,
    })

    // 4. Insert business_categories (first = primary, rest = secondary)
    const categoryInserts = candidate.categories
      .map((slug) => categoryMap.get(slug))
      .filter((id): id is string => !!id)
      .map((catId, index) => ({
        business_id: businessId,
        category_id: catId,
        is_primary: index === 0,
      }))

    if (categoryInserts.length > 0) {
      // Insert primary first (trigger requires it before secondaries)
      await supabase.from('business_categories').insert(categoryInserts[0])
      if (categoryInserts.length > 1) {
        await supabase.from('business_categories').insert(categoryInserts.slice(1))
      }
    }

    // 5. Update candidate publish status
    await updateCandidatePublishStatus(candidate.place_id, 'published', businessId, batchId)

    return { placeId: candidate.place_id, businessId, status: 'published' }
  } catch (err: any) {
    await updateCandidatePublishStatus(candidate.place_id, 'unpublished', null, batchId, err.message?.slice(0, 200))
    return { placeId: candidate.place_id, businessId: null, status: 'error', error: err.message }
  }
}

// ─── Update candidate publish status ────────────────────────────────

export async function updateCandidatePublishStatus(
  placeId: string,
  publishStatus: string,
  businessId: string | null,
  batchId: string,
  error?: string
): Promise<void> {
  const supabase = getSupabase()
  await supabase
    .from('seed_candidates')
    .update({
      publish_status: publishStatus,
      published_business_id: businessId,
      published_at: publishStatus === 'published' ? new Date().toISOString() : null,
      publish_batch_id: batchId,
      publish_error: error ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('place_id', placeId)
}

// ─── Publish run logging ────────────────────────────────────────────

export interface PublishRunStats {
  candidates_attempted: number
  published: number
  skipped_already_published: number
  skipped_ineligible: number
  errors: number
}

export async function createPublishRun(batchId: string, region: string | null, category: string | null): Promise<string> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('seed_publish_runs')
    .insert({
      batch_id: batchId,
      region,
      category,
      run_started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create publish run: ${error.message}`)
  return data.id
}

export async function finalizePublishRun(runId: string, stats: PublishRunStats): Promise<void> {
  const supabase = getSupabase()
  await supabase
    .from('seed_publish_runs')
    .update({
      run_finished_at: new Date().toISOString(),
      candidates_attempted: stats.candidates_attempted,
      published: stats.published,
      skipped_already_published: stats.skipped_already_published,
      skipped_ineligible: stats.skipped_ineligible,
      errors: stats.errors,
    })
    .eq('id', runId)
}

// ─── Rollback ───────────────────────────────────────────────────────

export interface RollbackResult {
  businessesDeleted: number
  candidatesReset: number
  error?: string
}

export async function rollbackBatch(batchId: string): Promise<RollbackResult> {
  const supabase = getSupabase()

  // 1. Find all businesses in this batch
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id')
    .eq('seed_batch_id', batchId)

  if (!businesses || businesses.length === 0) {
    return { businessesDeleted: 0, candidatesReset: 0, error: 'No businesses found for this batch' }
  }

  const businessIds = businesses.map((b) => b.id)

  // 2. Delete related records (order matters for FK constraints)
  for (const bizId of businessIds) {
    await supabase.from('business_categories').delete().eq('business_id', bizId)
    await supabase.from('business_contacts').delete().eq('business_id', bizId)
    await supabase.from('business_locations').delete().eq('business_id', bizId)
    // Delete from search index if exists
    await supabase.from('business_search_index').delete().eq('business_id', bizId)
  }

  // 3. Delete businesses
  const { error: delError } = await supabase
    .from('businesses')
    .delete()
    .eq('seed_batch_id', batchId)

  if (delError) {
    return { businessesDeleted: 0, candidatesReset: 0, error: `Failed to delete businesses: ${delError.message}` }
  }

  // 4. Reset candidate publish status
  const { data: updated } = await supabase
    .from('seed_candidates')
    .update({
      publish_status: 'rolled_back',
      published_business_id: null,
      published_at: null,
      publish_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('publish_batch_id', batchId)
    .select('place_id')

  // 5. Mark the publish run as rolled back
  await supabase
    .from('seed_publish_runs')
    .update({ rolled_back_at: new Date().toISOString() })
    .eq('batch_id', batchId)

  return {
    businessesDeleted: businessIds.length,
    candidatesReset: updated?.length ?? 0,
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

export async function getPublishRunByBatchId(batchId: string): Promise<any | null> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('seed_publish_runs')
    .select('*')
    .eq('batch_id', batchId)
    .maybeSingle()
  return data
}
