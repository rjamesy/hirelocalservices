import { getUserEntitlements } from '@/lib/entitlements'

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
  rpc: (fn: string, args?: any) => any
}

// ─── Main Function ──────────────────────────────────────────────────

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
