import { getUserEntitlements } from '@/lib/entitlements'
import { getCurrentPublishedTyped } from '@/lib/pw-service'

// ─── Types ──────────────────────────────────────────────────────────

export interface EligibilityCheck {
  checkName: string
  passed: boolean
  detail: string
}

export interface EligibilityResult {
  eligible: boolean
  checks: EligibilityCheck[]
  failedChecks: EligibilityCheck[]
}

type SupabaseClient = {
  from: (table: string) => any
  rpc: (...args: any[]) => any
}

// ─── Listing Eligibility ────────────────────────────────────────────

export interface ListingEligibility {
  visiblePublic: boolean
  visibleInSearch: boolean
  blockedReasons: string[]
  checks: {
    statusOk: boolean
    verificationOk: boolean
    billingOk: boolean
    notDeleted: boolean
    notSuspended: boolean
    ownerPlan: string | null
    ownerActive: boolean
  }
}

/**
 * Canonical listing visibility check.
 * Determines whether a business should be visible to public visitors
 * and whether it should appear in search results.
 *
 * billing_status is typed as 'active' | 'trial' | 'billing_suspended' —
 * both 'active' and 'trial' pass the billingOk check.
 */
export async function getListingEligibility(
  supabase: SupabaseClient,
  businessId: string
): Promise<ListingEligibility> {
  const [{ data: biz, error }, p] = await Promise.all([
    supabase
      .from('businesses')
      .select('billing_status, deleted_at, owner_id, is_seed')
      .eq('id', businessId)
      .single(),
    getCurrentPublishedTyped(businessId),
  ])

  if (error || !biz) {
    return {
      visiblePublic: false,
      visibleInSearch: false,
      blockedReasons: ['business_not_found'],
      checks: {
        statusOk: false,
        verificationOk: false,
        billingOk: false,
        notDeleted: false,
        notSuspended: false,
        ownerPlan: null,
        ownerActive: false,
      },
    }
  }

  const statusOk = p?.visibility_status === 'live'
  const verificationOk = !!p
  const billingOk = ['active', 'trial', 'seed'].includes(biz.billing_status)
  const notDeleted = biz.deleted_at === null
  const notSuspended = p?.visibility_status !== 'suspended'

  // Owner subscription check (seed businesses are always considered active)
  let ownerPlan: string | null = null
  let ownerActive = true

  if (!biz.is_seed && biz.owner_id) {
    const entitlements = await getUserEntitlements(supabase, biz.owner_id)
    ownerPlan = entitlements.plan
    ownerActive = entitlements.isActive
  }

  const visiblePublic = statusOk && verificationOk && billingOk && notDeleted && notSuspended
  const visibleInSearch = visiblePublic && ownerActive

  const blockedReasons: string[] = []
  if (!verificationOk) {
    blockedReasons.push('no published listing exists (not verified)')
  } else {
    if (!statusOk) blockedReasons.push(`visibility_status is '${p!.visibility_status}', expected 'live'`)
    if (!notSuspended) blockedReasons.push(`visibility_status is '${p!.visibility_status}' (suspended)`)
  }
  if (!billingOk) blockedReasons.push(`billing_status is '${biz.billing_status}'`)
  if (!notDeleted) blockedReasons.push('business is deleted')
  if (!ownerActive) blockedReasons.push(`owner subscription inactive (plan: ${ownerPlan ?? 'none'})`)

  return {
    visiblePublic,
    visibleInSearch,
    blockedReasons,
    checks: {
      statusOk,
      verificationOk,
      billingOk,
      notDeleted,
      notSuspended,
      ownerPlan,
      ownerActive,
    },
  }
}

// ─── Search Eligibility (RPC-based) ─────────────────────────────────

/**
 * Evaluates full search eligibility for a business.
 * 1. Calls explain_search_eligibility RPC for SQL-level checks
 * 2. For non-seed businesses with owner_id, also checks getUserEntitlements()
 */
export async function evaluateSearchEligibility(
  supabase: SupabaseClient,
  businessId: string
): Promise<EligibilityResult> {
  // 1. Get SQL-level checks from RPC
  const { data: rpcChecks, error: rpcError } = await supabase.rpc(
    'explain_search_eligibility',
    { p_business_id: businessId }
  )

  if (rpcError || !rpcChecks) {
    return {
      eligible: false,
      checks: [{
        checkName: 'rpc_error',
        passed: false,
        detail: rpcError?.message ?? 'Failed to evaluate eligibility',
      }],
      failedChecks: [{
        checkName: 'rpc_error',
        passed: false,
        detail: rpcError?.message ?? 'Failed to evaluate eligibility',
      }],
    }
  }

  const checks: EligibilityCheck[] = (rpcChecks as any[]).map((row) => ({
    checkName: row.check_name,
    passed: row.passed,
    detail: row.detail,
  }))

  // 2. For non-seed businesses with owner_id, also check entitlements
  const { data: biz } = await supabase
    .from('businesses')
    .select('owner_id, is_seed')
    .eq('id', businessId)
    .maybeSingle()

  if (biz && !biz.is_seed && biz.owner_id) {
    const entitlements = await getUserEntitlements(supabase, biz.owner_id)
    checks.push({
      checkName: 'owner_subscription_active',
      passed: entitlements.isActive,
      detail: entitlements.isActive
        ? `Owner has active ${entitlements.plan} subscription`
        : `Owner subscription inactive: ${entitlements.reasonCodes.join(', ') || 'no subscription'}`,
    })
  }

  const failedChecks = checks.filter((c) => !c.passed)

  return {
    eligible: failedChecks.length === 0,
    checks,
    failedChecks,
  }
}
