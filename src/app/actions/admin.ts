'use server'

import { createClient } from '@/lib/supabase/server'
import { ITEMS_PER_PAGE } from '@/lib/constants'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit'
import { getUserEntitlements, syncBusinessBillingStatus, type Entitlements } from '@/lib/entitlements'
import { getListingEligibility, type ListingEligibility } from '@/lib/search/eligibility'
import { createNotification } from '@/app/actions/notifications'
import * as pwService from '@/lib/pw-service'

// ─── Helpers ────────────────────────────────────────────────────────

async function verifyAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('You must be logged in to perform this action')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    throw new Error('You do not have admin permissions')
  }

  return { supabase, user }
}

// ─── Types ──────────────────────────────────────────────────────────

export interface AdminListingItem {
  id: string
  name: string
  slug: string
  status: string
  created_at: string
  owner_email: string | null
  subscription_status: string | null
}

export interface AdminReportItem {
  id: string
  reason: string
  details: string | null
  status: string
  created_at: string
  business_id: string
  business_name: string | null
  business_slug: string | null
}

export interface PaginatedResponse<T> {
  data: T[]
  totalCount: number
  page: number
  totalPages: number
}

// ─── Server Actions ─────────────────────────────────────────────────

export async function getAdminListings(
  page: number = 1,
  status?: string
): Promise<PaginatedResponse<AdminListingItem>> {
  const { supabase } = await verifyAdmin()

  const offset = (page - 1) * ITEMS_PER_PAGE

  // Build the query for businesses with owner email and billing_status
  let query = supabase
    .from('businesses')
    .select(
      `
      id,
      name,
      slug,
      status,
      created_at,
      billing_status,
      profiles!businesses_owner_id_fkey (email)
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + ITEMS_PER_PAGE - 1)

  if (status) {
    query = query.eq('status', status as 'draft' | 'published' | 'suspended')
  }

  const { data, count, error } = await query

  if (error) {
    console.error('Admin listings query error:', error)
    return { data: [], totalCount: 0, page, totalPages: 0 }
  }

  const totalCount = count ?? 0
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  const listings: AdminListingItem[] = (data ?? []).map((row: any) => {
    // profiles comes back as an object (single FK relationship)
    const profile = row.profiles

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      created_at: row.created_at,
      owner_email: profile?.email ?? null,
      subscription_status: row.billing_status ?? null,
    }
  })

  return { data: listings, totalCount, page, totalPages }
}

export async function getAdminReports(
  page: number = 1,
  status?: string
): Promise<PaginatedResponse<AdminReportItem>> {
  const { supabase } = await verifyAdmin()

  const offset = (page - 1) * ITEMS_PER_PAGE

  let query = supabase
    .from('reports')
    .select(
      `
      id,
      reason,
      details,
      status,
      created_at,
      business_id,
      businesses (name, slug)
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + ITEMS_PER_PAGE - 1)

  if (status) {
    query = query.eq('status', status as 'open' | 'resolved')
  }

  const { data, count, error } = await query

  if (error) {
    console.error('Admin reports query error:', error)
    return { data: [], totalCount: 0, page, totalPages: 0 }
  }

  const totalCount = count ?? 0
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  const reports: AdminReportItem[] = (data ?? []).map((row: any) => {
    const business = row.businesses

    return {
      id: row.id,
      reason: row.reason,
      details: row.details,
      status: row.status,
      created_at: row.created_at,
      business_id: row.business_id,
      business_name: business?.name ?? null,
      business_slug: business?.slug ?? null,
    }
  })

  return { data: reports, totalCount, page, totalPages }
}

export async function adminSuspendBusiness(businessId: string, reason?: string) {
  const { supabase, user } = await verifyAdmin()

  const { data: business, error: fetchError } = await supabase
    .from('businesses')
    .select('id, slug, name, status, owner_id')
    .eq('id', businessId)
    .single()

  if (fetchError || !business) {
    return { error: 'Business not found' }
  }

  if (business.status === 'suspended') {
    return { error: 'Business is already suspended' }
  }

  const { error } = await supabase
    .from('businesses')
    .update({
      status: 'suspended',
      suspended_reason: reason || 'Admin suspended',
      suspended_at: new Date().toISOString(),
    })
    .eq('id', businessId)

  if (error) {
    return { error: 'Failed to suspend business. Please try again.' }
  }

  await logAudit(supabase, {
    action: 'listing_suspended',
    entityType: 'listing',
    entityId: businessId,
    actorId: user.id,
    details: {
      listing_name: business.name,
      before_state: { status: business.status },
      after_state: { status: 'suspended' },
    },
  })

  // Notify owner
  if (business.owner_id) {
    await createNotification(supabase, {
      userId: business.owner_id,
      type: 'listing_suspended',
      title: 'Listing Suspended',
      message: `Your listing "${business.name}" has been suspended.${reason ? ` Reason: ${reason}` : ''}`,
      metadata: { businessId, reason },
    })
  }

  // ── P/W dual-write: set P visibility to suspended ────────────────
  await pwService.dualWrite('adminSuspendBusiness', () =>
    pwService.setVisibility(businessId, 'suspended')
  )

  revalidatePath('/admin')
  revalidatePath(`/business/${business.slug}`)
  return { success: true }
}

export async function adminUnsuspendBusiness(businessId: string) {
  const { supabase, user } = await verifyAdmin()

  const { data: business, error: fetchError } = await supabase
    .from('businesses')
    .select('id, slug, name, status')
    .eq('id', businessId)
    .single()

  if (fetchError || !business) {
    return { error: 'Business not found' }
  }

  if (business.status !== 'suspended') {
    return { error: 'Business is not currently suspended' }
  }

  // Restore to published status. The business visibility still depends on
  // having an active subscription (enforced by RLS and the is_business_visible
  // function), so this is safe.
  const { error } = await supabase
    .from('businesses')
    .update({
      status: 'published',
      suspended_reason: null,
      suspended_at: null,
    })
    .eq('id', businessId)

  if (error) {
    return { error: 'Failed to unsuspend business. Please try again.' }
  }

  await logAudit(supabase, {
    action: 'listing_unsuspended',
    entityType: 'listing',
    entityId: businessId,
    actorId: user.id,
    details: {
      listing_name: business.name,
      previous_status: 'suspended',
      new_status: 'published',
    },
  })

  // ── P/W dual-write: set P visibility to live ────────────────────
  await pwService.dualWrite('adminUnsuspendBusiness', () =>
    pwService.setVisibility(businessId, 'live')
  )

  revalidatePath('/admin')
  revalidatePath(`/business/${business.slug}`)
  return { success: true }
}

export async function adminResolveReport(reportId: string, outcome?: string) {
  const { supabase, user } = await verifyAdmin()

  const { data: report, error: fetchError } = await supabase
    .from('reports')
    .select('id, status, business_id')
    .eq('id', reportId)
    .single()

  if (fetchError || !report) {
    return { error: 'Report not found' }
  }

  if (report.status === 'resolved') {
    return { error: 'Report is already resolved' }
  }

  const { error } = await supabase
    .from('reports')
    .update({
      status: 'resolved',
      resolution_outcome: outcome || 'dismissed',
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', reportId)

  if (error) {
    return { error: 'Failed to resolve report. Please try again.' }
  }

  await logAudit(supabase, {
    action: 'report_resolved',
    entityType: 'report',
    entityId: reportId,
    actorId: user.id,
    details: {
      business_id: report.business_id,
      resolution_outcome: outcome || 'dismissed',
    },
  })

  revalidatePath('/admin')
  return { success: true }
}

// ─── Unlist / Restore ───────────────────────────────────────────────

export async function unlistBusiness(businessId: string, addToBlacklist?: boolean) {
  const { supabase, user } = await verifyAdmin()

  const { data: business, error: fetchError } = await supabase
    .from('businesses')
    .select('id, slug, name, verification_status')
    .eq('id', businessId)
    .single()

  if (fetchError || !business) {
    return { error: 'Business not found' }
  }

  if (business.verification_status === 'suspended') {
    return { error: 'Business is already unlisted (suspended)' }
  }

  const { error } = await supabase
    .from('businesses')
    .update({ verification_status: 'suspended' })
    .eq('id', businessId)

  if (error) {
    return { error: 'Failed to unlist business' }
  }

  // Refresh search index to remove from results
  await supabase.rpc('refresh_search_index', { p_business_id: businessId })

  // Optional: add name to blacklist
  if (addToBlacklist && business.name) {
    await supabase.from('blacklist').insert({
      term: business.name.toLowerCase(),
      match_type: 'exact',
      reason: 'Unlisted by admin',
      added_by: user.id,
      is_active: true,
    })
  }

  await logAudit(supabase, {
    action: 'listing_unlisted',
    entityType: 'listing',
    entityId: businessId,
    actorId: user.id,
    details: { listing_name: business.name, blacklisted: addToBlacklist ?? false },
  })

  revalidatePath('/admin')
  revalidatePath(`/business/${business.slug}`)
  return { success: true }
}

export async function restoreUnlistedBusiness(businessId: string) {
  const { supabase, user } = await verifyAdmin()

  const { data: business, error: fetchError } = await supabase
    .from('businesses')
    .select('id, slug, name, verification_status')
    .eq('id', businessId)
    .single()

  if (fetchError || !business) {
    return { error: 'Business not found' }
  }

  if (business.verification_status !== 'suspended') {
    return { error: 'Business is not currently unlisted (suspended)' }
  }

  const { error } = await supabase
    .from('businesses')
    .update({ verification_status: 'approved' })
    .eq('id', businessId)

  if (error) {
    return { error: 'Failed to restore business' }
  }

  // Refresh search index to re-add to results
  await supabase.rpc('refresh_search_index', { p_business_id: businessId })

  await logAudit(supabase, {
    action: 'listing_unlisted',
    entityType: 'listing',
    entityId: businessId,
    actorId: user.id,
    details: { listing_name: business.name, action: 'restored' },
  })

  revalidatePath('/admin')
  revalidatePath(`/business/${business.slug}`)
  return { success: true }
}

// ─── Verification Queue ─────────────────────────────────────────────

export async function getVerificationQueue(
  page: number = 1
): Promise<PaginatedResponse<{
  id: string
  name: string
  slug: string
  listing_source: string
  verification_status: string
  created_at: string
}>> {
  const { supabase } = await verifyAdmin()

  const offset = (page - 1) * ITEMS_PER_PAGE

  const { data, count, error } = await supabase
    .from('businesses')
    .select('id, name, slug, listing_source, verification_status, created_at', {
      count: 'exact',
    })
    .eq('verification_status', 'pending')
    .order('created_at', { ascending: true })
    .range(offset, offset + ITEMS_PER_PAGE - 1)

  if (error) {
    return { data: [], totalCount: 0, page, totalPages: 0 }
  }

  const totalCount = count ?? 0
  return {
    data: data ?? [],
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / ITEMS_PER_PAGE),
  }
}

// ─── Admin: Accounts ─────────────────────────────────────────────────

export interface AdminAccountItem {
  userId: string
  email: string
  plan: string | null
  subscriptionStatus: string | null
  currentPeriodEnd: string | null
  isActive: boolean
  isTrial: boolean
  businessCount: number
  cancelAtPeriodEnd: boolean
}

export async function getAdminAccounts(
  page: number = 1,
  search?: string
): Promise<PaginatedResponse<AdminAccountItem>> {
  const { supabase } = await verifyAdmin()

  const offset = (page - 1) * ITEMS_PER_PAGE

  // Query profiles (all users with 'business' role, or all if no search)
  let query = supabase
    .from('profiles')
    .select('id, email', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + ITEMS_PER_PAGE - 1)

  if (search) {
    query = query.ilike('email', `%${search}%`)
  }

  const { data: profiles, count, error } = await query

  if (error || !profiles) {
    return { data: [], totalCount: 0, page, totalPages: 0 }
  }

  // For each user, get entitlements and business count
  const accounts: AdminAccountItem[] = await Promise.all(
    profiles.map(async (profile: { id: string; email: string }) => {
      const entitlements = await getUserEntitlements(supabase, profile.id)

      return {
        userId: profile.id,
        email: profile.email,
        plan: entitlements.plan,
        subscriptionStatus: entitlements.subscriptionStatus,
        currentPeriodEnd: entitlements.currentPeriodEnd,
        isActive: entitlements.isActive,
        isTrial: entitlements.isTrial,
        businessCount: entitlements.currentListingCount,
        cancelAtPeriodEnd: entitlements.cancelAtPeriodEnd,
      }
    })
  )

  const totalCount = count ?? 0
  return {
    data: accounts,
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / ITEMS_PER_PAGE),
  }
}

// ─── Enhanced Listing Actions ──────────────────────────────────────────

export interface AdminListingFilters {
  page?: number
  status?: string
  search?: string
  suburb?: string
  postcode?: string
  state?: string
  categoryId?: string
  type?: string  // 'seed' | 'claimed' | 'user'
  verificationStatus?: string
  ownerSearch?: string
}

export interface EnhancedAdminListingItem {
  id: string
  name: string
  slug: string
  status: string
  type: string  // 'seed' | 'claimed' | 'user-created'
  ownerEmail: string | null
  ownerId: string | null
  ownerPlan: string | null
  billingStatus: string
  verificationStatus: string
  searchable: boolean
  reportCount: number
  createdAt: string
}

export async function getAdminListingsEnhanced(
  filters: AdminListingFilters = {}
): Promise<PaginatedResponse<EnhancedAdminListingItem>> {
  const { supabase } = await verifyAdmin()

  const page = filters.page ?? 1
  const offset = (page - 1) * ITEMS_PER_PAGE

  let query = supabase
    .from('businesses')
    .select(
      `
      id, name, slug, status, is_seed, claim_status, owner_id,
      billing_status, verification_status, created_at, deleted_at,
      profiles!businesses_owner_id_fkey (email),
      business_locations (suburb, state, postcode),
      business_categories (category_id, is_primary)
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + ITEMS_PER_PAGE - 1)

  // Status filter: 'deleted' → deleted_at IS NOT NULL, else exclude deleted
  if (filters.status === 'deleted') {
    query = query.not('deleted_at', 'is', null)
  } else {
    query = query.is('deleted_at', null)
    if (filters.status) {
      query = query.eq('status', filters.status as 'draft' | 'published' | 'suspended' | 'paused')
    }
  }

  if (filters.search) {
    query = query.ilike('name', `%${filters.search}%`)
  }

  if (filters.verificationStatus) {
    query = query.eq('verification_status', filters.verificationStatus as 'approved' | 'pending' | 'rejected' | 'suspended')
  }

  // Type filter
  if (filters.type === 'seed') {
    query = query.eq('is_seed', true).neq('claim_status', 'claimed')
  } else if (filters.type === 'claimed') {
    query = query.eq('claim_status', 'claimed')
  } else if (filters.type === 'user') {
    query = query.eq('is_seed', false).neq('claim_status', 'claimed')
  }

  if (filters.state) {
    // Filter by location state (join condition)
    query = query.not('business_locations', 'is', null)
  }

  const { data, count, error } = await query

  if (error) {
    console.error('Enhanced admin listings query error:', error)
    return { data: [], totalCount: 0, page, totalPages: 0 }
  }

  // Get report counts per business
  const bizIds = (data ?? []).map((b: any) => b.id)
  let reportCounts = new Map<string, number>()
  if (bizIds.length > 0) {
    const { data: reports } = await supabase
      .from('reports')
      .select('business_id')
      .in('business_id', bizIds)
      .eq('status', 'open')

    for (const r of reports ?? []) {
      const bizId = (r as any).business_id
      reportCounts.set(bizId, (reportCounts.get(bizId) ?? 0) + 1)
    }
  }

  const listings: EnhancedAdminListingItem[] = (data ?? []).map((row: any) => {
    const profile = row.profiles
    const isSeed = row.is_seed
    const isClaimed = row.claim_status === 'claimed'

    let type = 'user-created'
    if (isSeed && !isClaimed) type = 'seed'
    else if (isSeed && isClaimed) type = 'claimed'

    // Inline searchable check (approximate — avoids per-row RPC)
    const searchable =
      row.verification_status === 'approved' &&
      !['suspended', 'paused', 'deleted'].includes(row.status) &&
      row.deleted_at === null &&
      row.billing_status !== 'billing_suspended'

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.deleted_at ? 'deleted' : row.status,
      type,
      ownerEmail: profile?.email ?? null,
      ownerId: row.owner_id,
      ownerPlan: null, // Would need batch entitlements; skip for list view
      billingStatus: row.billing_status ?? 'billing_suspended',
      verificationStatus: row.verification_status,
      searchable,
      reportCount: reportCounts.get(row.id) ?? 0,
      createdAt: row.created_at,
    }
  })

  // Post-filter by state if needed (Supabase nested column filtering is limited)
  let filteredListings = listings
  if (filters.state && data) {
    const bizIdsInState = new Set(
      (data as any[])
        .filter((b: any) => {
          const locs = b.business_locations ?? []
          return locs.some((l: any) => l.state === filters.state)
        })
        .map((b: any) => b.id)
    )
    filteredListings = listings.filter(l => bizIdsInState.has(l.id))
  }

  const totalCount = count ?? 0
  return {
    data: filteredListings,
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / ITEMS_PER_PAGE),
  }
}

export interface AdminListingDetail {
  business: any
  owner: any | null
  location: any | null
  categories: any[]
  contacts: any | null
  reports: any[]
  claims: any[]
  photos: any[]
  testimonials: any[]
  entitlements: Entitlements | null
  eligibility: Array<{ check_name: string; passed: boolean; detail: string }>
  listingEligibility: ListingEligibility | null
  pendingChanges: Record<string, unknown> | null
}

export async function getAdminListingDetail(
  businessId: string
): Promise<AdminListingDetail | { error: string }> {
  const { supabase } = await verifyAdmin()

  const { data: business, error: bizError } = await supabase
    .from('businesses')
    .select(`
      *,
      profiles!businesses_owner_id_fkey (id, email, role, admin_notes, suspended_at, suspended_reason, created_at),
      business_locations (*),
      business_contacts (*),
      business_categories (
        category_id,
        is_primary,
        categories (id, name, slug)
      ),
      photos (*),
      testimonials (*)
    `)
    .eq('id', businessId)
    .single()

  if (bizError || !business) {
    return { error: 'Business not found' }
  }

  // Fetch reports for this business
  const { data: reports } = await supabase
    .from('reports')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })

  // Fetch claims for this business
  const { data: claims } = await supabase
    .from('business_claims')
    .select('*, profiles!business_claims_claimer_id_fkey (email)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })

  // Get owner entitlements
  let entitlements: Entitlements | null = null
  if (business.owner_id) {
    entitlements = await getUserEntitlements(supabase, business.owner_id)
  }

  // Get eligibility checks
  const { data: eligibility } = await supabase.rpc('explain_search_eligibility', {
    p_business_id: businessId,
  })

  // Get listing eligibility (canonical visibility check)
  const listingElig = await getListingEligibility(supabase, businessId)

  const profile = business.profiles
  const locations = business.business_locations
  const location = Array.isArray(locations) ? locations[0] : locations

  return {
    business,
    owner: profile ?? null,
    location: location ?? null,
    categories: business.business_categories ?? [],
    contacts: business.business_contacts
      ? Array.isArray(business.business_contacts)
        ? business.business_contacts[0]
        : business.business_contacts
      : null,
    reports: reports ?? [],
    claims: claims ?? [],
    photos: business.photos ?? [],
    testimonials: business.testimonials ?? [],
    entitlements,
    eligibility: (eligibility ?? []) as Array<{ check_name: string; passed: boolean; detail: string }>,
    listingEligibility: listingElig,
    pendingChanges: business.pending_changes ?? null,
  }
}

// ─── Soft Delete / Restore ────────────────────────────────────────────

export async function adminSoftDeleteListing(businessId: string, reason?: string) {
  const { supabase, user } = await verifyAdmin()

  const { data: business, error: fetchError } = await supabase
    .from('businesses')
    .select('id, slug, name, status, deleted_at, owner_id')
    .eq('id', businessId)
    .single()

  if (fetchError || !business) {
    return { error: 'Business not found' }
  }

  if (business.deleted_at) {
    return { error: 'Business is already deleted' }
  }

  const beforeState = { status: business.status, deleted_at: null }
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('businesses')
    .update({
      status: 'deleted',
      deleted_at: now,
      suspended_reason: reason || 'Soft-deleted by admin',
    })
    .eq('id', businessId)

  if (error) {
    return { error: 'Failed to delete business. Please try again.' }
  }

  await supabase.rpc('refresh_search_index', { p_business_id: businessId })

  // Notify owner
  if (business.owner_id) {
    await createNotification(supabase, {
      userId: business.owner_id,
      type: 'listing_suspended',
      title: 'Listing Removed',
      message: `Your listing "${business.name}" has been removed by an administrator.${reason ? ` Reason: ${reason}` : ''}`,
      metadata: { businessId, reason },
    })
  }

  await logAudit(supabase, {
    action: 'listing_deleted',
    entityType: 'listing',
    entityId: businessId,
    actorId: user.id,
    details: {
      listing_name: business.name,
      before_state: beforeState,
      after_state: { status: 'deleted', deleted_at: now },
      reason,
    },
  })

  revalidatePath('/admin')
  if (business.slug) revalidatePath(`/business/${business.slug}`)
  return { success: true }
}

export async function adminRestoreListing(businessId: string) {
  const { supabase, user } = await verifyAdmin()

  const { data: business, error: fetchError } = await supabase
    .from('businesses')
    .select('id, slug, name, status, deleted_at')
    .eq('id', businessId)
    .single()

  if (fetchError || !business) {
    return { error: 'Business not found' }
  }

  if (!business.deleted_at) {
    return { error: 'Business is not deleted' }
  }

  // Look up prior status from audit log before_state
  let restoreStatus = 'draft'
  const { data: auditEntries } = await supabase
    .from('audit_log')
    .select('details')
    .eq('entity_id', businessId)
    .eq('action', 'listing_deleted')
    .order('created_at', { ascending: false })
    .limit(1)

  if (auditEntries && auditEntries.length > 0) {
    const details = auditEntries[0].details as Record<string, any>
    const priorStatus = details?.before_state?.status
    if (priorStatus && priorStatus !== 'deleted') {
      restoreStatus = priorStatus
    }
  }

  const { error } = await supabase
    .from('businesses')
    .update({
      status: restoreStatus as 'draft' | 'published' | 'suspended' | 'paused',
      deleted_at: null,
      suspended_reason: null,
    })
    .eq('id', businessId)

  if (error) {
    return { error: 'Failed to restore business. Please try again.' }
  }

  await supabase.rpc('refresh_search_index', { p_business_id: businessId })

  await logAudit(supabase, {
    action: 'listing_restored',
    entityType: 'listing',
    entityId: businessId,
    actorId: user.id,
    details: {
      listing_name: business.name,
      before_state: { status: 'deleted', deleted_at: business.deleted_at },
      after_state: { status: restoreStatus, deleted_at: null },
    },
  })

  revalidatePath('/admin')
  if (business.slug) revalidatePath(`/business/${business.slug}`)
  return { success: true }
}

// ─── Pause Listing ─────────────────────────────────────────────────────

export async function adminPauseListing(businessId: string) {
  const { supabase, user } = await verifyAdmin()

  const { data: business, error: fetchError } = await supabase
    .from('businesses')
    .select('id, slug, name, status')
    .eq('id', businessId)
    .single()

  if (fetchError || !business) {
    return { error: 'Business not found' }
  }

  const beforeState = { status: business.status }

  const { error } = await supabase
    .from('businesses')
    .update({ status: 'paused' })
    .eq('id', businessId)

  if (error) {
    return { error: 'Failed to pause business. Please try again.' }
  }

  await supabase.rpc('refresh_search_index', { p_business_id: businessId })

  await logAudit(supabase, {
    action: 'listing_paused',
    entityType: 'listing',
    entityId: businessId,
    actorId: user.id,
    details: {
      listing_name: business.name,
      before_state: beforeState,
      after_state: { status: 'paused' },
    },
  })

  revalidatePath('/admin')
  if (business.slug) revalidatePath(`/business/${business.slug}`)
  return { success: true }
}

// ─── Transfer Ownership ────────────────────────────────────────────────

export async function adminTransferOwnership(businessId: string, newOwnerId: string) {
  const { supabase, user } = await verifyAdmin()

  const { data: business, error: fetchError } = await supabase
    .from('businesses')
    .select('id, slug, name, owner_id')
    .eq('id', businessId)
    .single()

  if (fetchError || !business) {
    return { error: 'Business not found' }
  }

  const oldOwnerId = business.owner_id

  // Verify new owner exists
  const { data: newOwner } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('id', newOwnerId)
    .single()

  if (!newOwner) {
    return { error: 'New owner not found' }
  }

  // Check capacity for new owner (hard cap)
  const newEntitlements = await getUserEntitlements(supabase, newOwnerId)
  if (!newEntitlements.canCreateMore) {
    return { error: `New owner has reached their listing limit (${newEntitlements.maxListings})` }
  }

  const { error } = await supabase
    .from('businesses')
    .update({ owner_id: newOwnerId })
    .eq('id', businessId)

  if (error) {
    return { error: 'Failed to transfer ownership. Please try again.' }
  }

  // S3: Explicit sync for both old and new owner
  await syncBusinessBillingStatus(supabase, newOwnerId)
  if (oldOwnerId) {
    await syncBusinessBillingStatus(supabase, oldOwnerId)
  }
  await supabase.rpc('refresh_search_index', { p_business_id: businessId })

  await logAudit(supabase, {
    action: 'listing_transferred',
    entityType: 'listing',
    entityId: businessId,
    actorId: user.id,
    details: {
      listing_name: business.name,
      before_state: { owner_id: oldOwnerId },
      after_state: { owner_id: newOwnerId },
      new_owner_email: newOwner.email,
    },
  })

  revalidatePath('/admin')
  return { success: true }
}

// ─── Force Re-verify ──────────────────────────────────────────────────

export async function adminForceReverify(businessId: string) {
  const { supabase, user } = await verifyAdmin()

  const { data: business, error: fetchError } = await supabase
    .from('businesses')
    .select('id, slug, name, verification_status')
    .eq('id', businessId)
    .single()

  if (fetchError || !business) {
    return { error: 'Business not found' }
  }

  const beforeState = { verification_status: business.verification_status }

  const { error } = await supabase
    .from('businesses')
    .update({ verification_status: 'pending' })
    .eq('id', businessId)

  if (error) {
    return { error: 'Failed to set verification status. Please try again.' }
  }

  await supabase.rpc('refresh_search_index', { p_business_id: businessId })

  await logAudit(supabase, {
    action: 'verification_completed',
    entityType: 'listing',
    entityId: businessId,
    actorId: user.id,
    details: {
      listing_name: business.name,
      before_state: beforeState,
      after_state: { verification_status: 'pending' },
      admin_action: 'force_reverify',
    },
  })

  revalidatePath('/admin')
  revalidatePath('/admin/verification')
  return { success: true }
}

// ─── Approve/Reject Pending Changes ──────────────────────────────────

export async function adminApprovePendingChanges(businessId: string, notes?: string) {
  const { supabase, user } = await verifyAdmin()
  const { removePhotoFromStorage } = await import('@/app/actions/photos')

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, slug, pending_changes, name, description, phone, email_contact, website, abn, owner_id')
    .eq('id', businessId)
    .single()

  if (!biz) {
    return { error: 'Business not found' }
  }

  if (!biz.pending_changes) {
    return { error: 'No pending changes to approve' }
  }

  const pending = biz.pending_changes as Record<string, unknown>
  const beforeState: Record<string, unknown> = {}
  const updateData: Record<string, unknown> = {
    verification_status: 'approved',
    status: 'published',
    pending_changes: null,
  }

  // Apply pending fields
  for (const key of ['name', 'description', 'phone', 'email_contact', 'website', 'abn']) {
    if (pending[key] !== undefined) {
      beforeState[key] = (biz as Record<string, unknown>)[key]
      updateData[key] = pending[key]
    }
  }

  await supabase.from('businesses').update(updateData).eq('id', businessId)

  // Sync contacts
  if (pending.phone !== undefined || pending.email_contact !== undefined || pending.website !== undefined) {
    await supabase
      .from('business_contacts')
      .upsert({
        business_id: businessId,
        phone: (pending.phone as string) ?? biz.phone ?? null,
        email: (pending.email_contact as string) ?? biz.email_contact ?? null,
        website: (pending.website as string) ?? biz.website ?? null,
      }, { onConflict: 'business_id' })
  }

  // Promote pending media
  await supabase
    .from('photos')
    .update({ status: 'live' })
    .eq('business_id', businessId)
    .eq('status', 'pending_add')

  await supabase
    .from('testimonials')
    .update({ status: 'live' })
    .eq('business_id', businessId)
    .eq('status', 'pending_add')

  // Delete pending_delete media
  const { data: photosToDelete } = await supabase
    .from('photos')
    .select('id, url')
    .eq('business_id', businessId)
    .eq('status', 'pending_delete')

  if (photosToDelete && photosToDelete.length > 0) {
    for (const photo of photosToDelete) {
      await removePhotoFromStorage(photo.url)
    }
    await supabase
      .from('photos')
      .delete()
      .eq('business_id', businessId)
      .eq('status', 'pending_delete')
  }

  await supabase
    .from('testimonials')
    .delete()
    .eq('business_id', businessId)
    .eq('status', 'pending_delete')

  await supabase.rpc('refresh_search_index', { p_business_id: businessId })

  // Notify owner
  if (biz.owner_id) {
    await createNotification(supabase, {
      userId: biz.owner_id,
      type: 'verification_approved',
      title: 'Changes Approved',
      message: `Your changes to "${biz.name}" have been approved and are now live.${notes ? ` Comment: ${notes}` : ''}`,
      metadata: { businessId, notes: notes || null },
    })
  }

  await logAudit(supabase, {
    action: 'listing_pending_approved',
    entityType: 'listing',
    entityId: businessId,
    actorId: user.id,
    details: {
      before_state: beforeState,
      after_state: Object.fromEntries(
        Object.entries(updateData).filter(([k]) => k !== 'verification_status' && k !== 'status' && k !== 'pending_changes')
      ),
      pending_changes: pending,
      admin_notes: notes || null,
    },
  })

  // ── P/W dual-write: approve W → create P snapshot ────────────────
  await pwService.dualWrite('adminApprovePendingChanges', () =>
    pwService.approveWorking(businessId, user.id, notes)
  )

  revalidatePath('/admin')
  if (biz.slug) revalidatePath(`/business/${biz.slug}`)
  return { success: true }
}

export async function adminRejectPendingChanges(businessId: string, reason?: string) {
  const { supabase, user } = await verifyAdmin()
  const { removePhotoFromStorage } = await import('@/app/actions/photos')

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, slug, pending_changes, name, owner_id')
    .eq('id', businessId)
    .single()

  if (!biz) {
    return { error: 'Business not found' }
  }

  if (!biz.pending_changes) {
    return { error: 'No pending changes to reject' }
  }

  const pending = biz.pending_changes as Record<string, unknown>

  // Clear pending changes, set verification rejected (keeps pending_changes content available from audit)
  await supabase
    .from('businesses')
    .update({
      pending_changes: null,
      verification_status: 'rejected',
    })
    .eq('id', businessId)

  // Revert pending media
  const { data: pendingAddPhotos } = await supabase
    .from('photos')
    .select('id, url')
    .eq('business_id', businessId)
    .eq('status', 'pending_add')

  if (pendingAddPhotos && pendingAddPhotos.length > 0) {
    for (const photo of pendingAddPhotos) {
      await removePhotoFromStorage(photo.url)
    }
    await supabase
      .from('photos')
      .delete()
      .eq('business_id', businessId)
      .eq('status', 'pending_add')
  }

  await supabase
    .from('testimonials')
    .delete()
    .eq('business_id', businessId)
    .eq('status', 'pending_add')

  // Revert pending_delete back to live
  await supabase
    .from('photos')
    .update({ status: 'live' })
    .eq('business_id', businessId)
    .eq('status', 'pending_delete')

  await supabase
    .from('testimonials')
    .update({ status: 'live' })
    .eq('business_id', businessId)
    .eq('status', 'pending_delete')

  // Notify owner
  if (biz.owner_id) {
    await createNotification(supabase, {
      userId: biz.owner_id,
      type: 'verification_rejected',
      title: 'Changes Rejected',
      message: `Your changes to "${biz.name}" have been rejected.${reason ? ` Reason: ${reason}` : ''}`,
      metadata: { businessId, reason },
    })
  }

  await logAudit(supabase, {
    action: 'listing_pending_rejected',
    entityType: 'listing',
    entityId: businessId,
    actorId: user.id,
    details: {
      listing_name: biz.name,
      pending_changes: pending,
      reason,
    },
  })

  // ── P/W dual-write: reject W ────────────────────────────────────
  await pwService.dualWrite('adminRejectPendingChanges', () =>
    pwService.rejectWorking(businessId, user.id, reason)
  )

  revalidatePath('/admin')
  return { success: true }
}

// ─── Report Revalidation ──────────────────────────────────────────────

export async function adminRevalidateReport(reportId: string) {
  const { supabase, user } = await verifyAdmin()
  const { runVerification } = await import('@/app/actions/verification')

  const { data: report, error: fetchError } = await supabase
    .from('reports')
    .select('id, status, business_id')
    .eq('id', reportId)
    .single()

  if (fetchError || !report) {
    return { error: 'Report not found' }
  }

  if (report.status === 'resolved') {
    return { error: 'Report is already resolved' }
  }

  // Run AI verification on the business
  await runVerification(report.business_id, 'report_revalidation')

  // Check the result
  const { data: latestJob } = await supabase
    .from('verification_jobs')
    .select('id, final_decision')
    .eq('business_id', report.business_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let outcome = 'reported_passed'

  if (latestJob?.final_decision === 'rejected' || latestJob?.final_decision === 'suspended') {
    outcome = 'reported_failed'

    // Suspend the listing
    await supabase
      .from('businesses')
      .update({
        status: 'suspended',
        suspended_reason: 'Failed report revalidation',
        suspended_at: new Date().toISOString(),
      })
      .eq('id', report.business_id)

    await supabase.rpc('refresh_search_index', { p_business_id: report.business_id })

    // Notify owner
    const { data: biz } = await supabase
      .from('businesses')
      .select('owner_id, name')
      .eq('id', report.business_id)
      .single()

    if (biz?.owner_id) {
      await createNotification(supabase, {
        userId: biz.owner_id,
        type: 'listing_suspended',
        title: 'Listing Suspended',
        message: `Your listing "${biz.name}" has been suspended after a report review.`,
        metadata: { businessId: report.business_id, reportId },
      })
    }
  }

  // Resolve the report
  await supabase
    .from('reports')
    .update({
      status: 'resolved',
      resolution_outcome: outcome,
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', reportId)

  await logAudit(supabase, {
    action: 'report_revalidated',
    entityType: 'report',
    entityId: reportId,
    actorId: user.id,
    details: {
      business_id: report.business_id,
      verification_decision: latestJob?.final_decision ?? null,
      resolution_outcome: outcome,
    },
  })

  revalidatePath('/admin')
  return { success: true, outcome }
}
