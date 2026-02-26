import { getPlanById, type PlanDefinition } from '@/lib/constants'
import { getSettingValue } from '@/app/actions/system-settings'
import type { PlanTier, SubscriptionStatus, BillingStatus } from '@/lib/types'

// ─── Types ──────────────────────────────────────────────────────────

export type EffectiveState = 'ok' | 'blocked' | 'limited'

export interface Entitlements {
  userId: string
  plan: PlanTier | null
  subscriptionStatus: SubscriptionStatus | null
  isActive: boolean
  isTrial: boolean
  maxListings: number
  currentListingCount: number
  canClaimMore: boolean
  canPublish: boolean
  canEdit: boolean
  canUploadPhotos: boolean
  canAddTestimonials: boolean
  maxPhotos: number
  maxTestimonials: number
  descriptionLimit: number
  trialEndsAt: string | null
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
  effectiveState: EffectiveState
  reasonCodes: string[]
}

type SupabaseClient = {
  from: (table: string) => any
}

// ─── Constants ──────────────────────────────────────────────────────

const DEFAULT_DESCRIPTION_LIMIT = 500
const PREMIUM_DESCRIPTION_LIMIT = 2000

// ─── THE ONLY AUTHORITY FOR SUBSCRIPTION STATE ──────────────────────

/**
 * getUserEntitlements is the SOLE source of truth for plan, status,
 * and capabilities. All code paths (admin UI, dashboard, server actions,
 * eligibility checks) MUST call this function. Never read billing_status
 * or user_subscriptions directly to make entitlement decisions.
 */
export async function getUserEntitlements(
  supabase: SupabaseClient,
  userId: string
): Promise<Entitlements> {
  // 1. Read user_subscriptions — THE canonical source
  const { data: sub } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'canceled')
    .limit(1)
    .maybeSingle()

  // 2. Count user's non-seed, non-deleted businesses
  const { count } = await supabase
    .from('businesses')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', userId)
    .eq('is_seed', false)
    .is('deleted_at', null)

  const currentListingCount = count ?? 0

  // 3. No active subscription
  if (!sub) {
    // Check for canceled sub that's still within period
    const { data: canceledSub } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'canceled')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (canceledSub?.current_period_end) {
      const periodEnd = new Date(canceledSub.current_period_end)
      if (periodEnd > new Date()) {
        // Still active until period end
        return buildEntitlements(canceledSub, currentListingCount, userId)
      }
    }

    return nullEntitlements(userId, currentListingCount)
  }

  // 4. Active subscription found
  return buildEntitlements(sub, currentListingCount, userId)
}

async function buildEntitlements(
  sub: Record<string, any>,
  currentListingCount: number,
  userId: string
): Promise<Entitlements> {
  const plan = sub.plan as PlanTier
  const status = sub.status as SubscriptionStatus
  const planDef = getPlanById(plan)

  const isActive = ['active', 'past_due'].includes(status) ||
    (status === 'canceled' && sub.current_period_end && new Date(sub.current_period_end) > new Date())
  const isTrial = plan === 'free_trial' && isActive

  // Check if trial has expired
  const trialExpired = plan === 'free_trial' && sub.trial_ends_at &&
    new Date(sub.trial_ends_at) <= new Date()

  const effectivelyActive = isActive && !trialExpired

  // Max listings
  let maxListings = 1
  if (plan === 'premium' || plan === 'premium_annual') {
    maxListings = await getSettingValue('max_premium_listings', 10)
  }

  // Reason codes
  const reasonCodes: string[] = []
  if (!effectivelyActive) {
    if (trialExpired) reasonCodes.push('trial_expired')
    else if (status === 'canceled') reasonCodes.push('subscription_canceled')
    else if (status === 'unpaid') reasonCodes.push('subscription_unpaid')
    else reasonCodes.push('no_active_subscription')
  }
  if (status === 'past_due') reasonCodes.push('payment_past_due')

  // Effective state
  let effectiveState: EffectiveState = 'ok'
  if (!effectivelyActive) effectiveState = 'blocked'
  else if (status === 'past_due') effectiveState = 'limited'

  return {
    userId,
    plan,
    subscriptionStatus: status,
    isActive: effectivelyActive,
    isTrial,
    maxListings,
    currentListingCount,
    canClaimMore: currentListingCount < maxListings,
    canPublish: effectivelyActive,
    canEdit: true, // drafts allowed without subscription
    canUploadPhotos: effectivelyActive && planDef.canUploadPhotos,
    canAddTestimonials: effectivelyActive && planDef.canAddTestimonials,
    maxPhotos: planDef.maxPhotos,
    maxTestimonials: planDef.maxTestimonials,
    descriptionLimit: getDescriptionLimitForPlan(planDef),
    trialEndsAt: sub.trial_ends_at ?? null,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    currentPeriodEnd: sub.current_period_end ?? null,
    effectiveState,
    reasonCodes,
  }
}

function nullEntitlements(userId: string, currentListingCount: number): Entitlements {
  return {
    userId,
    plan: null,
    subscriptionStatus: null,
    isActive: false,
    isTrial: false,
    maxListings: 1,
    currentListingCount,
    canClaimMore: currentListingCount < 1,
    canPublish: false,
    canEdit: true,
    canUploadPhotos: false,
    canAddTestimonials: false,
    maxPhotos: 0,
    maxTestimonials: 0,
    descriptionLimit: DEFAULT_DESCRIPTION_LIMIT,
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    effectiveState: 'blocked',
    reasonCodes: ['no_subscription'],
  }
}

function getDescriptionLimitForPlan(planDef: PlanDefinition): number {
  if (planDef.id === 'premium' || planDef.id === 'premium_annual') {
    return PREMIUM_DESCRIPTION_LIMIT
  }
  return DEFAULT_DESCRIPTION_LIMIT
}

// ─── Batch Entitlements ──────────────────────────────────────────────

/**
 * getBatchUserEntitlements fetches entitlements for multiple users in 2 queries
 * instead of N*3 queries (N users x 3 queries each).
 * Used by admin list pages to prevent N+1.
 */
export async function getBatchUserEntitlements(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, Entitlements>> {
  const result = new Map<string, Entitlements>()
  if (userIds.length === 0) return result

  // 1. Batch fetch all user_subscriptions for these users
  const { data: allSubs } = await supabase
    .from('user_subscriptions')
    .select('*')
    .in('user_id', userIds)

  // Build map: userId → subscription row(s)
  const subsByUser = new Map<string, Record<string, any>[]>()
  for (const sub of allSubs ?? []) {
    const list = subsByUser.get(sub.user_id) ?? []
    list.push(sub)
    subsByUser.set(sub.user_id, list)
  }

  // 2. Batch count businesses per owner
  // We need counts per user, so do a grouped query
  const { data: bizCounts } = await supabase
    .from('businesses')
    .select('owner_id', { count: 'exact', head: false })
    .in('owner_id', userIds)
    .eq('is_seed', false)

  // Count per owner from the returned rows
  const countByUser = new Map<string, number>()
  for (const row of bizCounts ?? []) {
    const ownerId = (row as Record<string, unknown>).owner_id as string
    countByUser.set(ownerId, (countByUser.get(ownerId) ?? 0) + 1)
  }

  // 3. Build entitlements for each user
  for (const userId of userIds) {
    const subs = subsByUser.get(userId) ?? []
    const currentListingCount = countByUser.get(userId) ?? 0

    // Find non-canceled sub
    const activeSub = subs.find(s => s.status !== 'canceled')

    if (activeSub) {
      result.set(userId, await buildEntitlements(activeSub, currentListingCount, userId))
    } else {
      // Check for canceled sub still within period
      const canceledSub = subs
        .filter(s => s.status === 'canceled')
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]

      if (canceledSub?.current_period_end && new Date(canceledSub.current_period_end) > new Date()) {
        result.set(userId, await buildEntitlements(canceledSub, currentListingCount, userId))
      } else {
        result.set(userId, nullEntitlements(userId, currentListingCount))
      }
    }
  }

  return result
}

// ─── SYNC HELPER — ONLY writer of billing_status ────────────────────

/**
 * syncBusinessBillingStatus is the ONLY writer of billing_status.
 * Called from: Stripe webhook, admin plan change, claim approval, trial expiration.
 * Reads getUserEntitlements() and writes derived billing_status to all user's businesses.
 */
export async function syncBusinessBillingStatus(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const entitlements = await getUserEntitlements(supabase, userId)

  // Derive billing_status
  let billingStatus: BillingStatus
  if (entitlements.isActive && entitlements.isTrial) {
    billingStatus = 'trial'
  } else if (entitlements.isActive) {
    billingStatus = 'active'
  } else {
    billingStatus = 'billing_suspended'
  }

  // Update ALL businesses owned by userId (non-seed only)
  await supabase
    .from('businesses')
    .update({ billing_status: billingStatus })
    .eq('owner_id', userId)
    .eq('is_seed', false)
}
