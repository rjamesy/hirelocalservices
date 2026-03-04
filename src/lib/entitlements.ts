import { getPlanById } from '@/lib/constants'
import { getSettingValue } from '@/app/actions/system-settings'
import type { PlanTier, SubscriptionStatus, BillingStatus } from '@/lib/types'

// ─── Types ──────────────────────────────────────────────────────────

export type EffectiveState = 'ok' | 'blocked' | 'limited' | 'no_plan'

export interface Entitlements {
  userId: string
  plan: PlanTier | null
  subscriptionStatus: SubscriptionStatus | null
  isActive: boolean
  isTrial: boolean
  maxListings: number
  currentListingCount: number
  publishedListingCount: number
  /** @deprecated Use canCreateMore instead */
  canClaimMore: boolean
  /** Can create new drafts (total non-deleted < maxListings hard cap) */
  canCreateMore: boolean
  /** Can publish listings (published count < plan publish limit) */
  canPublishMore: boolean
  canPublish: boolean
  canEdit: boolean
  canUploadPhotos: boolean
  canAddTestimonials: boolean
  canViewMetrics: boolean
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

const DESCRIPTION_LIMITS: Record<PlanTier, number> = {
  basic: 500,
  premium: 1500,
  premium_annual: 2500,
}
const DEFAULT_DESCRIPTION_LIMIT = 250

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

  // 2. Count user's non-seed, non-deleted businesses (total = hard cap check)
  const [totalRes, publishedRes] = await Promise.all([
    supabase
      .from('businesses')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', userId)
      .eq('is_seed', false)
      .is('deleted_at', null),
    supabase
      .from('businesses')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', userId)
      .eq('is_seed', false)
      .is('deleted_at', null)
      .eq('status', 'published'),
  ])

  const currentListingCount = totalRes.count ?? 0
  const publishedListingCount = publishedRes.count ?? 0

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
        return buildEntitlements(canceledSub, currentListingCount, publishedListingCount, userId)
      }
    }

    return nullEntitlements(userId, currentListingCount, publishedListingCount)
  }

  // 4. Active subscription found
  return buildEntitlements(sub, currentListingCount, publishedListingCount, userId)
}

async function buildEntitlements(
  sub: Record<string, any>,
  currentListingCount: number,
  publishedListingCount: number,
  userId: string
): Promise<Entitlements> {
  const plan = sub.plan as PlanTier
  const status = sub.status as SubscriptionStatus
  const planDef = getPlanById(plan)

  const isActive = ['active', 'trialing', 'past_due'].includes(status) ||
    (status === 'canceled' && sub.current_period_end && new Date(sub.current_period_end) > new Date())
  const isTrial = status === 'trialing'

  const effectivelyActive = isActive

  // Max listings
  let maxListings = 1
  if (plan === 'premium' || plan === 'premium_annual') {
    maxListings = await getSettingValue('max_premium_listings', 10)
  }

  // Reason codes
  const reasonCodes: string[] = []
  if (!effectivelyActive) {
    if (status === 'canceled') reasonCodes.push('subscription_canceled')
    else if (status === 'unpaid') reasonCodes.push('subscription_unpaid')
    else reasonCodes.push('no_active_subscription')
  }
  if (status === 'past_due') reasonCodes.push('payment_past_due')

  // Effective state
  let effectiveState: EffectiveState = 'ok'
  if (!effectivelyActive) effectiveState = 'blocked'
  else if (status === 'past_due') effectiveState = 'limited'

  // Publish limit: Basic = 1 published, Premium/Annual = maxListings
  const publishLimit = (plan === 'basic') ? 1 : maxListings

  return {
    userId,
    plan,
    subscriptionStatus: status,
    isActive: effectivelyActive,
    isTrial,
    maxListings,
    currentListingCount,
    publishedListingCount,
    canClaimMore: currentListingCount < maxListings,
    canCreateMore: currentListingCount < maxListings,
    canPublishMore: publishedListingCount < publishLimit,
    canPublish: effectivelyActive && status !== 'past_due',
    canEdit: true, // drafts allowed without subscription
    canUploadPhotos: effectivelyActive && planDef.canUploadPhotos,
    canAddTestimonials: effectivelyActive && planDef.canAddTestimonials,
    canViewMetrics: effectivelyActive && (plan === 'premium' || plan === 'premium_annual'),
    maxPhotos: planDef.maxPhotos,
    maxTestimonials: planDef.maxTestimonials,
    descriptionLimit: DESCRIPTION_LIMITS[plan] ?? DEFAULT_DESCRIPTION_LIMIT,
    trialEndsAt: sub.trial_ends_at ?? null,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    currentPeriodEnd: sub.current_period_end ?? null,
    effectiveState,
    reasonCodes,
  }
}

function nullEntitlements(userId: string, currentListingCount: number, publishedListingCount: number): Entitlements {
  return {
    userId,
    plan: null,
    subscriptionStatus: null,
    isActive: false,
    isTrial: false,
    maxListings: 1,
    currentListingCount,
    publishedListingCount,
    canClaimMore: currentListingCount < 1,
    canCreateMore: currentListingCount < 1,
    canPublishMore: publishedListingCount < 1,
    canPublish: false,
    canEdit: true,
    canUploadPhotos: false,
    canAddTestimonials: false,
    canViewMetrics: false,
    maxPhotos: 0,
    maxTestimonials: 0,
    descriptionLimit: 250,
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    effectiveState: 'no_plan',
    reasonCodes: ['no_subscription'],
  }
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

  // 2. Batch count businesses per owner (total + published)
  // We need counts per user, so do a grouped query
  const { data: bizCounts } = await supabase
    .from('businesses')
    .select('owner_id, status', { count: 'exact', head: false })
    .in('owner_id', userIds)
    .eq('is_seed', false)
    .is('deleted_at', null)

  // Count per owner from the returned rows
  const countByUser = new Map<string, number>()
  const publishedCountByUser = new Map<string, number>()
  for (const row of bizCounts ?? []) {
    const r = row as Record<string, unknown>
    const ownerId = r.owner_id as string
    countByUser.set(ownerId, (countByUser.get(ownerId) ?? 0) + 1)
    if (r.status === 'published') {
      publishedCountByUser.set(ownerId, (publishedCountByUser.get(ownerId) ?? 0) + 1)
    }
  }

  // 3. Build entitlements for each user
  for (const userId of userIds) {
    const subs = subsByUser.get(userId) ?? []
    const currentListingCount = countByUser.get(userId) ?? 0
    const publishedListingCount = publishedCountByUser.get(userId) ?? 0

    // Find non-canceled sub
    const activeSub = subs.find(s => s.status !== 'canceled')

    if (activeSub) {
      result.set(userId, await buildEntitlements(activeSub, currentListingCount, publishedListingCount, userId))
    } else {
      // Check for canceled sub still within period
      const canceledSub = subs
        .filter(s => s.status === 'canceled')
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]

      if (canceledSub?.current_period_end && new Date(canceledSub.current_period_end) > new Date()) {
        result.set(userId, await buildEntitlements(canceledSub, currentListingCount, publishedListingCount, userId))
      } else {
        result.set(userId, nullEntitlements(userId, currentListingCount, publishedListingCount))
      }
    }
  }

  return result
}

// ─── SYNC HELPER — ONLY writer of billing_status ────────────────────

/**
 * syncBusinessBillingStatus derives billing_status from getUserEntitlements()
 * and writes it to all user's businesses.
 * Called from: admin plan change, claim approval, trial expiration.
 * Note: Stripe webhook has its own direct writer for real-time status updates.
 */
export async function syncBusinessBillingStatus(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const entitlements = await getUserEntitlements(supabase, userId)

  // Derive billing_status
  // Note: past_due is isActive=true so it stays 'active' here.
  // The webhook handler writes paused_payment_failed directly on final failure.
  let billingStatus: BillingStatus
  if (entitlements.isTrial) {
    billingStatus = 'trial'
  } else if (entitlements.isActive) {
    billingStatus = 'active'
  } else if (entitlements.subscriptionStatus === 'canceled') {
    billingStatus = 'paused_subscription_expired'
  } else if (entitlements.subscriptionStatus === 'unpaid') {
    billingStatus = 'paused_payment_failed'
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
