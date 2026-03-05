'use server'

import { createClient } from '@/lib/supabase/server'
import { ITEMS_PER_PAGE } from '@/lib/constants'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit'
import {
  getUserEntitlements,
  getBatchUserEntitlements,
  syncBusinessBillingStatus,
  type Entitlements,
} from '@/lib/entitlements'
import type { PlanTier, SubscriptionStatus } from '@/lib/types'
import log from '@/lib/logger'

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

export interface AdminAccountItem {
  userId: string
  email: string
  createdAt: string
  plan: string | null
  subscriptionStatus: string | null
  isActive: boolean
  isTrial: boolean
  businessCount: number
  activeListingCount: number
  cancelAtPeriodEnd: boolean
  billingStatus: string
  currentPeriodEnd: string | null
}

export interface AdminAccountDetail {
  userId: string
  email: string
  createdAt: string
  role: string
  adminNotes: string | null
  suspendedAt: string | null
  suspendedReason: string | null
  subscription: {
    plan: string | null
    status: string | null
    stripeCustomerId: string | null
    stripeSubscriptionId: string | null
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
    trialEndsAt: string | null
  } | null
  entitlements: Entitlements
  ownedListings: Array<{
    id: string
    name: string
    slug: string
    status: string
    isSearchEligible: boolean
    billingStatus: string
    categoryName: string | null
    suburb: string | null
    state: string | null
  }>
  claims: Array<{
    id: string
    businessName: string | null
    status: string
    createdAt: string
  }>
}

export interface PaginatedResponse<T> {
  data: T[]
  totalCount: number
  page: number
  totalPages: number
}

// ─── Server Actions ─────────────────────────────────────────────────

/**
 * getAdminAccounts — paginated account list with search.
 * Search by email (ILIKE), user_id (exact UUID match), or business name (subquery).
 */
export async function getAdminAccounts(
  page: number = 1,
  search?: string
): Promise<PaginatedResponse<AdminAccountItem>> {
  const { supabase } = await verifyAdmin()

  const offset = (page - 1) * ITEMS_PER_PAGE
  const isUuid = search && /^[0-9a-f]{8}-/.test(search)

  let query = supabase
    .from('profiles')
    .select('id, email, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + ITEMS_PER_PAGE - 1)

  if (search) {
    if (isUuid) {
      // Exact user_id match
      query = query.eq('id', search)
    } else {
      // Try email ILIKE first; also search by business name via subquery
      // We use an `or` filter: email matches OR id is in the set of owners whose business name matches
      query = query.or(
        `email.ilike.%${search}%,id.in.(select owner_id from businesses where name ilike '%${search}%')`
      )
    }
  }

  const { data: profiles, count, error } = await query

  if (error || !profiles) {
    log.error({ error }, 'Admin accounts query error')
    return { data: [], totalCount: 0, page, totalPages: 0 }
  }

  const userIds = profiles.map((p: any) => p.id as string)

  // Batch fetch entitlements for all users on this page
  const entitlementsMap = await getBatchUserEntitlements(supabase, userIds)

  // Batch count active (non-seed, published) listings per user
  const { data: activeListings } = await supabase
    .from('businesses')
    .select('owner_id')
    .in('owner_id', userIds)
    .eq('is_seed', false)
    .eq('status', 'published')

  const activeCountByUser = new Map<string, number>()
  for (const row of activeListings ?? []) {
    const ownerId = (row as Record<string, unknown>).owner_id as string
    activeCountByUser.set(ownerId, (activeCountByUser.get(ownerId) ?? 0) + 1)
  }

  const accounts: AdminAccountItem[] = profiles.map((profile: any) => {
    const ent = entitlementsMap.get(profile.id)

    // Derive billingStatus label
    let billingStatus = 'none'
    if (ent) {
      if (ent.isTrial) billingStatus = 'trial'
      else if (ent.isActive) billingStatus = 'active'
      else if (ent.subscriptionStatus === 'past_due') billingStatus = 'past_due'
      else if (ent.subscriptionStatus === 'canceled') billingStatus = 'canceled'
      else if (ent.subscriptionStatus) billingStatus = ent.subscriptionStatus
    }

    return {
      userId: profile.id,
      email: profile.email,
      createdAt: profile.created_at,
      plan: ent?.plan ?? null,
      subscriptionStatus: ent?.subscriptionStatus ?? null,
      isActive: ent?.isActive ?? false,
      isTrial: ent?.isTrial ?? false,
      businessCount: ent?.currentListingCount ?? 0,
      activeListingCount: activeCountByUser.get(profile.id) ?? 0,
      cancelAtPeriodEnd: ent?.cancelAtPeriodEnd ?? false,
      billingStatus,
      currentPeriodEnd: ent?.currentPeriodEnd ?? null,
    }
  })

  const totalCount = count ?? 0
  return {
    data: accounts,
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / ITEMS_PER_PAGE),
  }
}

/**
 * getAdminAccountDetail — full account detail for a single user.
 */
export async function getAdminAccountDetail(
  userId: string
): Promise<AdminAccountDetail | { error: string }> {
  const { supabase } = await verifyAdmin()

  // 1. Fetch profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, created_at, role, admin_notes, suspended_at, suspended_reason')
    .eq('id', userId)
    .single()

  if (profileError || !profile) {
    return { error: 'User not found' }
  }

  // 2. Fetch subscription (prefer non-canceled)
  const { data: subs } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  let sub = (subs ?? []).find((s: any) => s.status !== 'canceled') ?? (subs ?? [])[0] ?? null

  // 3. Get entitlements
  const entitlements = await getUserEntitlements(supabase, userId)

  // 4. Fetch owned businesses with location and category info
  const { data: businesses } = await supabase
    .from('businesses')
    .select(`
      id,
      name,
      slug,
      status,
      billing_status,
      is_seed,
      business_locations (suburb, state),
      business_categories (
        is_primary,
        categories (name)
      )
    `)
    .eq('owner_id', userId)
    .eq('is_seed', false)
    .order('created_at', { ascending: false })

  // Check search eligibility for each listing
  const ownedListings = await Promise.all(
    (businesses ?? []).map(async (biz: any) => {
      const { data: eligible } = await supabase.rpc('is_search_eligible', {
        p_business_id: biz.id,
      })

      const location = biz.business_locations?.[0]
      const categoryRow = biz.business_categories?.[0]?.categories

      return {
        id: biz.id,
        name: biz.name,
        slug: biz.slug,
        status: biz.status,
        isSearchEligible: eligible ?? false,
        billingStatus: biz.billing_status ?? 'billing_suspended',
        categoryName: categoryRow?.name ?? null,
        suburb: location?.suburb ?? null,
        state: location?.state ?? null,
      }
    })
  )

  // 5. Fetch claims by this user
  const { data: claims } = await supabase
    .from('business_claims')
    .select('id, claimed_business_name, status, created_at')
    .eq('claimer_id', userId)
    .order('created_at', { ascending: false })

  return {
    userId: profile.id,
    email: profile.email,
    createdAt: profile.created_at,
    role: profile.role,
    adminNotes: profile.admin_notes,
    suspendedAt: profile.suspended_at,
    suspendedReason: profile.suspended_reason,
    subscription: sub
      ? {
          plan: sub.plan,
          status: sub.status,
          stripeCustomerId: sub.stripe_customer_id,
          stripeSubscriptionId: sub.stripe_subscription_id,
          currentPeriodEnd: sub.current_period_end,
          cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
          trialEndsAt: sub.trial_ends_at,
        }
      : null,
    entitlements,
    ownedListings,
    claims: (claims ?? []).map((c: any) => ({
      id: c.id,
      businessName: c.claimed_business_name,
      status: c.status,
      createdAt: c.created_at,
    })),
  }
}

/**
 * adminChangePlan — change a user's plan and subscription status.
 */
export async function adminChangePlan(
  userId: string,
  newPlan: PlanTier,
  newStatus: SubscriptionStatus
) {
  const { supabase, user } = await verifyAdmin()

  // Fetch before_state
  const { data: beforeSub } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'canceled')
    .limit(1)
    .maybeSingle()

  const beforeState = beforeSub
    ? { plan: beforeSub.plan, status: beforeSub.status }
    : { plan: null, status: null }

  if (beforeSub) {
    // Update existing subscription
    const { error } = await supabase
      .from('user_subscriptions')
      .update({ plan: newPlan, status: newStatus })
      .eq('id', beforeSub.id)

    if (error) {
      return { error: 'Failed to update subscription. Please try again.' }
    }
  } else {
    // No active subscription — check for any existing row
    const { data: anySub } = await supabase
      .from('user_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    if (anySub) {
      const { error } = await supabase
        .from('user_subscriptions')
        .update({ plan: newPlan, status: newStatus })
        .eq('id', anySub.id)

      if (error) {
        return { error: 'Failed to update subscription. Please try again.' }
      }
    } else {
      // Insert new subscription row
      const { error } = await supabase
        .from('user_subscriptions')
        .insert({ user_id: userId, plan: newPlan, status: newStatus })

      if (error) {
        return { error: 'Failed to create subscription. Please try again.' }
      }
    }
  }

  // Sync billing status on all user's businesses
  await syncBusinessBillingStatus(supabase, userId)

  await logAudit(supabase, {
    action: 'account_plan_changed',
    entityType: 'account',
    entityId: userId,
    actorId: user.id,
    details: {
      before_state: beforeState,
      after_state: { plan: newPlan, status: newStatus },
    },
  })

  revalidatePath('/admin')
  return { success: true }
}

/**
 * adminSetTrialEnd — set or update trial_ends_at for a user's subscription.
 */
export async function adminSetTrialEnd(userId: string, trialEndsAt: string) {
  const { supabase, user } = await verifyAdmin()

  // Fetch before_state
  const { data: beforeSub } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'canceled')
    .limit(1)
    .maybeSingle()

  if (!beforeSub) {
    return { error: 'No active subscription found for this user.' }
  }

  const beforeState = { trial_ends_at: beforeSub.trial_ends_at }

  const { error } = await supabase
    .from('user_subscriptions')
    .update({ trial_ends_at: trialEndsAt })
    .eq('id', beforeSub.id)

  if (error) {
    return { error: 'Failed to update trial end date. Please try again.' }
  }

  // Sync billing status on all user's businesses
  await syncBusinessBillingStatus(supabase, userId)

  await logAudit(supabase, {
    action: 'account_plan_changed',
    entityType: 'account',
    entityId: userId,
    actorId: user.id,
    details: {
      before_state: beforeState,
      after_state: { trial_ends_at: trialEndsAt },
    },
  })

  revalidatePath('/admin')
  return { success: true }
}

/**
 * internalSuspendAccount — full account suspension (no admin auth check).
 * Called by adminSuspendAccount (admin context) and publishChanges (blacklist match).
 * Performs: profile suspend + Stripe cancel + listing suspension + email blacklist.
 */
export async function internalSuspendAccount(
  supabase: { from: (table: string) => any; rpc: (...args: any[]) => any },
  userId: string,
  reason: string,
  actorId: string
): Promise<{ success?: boolean; error?: string }> {
  const now = new Date().toISOString()

  // 1. Suspend profile
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ suspended_at: now, suspended_reason: reason })
    .eq('id', userId)

  if (profileError) {
    return { error: 'Failed to suspend account.' }
  }

  // 2. Cancel Stripe subscription
  const { data: sub } = await supabase
    .from('user_subscriptions')
    .select('stripe_subscription_id')
    .eq('user_id', userId)
    .neq('status', 'canceled')
    .limit(1)
    .maybeSingle()

  if (sub?.stripe_subscription_id) {
    try {
      const { stripe } = await import('@/lib/stripe')
      await stripe.subscriptions.cancel(sub.stripe_subscription_id)
    } catch (e) {
      log.error({ error: e }, 'Failed to cancel Stripe subscription during suspension')
    }
  }

  // 3. Suspend all published listings
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, status')
    .eq('owner_id', userId)
    .eq('is_seed', false)
    .eq('status', 'published')

  for (const biz of businesses ?? []) {
    await supabase
      .from('businesses')
      .update({ status: 'suspended', suspended_at: now, suspended_reason: reason })
      .eq('id', biz.id)

    await supabase.rpc('refresh_search_index', { p_business_id: biz.id })
  }

  // 4. Blacklist user's email
  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .single()

  if (profile?.email) {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminDb = createAdminClient()
    await adminDb.from('blacklist').insert({
      term: profile.email.toLowerCase(),
      match_type: 'exact',
      field_type: 'email',
      reason,
      added_by: actorId,
      is_active: true,
    })
  }

  // 5. Audit log
  await logAudit(supabase as any, {
    action: 'account_suspended',
    entityType: 'account',
    entityId: userId,
    actorId,
    details: {
      reason,
      stripe_cancelled: !!sub?.stripe_subscription_id,
      listings_suspended: (businesses ?? []).length,
      email_blacklisted: !!profile?.email,
    },
  })

  revalidatePath('/admin')
  return { success: true }
}

/**
 * adminSuspendAccount — full account lockdown (admin only).
 * Suspends profile, cancels Stripe, suspends listings, blacklists email.
 */
export async function adminSuspendAccount(userId: string, reason: string) {
  const { supabase, user } = await verifyAdmin()
  return internalSuspendAccount(supabase, userId, reason, user.id)
}

/**
 * adminUnsuspendAccount — clear suspension from a user account.
 */
export async function adminUnsuspendAccount(userId: string) {
  const { supabase, user } = await verifyAdmin()

  // Fetch before_state
  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('id, suspended_at, suspended_reason')
    .eq('id', userId)
    .single()

  if (fetchError || !profile) {
    return { error: 'User not found' }
  }

  const beforeState = {
    suspended_at: profile.suspended_at,
    suspended_reason: profile.suspended_reason,
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      suspended_at: null,
      suspended_reason: null,
    })
    .eq('id', userId)

  if (error) {
    return { error: 'Failed to unsuspend account. Please try again.' }
  }

  await logAudit(supabase, {
    action: 'account_unsuspended',
    entityType: 'account',
    entityId: userId,
    actorId: user.id,
    details: {
      before_state: beforeState,
      after_state: { suspended_at: null, suspended_reason: null },
    },
  })

  revalidatePath('/admin')
  return { success: true }
}

/**
 * adminSuspendAccountListings — suspend all published listings for a user.
 */
export async function adminSuspendAccountListings(userId: string) {
  const { supabase, user } = await verifyAdmin()

  // Fetch all published businesses for this user
  const { data: businesses, error: fetchError } = await supabase
    .from('businesses')
    .select('id, name, slug, status')
    .eq('owner_id', userId)
    .eq('status', 'published')
    .eq('is_seed', false)

  if (fetchError) {
    return { error: 'Failed to fetch user listings.' }
  }

  if (!businesses || businesses.length === 0) {
    return { error: 'No published listings found for this user.' }
  }

  for (const biz of businesses) {
    const { error } = await supabase
      .from('businesses')
      .update({
        status: 'suspended',
        suspended_at: new Date().toISOString(),
        suspended_reason: 'Account-level suspension by admin',
      })
      .eq('id', biz.id)

    if (error) {
      log.error({ error, businessId: biz.id }, 'Failed to suspend business')
      continue
    }

    // Refresh search index to remove from results
    await supabase.rpc('refresh_search_index', { p_business_id: biz.id })

    await logAudit(supabase, {
      action: 'listing_suspended',
      entityType: 'listing',
      entityId: biz.id,
      actorId: user.id,
      details: {
        listing_name: biz.name,
        previous_status: biz.status,
        new_status: 'suspended',
        reason: 'Account-level suspension by admin',
      },
    })
  }

  revalidatePath('/admin')
  return { success: true }
}

/**
 * adminSoftDeleteAccount — suspend profile and soft-delete all businesses.
 */
export async function adminSoftDeleteAccount(userId: string, reason: string) {
  const { supabase, user } = await verifyAdmin()

  // Suspend profile
  const now = new Date().toISOString()
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      suspended_at: now,
      suspended_reason: reason,
    })
    .eq('id', userId)

  if (profileError) {
    return { error: 'Failed to suspend account. Please try again.' }
  }

  // Soft-delete ALL non-seed businesses for this user
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, slug, status')
    .eq('owner_id', userId)
    .eq('is_seed', false)

  for (const biz of businesses ?? []) {
    const { error } = await supabase
      .from('businesses')
      .update({
        status: 'deleted',
        deleted_at: now,
      })
      .eq('id', biz.id)

    if (error) {
      log.error({ error, businessId: biz.id }, 'Failed to delete business')
      continue
    }

    // Refresh search index to remove from results
    await supabase.rpc('refresh_search_index', { p_business_id: biz.id })
  }

  await logAudit(supabase, {
    action: 'account_deleted',
    entityType: 'account',
    entityId: userId,
    actorId: user.id,
    details: {
      reason,
      businesses_deleted: (businesses ?? []).map((b: any) => ({
        id: b.id,
        name: b.name,
        previous_status: b.status,
      })),
    },
  })

  revalidatePath('/admin')
  return { success: true }
}

/**
 * adminUpdateAccountNotes — update admin_notes on a user profile.
 */
export async function adminUpdateAccountNotes(userId: string, notes: string) {
  const { supabase, user } = await verifyAdmin()

  // Fetch before_state
  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('id, admin_notes')
    .eq('id', userId)
    .single()

  if (fetchError || !profile) {
    return { error: 'User not found' }
  }

  const beforeState = { admin_notes: profile.admin_notes }

  const { error } = await supabase
    .from('profiles')
    .update({ admin_notes: notes })
    .eq('id', userId)

  if (error) {
    return { error: 'Failed to update account notes. Please try again.' }
  }

  await logAudit(supabase, {
    action: 'account_notes_updated',
    entityType: 'account',
    entityId: userId,
    actorId: user.id,
    details: {
      before_state: beforeState,
      after_state: { admin_notes: notes },
    },
  })

  revalidatePath('/admin')
  return { success: true }
}
