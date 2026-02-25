'use server'

import { createClient } from '@/lib/supabase/server'
import { ITEMS_PER_PAGE } from '@/lib/constants'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit'
import { getUserEntitlements, type Entitlements } from '@/lib/entitlements'

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
    .select('id, slug, name, status')
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
      previous_status: business.status,
      new_status: 'suspended',
    },
  })

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

  revalidatePath('/admin')
  revalidatePath(`/business/${business.slug}`)
  return { success: true }
}

export async function adminResolveReport(reportId: string) {
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
    .update({ status: 'resolved' })
    .eq('id', reportId)

  if (error) {
    return { error: 'Failed to resolve report. Please try again.' }
  }

  await logAudit(supabase, {
    action: 'report_resolved',
    entityType: 'report',
    entityId: reportId,
    actorId: user.id,
    details: { business_id: report.business_id },
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
