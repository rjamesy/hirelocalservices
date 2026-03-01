/**
 * pw-service.ts — Centralized P/W service module
 *
 * ALL writes to published_listings (P) and working_listings (W) go through
 * this module. No action file implements its own P/W logic.
 *
 * Phase 2: Dual-write mode. Old system is authoritative. P/W writes shadow
 * the old system. Failures are caught and logged but never break user operations.
 *
 * Uses createAdminClient() (service role) because published_listings RLS
 * requires is_admin() for INSERT, but publishChanges() auto-approves from
 * user context.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types'

// ─── Types ──────────────────────────────────────────────────────────────────

export type WorkingFields = {
  // Text
  name?: string
  description?: string | null
  phone?: string | null
  email_contact?: string | null
  website?: string | null
  abn?: string | null
  // Location
  address_text?: string | null
  suburb?: string | null
  state?: string | null
  postcode?: string | null
  lat?: number | null
  lng?: number | null
  service_radius_km?: number
  // Categories
  primary_category_id?: string | null
  secondary_category_ids?: string[]
}

// ─── Dual-Write Helper ──────────────────────────────────────────────────────

/**
 * Wrap a P/W write in try/catch so failures never break the old system.
 * Phase 2 only — will be removed when P/W becomes authoritative.
 */
export async function dualWrite(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    console.error(`[pw-service] ${label} failed (non-blocking):`, err)
  }
}

// ─── Service Methods ────────────────────────────────────────────────────────

/**
 * Create a new working listing.
 *
 * Called after createBusinessDraft (change_type='new') or when a user
 * starts editing a published listing (change_type='edit').
 */
export async function createWorking(
  businessId: string,
  changeType: 'new' | 'edit',
  fields?: WorkingFields
): Promise<void> {
  const admin = createAdminClient()

  // Check if an active W already exists — don't create duplicates
  const { data: existing } = await admin
    .from('working_listings')
    .select('id')
    .eq('business_id', businessId)
    .is('archived_at', null)
    .maybeSingle()

  if (existing) {
    // Already has an active W — update it instead
    if (fields && Object.keys(fields).length > 0) {
      await admin
        .from('working_listings')
        .update({ ...fields, updated_at: new Date().toISOString() } as any)
        .eq('id', existing.id)
    }
    return
  }

  // For edit flow, pre-populate from current business state
  let initialFields: Record<string, unknown> = {}
  if (changeType === 'edit') {
    initialFields = await snapshotBusinessState(admin, businessId)
  }

  // Merge caller-provided fields over initial state
  const merged = { ...initialFields, ...fields }

  await admin.from('working_listings').insert({
    business_id: businessId,
    name: (merged.name as string) || 'Untitled',
    description: (merged.description as string | null) ?? null,
    phone: (merged.phone as string | null) ?? null,
    email_contact: (merged.email_contact as string | null) ?? null,
    website: (merged.website as string | null) ?? null,
    abn: (merged.abn as string | null) ?? null,
    address_text: (merged.address_text as string | null) ?? null,
    suburb: (merged.suburb as string | null) ?? null,
    state: (merged.state as string | null) ?? null,
    postcode: (merged.postcode as string | null) ?? null,
    lat: (merged.lat as number | null) ?? null,
    lng: (merged.lng as number | null) ?? null,
    service_radius_km: (merged.service_radius_km as number) ?? 25,
    primary_category_id: (merged.primary_category_id as string | null) ?? null,
    secondary_category_ids: (merged.secondary_category_ids as string[]) ?? [],
    review_status: 'draft',
    change_type: changeType,
  } as any)
}

/**
 * Update fields on the active working listing.
 *
 * If no active W exists (edge case during Phase 2), creates one as
 * change_type='edit' and applies fields.
 */
export async function updateWorking(
  businessId: string,
  fields: Partial<WorkingFields>
): Promise<void> {
  const admin = createAdminClient()

  const { data: activeW } = await admin
    .from('working_listings')
    .select('id')
    .eq('business_id', businessId)
    .is('archived_at', null)
    .maybeSingle()

  if (!activeW) {
    // No active W — create one as edit with these fields
    await createWorking(businessId, 'edit', fields)
    return
  }

  // Filter out undefined values
  const updateData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      updateData[key] = value
    }
  }

  if (Object.keys(updateData).length === 0) return

  await admin
    .from('working_listings')
    .update(updateData as any)
    .eq('id', activeW.id)
}

/**
 * Submit the working listing for review.
 * Sets review_status='pending' and submitted_at.
 */
export async function submitWorking(businessId: string): Promise<void> {
  const admin = createAdminClient()

  await admin
    .from('working_listings')
    .update({
      review_status: 'pending',
      submitted_at: new Date().toISOString(),
    } as any)
    .eq('business_id', businessId)
    .is('archived_at', null)
}

/**
 * Approve the working listing.
 *
 * Creates a new P snapshot from the current business state (since old code
 * has already applied changes to businesses + relational tables), then
 * archives the W.
 */
export async function approveWorking(
  businessId: string,
  adminId?: string,
  comment?: string
): Promise<void> {
  const admin = createAdminClient()

  // 1. Determine next amendment number
  const { data: maxAmendment } = await admin
    .from('published_listings')
    .select('amendment')
    .eq('business_id', businessId)
    .order('amendment', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextAmendment = maxAmendment ? maxAmendment.amendment + 1 : 0

  // 2. Mark all previous P rows as not current
  await admin
    .from('published_listings')
    .update({ is_current: false } as any)
    .eq('business_id', businessId)
    .eq('is_current', true)

  // 3. Build snapshot from current business state
  const snapshot = await snapshotBusinessState(admin, businessId)

  // Fetch business slug
  const { data: biz } = await admin
    .from('businesses')
    .select('slug')
    .eq('id', businessId)
    .single()

  // Fetch live photos
  const { data: livePhotos } = await admin
    .from('photos')
    .select('id, url, sort_order')
    .eq('business_id', businessId)
    .eq('status', 'live')
    .order('sort_order', { ascending: true })

  // Fetch live testimonials
  const { data: liveTestimonials } = await admin
    .from('testimonials')
    .select('id, author_name, text, rating')
    .eq('business_id', businessId)
    .eq('status', 'live')

  // Fetch categories with names
  const { data: bizCategories } = await admin
    .from('business_categories')
    .select('category_id, is_primary, categories(id, name)')
    .eq('business_id', businessId)

  const categoryIds = (bizCategories ?? []).map((bc: any) => bc.category_id)
  const categoryNames = (bizCategories ?? []).map((bc: any) => bc.categories?.name ?? '')
  const primaryCat = (bizCategories ?? []).find((bc: any) => bc.is_primary)

  // Determine visibility from old status
  const { data: statusRow } = await admin
    .from('businesses')
    .select('status')
    .eq('id', businessId)
    .single()

  let visibility: 'live' | 'paused' | 'suspended' = 'live'
  if (statusRow?.status === 'paused') visibility = 'paused'
  if (statusRow?.status === 'suspended') visibility = 'suspended'

  // 4. Insert new P row
  await admin.from('published_listings').insert({
    business_id: businessId,
    amendment: nextAmendment,
    is_current: true,
    visibility_status: visibility,
    name: (snapshot.name as string) || 'Untitled',
    slug: biz?.slug || '',
    description: (snapshot.description as string | null) ?? null,
    phone: (snapshot.phone as string | null) ?? null,
    email_contact: (snapshot.email_contact as string | null) ?? null,
    website: (snapshot.website as string | null) ?? null,
    abn: (snapshot.abn as string | null) ?? null,
    address_text: (snapshot.address_text as string | null) ?? null,
    suburb: (snapshot.suburb as string | null) ?? null,
    state: (snapshot.state as string | null) ?? null,
    postcode: (snapshot.postcode as string | null) ?? null,
    lat: (snapshot.lat as number | null) ?? null,
    lng: (snapshot.lng as number | null) ?? null,
    service_radius_km: (snapshot.service_radius_km as number | null) ?? null,
    category_ids: categoryIds,
    category_names: categoryNames,
    primary_category_id: primaryCat?.category_id ?? null,
    photos_snapshot: (livePhotos ?? []) as unknown as Record<string, unknown>[],
    testimonials_snapshot: (liveTestimonials ?? []) as unknown as Record<string, unknown>[],
    approved_by: adminId ?? null,
    approval_comment: comment ?? null,
  } as any)

  // 5. Archive the active W
  await admin
    .from('working_listings')
    .update({
      archived_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminId ?? null,
    } as any)
    .eq('business_id', businessId)
    .is('archived_at', null)
}

/**
 * Reject the working listing.
 * Sets review_status='changes_required', increments rejection_count.
 */
export async function rejectWorking(
  businessId: string,
  adminId?: string,
  reason?: string
): Promise<void> {
  const admin = createAdminClient()

  // Fetch current rejection_count
  const { data: activeW } = await admin
    .from('working_listings')
    .select('id, rejection_count')
    .eq('business_id', businessId)
    .is('archived_at', null)
    .maybeSingle()

  if (!activeW) return

  await admin
    .from('working_listings')
    .update({
      review_status: 'changes_required',
      rejection_reason: reason ?? null,
      rejection_count: (activeW.rejection_count ?? 0) + 1,
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminId ?? null,
    } as any)
    .eq('id', activeW.id)
}

/**
 * Archive the active working listing without creating a P snapshot.
 * Used when soft-deleting a business.
 */
export async function archiveWorking(businessId: string): Promise<void> {
  const admin = createAdminClient()

  await admin
    .from('working_listings')
    .update({ archived_at: new Date().toISOString() } as any)
    .eq('business_id', businessId)
    .is('archived_at', null)
}

/**
 * Update the visibility_status on the current published listing.
 * This is the ONLY mutable field on P.
 */
export async function setVisibility(
  businessId: string,
  status: 'live' | 'paused' | 'suspended'
): Promise<void> {
  const admin = createAdminClient()

  await admin
    .from('published_listings')
    .update({ visibility_status: status } as any)
    .eq('business_id', businessId)
    .eq('is_current', true)
}

/**
 * Get the active (non-archived) working listing for a business.
 */
export async function getActiveWorking(
  businessId: string
): Promise<Record<string, unknown> | null> {
  const admin = createAdminClient()

  const { data } = await admin
    .from('working_listings')
    .select('*')
    .eq('business_id', businessId)
    .is('archived_at', null)
    .maybeSingle()

  return data as Record<string, unknown> | null
}

/**
 * Get the current published listing for a business.
 */
export async function getCurrentPublished(
  businessId: string
): Promise<Record<string, unknown> | null> {
  const admin = createAdminClient()

  const { data } = await admin
    .from('published_listings')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_current', true)
    .maybeSingle()

  return data as Record<string, unknown> | null
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Read current business state from businesses + business_locations +
 * business_categories to build initial W fields or P snapshot data.
 */
async function snapshotBusinessState(
  admin: SupabaseClient<Database>,
  businessId: string
): Promise<Record<string, unknown>> {
  // Text fields from businesses
  const { data: biz } = await admin
    .from('businesses')
    .select('name, description, phone, email_contact, website, abn')
    .eq('id', businessId)
    .single()

  // Location from business_locations
  const { data: locations } = await admin
    .from('business_locations')
    .select('address_text, suburb, state, postcode, lat, lng, service_radius_km')
    .eq('business_id', businessId)
    .limit(1)

  const loc = locations?.[0] ?? null

  // Categories from business_categories
  const { data: cats } = await admin
    .from('business_categories')
    .select('category_id, is_primary')
    .eq('business_id', businessId)

  const primaryCat = (cats ?? []).find((c: any) => c.is_primary)
  const secondaryCats = (cats ?? [])
    .filter((c: any) => !c.is_primary)
    .map((c: any) => c.category_id)

  return {
    name: biz?.name ?? 'Untitled',
    description: biz?.description ?? null,
    phone: biz?.phone ?? null,
    email_contact: biz?.email_contact ?? null,
    website: biz?.website ?? null,
    abn: biz?.abn ?? null,
    address_text: loc?.address_text ?? null,
    suburb: loc?.suburb ?? null,
    state: loc?.state ?? null,
    postcode: loc?.postcode ?? null,
    lat: loc?.lat ?? null,
    lng: loc?.lng ?? null,
    service_radius_km: loc?.service_radius_km ?? 25,
    primary_category_id: primaryCat?.category_id ?? null,
    secondary_category_ids: secondaryCats,
  }
}
