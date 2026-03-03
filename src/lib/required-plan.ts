import type { PlanTier } from '@/lib/types'

// ─── Types ──────────────────────────────────────────────────────────

type SupabaseClient = {
  from: (table: string) => any
}

export type CheckoutGateResult = {
  allowedPlans: PlanTier[]
  minimumPlan: 'basic' | 'premium'
  reasons: ('multiple_listings' | 'photos_or_testimonials')[]
  otherListingsCount: number
  photoCount: number
  testimonialCount: number
  returnTo: string
}

export type PlanGatingErrorCode = 'SUBSCRIPTION_REQUIRED' | 'UPGRADE_REQUIRED'

export type PlanGatingError = {
  code: PlanGatingErrorCode
  minimumPlan: 'basic' | 'premium'
  currentPlan: PlanTier | null
  allowedPlans: PlanTier[]
  reasons: ('multiple_listings' | 'photos_or_testimonials')[]
}

// ─── Core computation ───────────────────────────────────────────────

/**
 * Compute the checkout gate for a listing submission.
 *
 * Rules:
 *   - otherListingsCount >= 1 (total listings >= 2) → Premium/Annual only
 *   - photoCount > 0 OR testimonialCount > 0 → Premium/Annual only
 *   - Otherwise → all 3 plans
 *
 * This is the SOLE authority for plan gating computation.
 */
export async function computeCheckoutGate(
  supabase: SupabaseClient,
  userId: string,
  listingId: string
): Promise<CheckoutGateResult> {
  const [otherListingsRes, photoRes, testimonialRes] = await Promise.all([
    supabase
      .from('businesses')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', userId)
      .neq('id', listingId)
      .eq('is_seed', false)
      .is('deleted_at', null),
    supabase
      .from('photos')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', listingId)
      .neq('status', 'pending_delete'),
    supabase
      .from('testimonials')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', listingId)
      .neq('status', 'pending_delete'),
  ])

  const otherListingsCount = otherListingsRes.count ?? 0
  const photoCount = photoRes.count ?? 0
  const testimonialCount = testimonialRes.count ?? 0

  const needsPremium = photoCount > 0 || testimonialCount > 0
  const multiListing = otherListingsCount >= 1

  const reasons: ('multiple_listings' | 'photos_or_testimonials')[] = []
  if (multiListing) reasons.push('multiple_listings')
  if (needsPremium) reasons.push('photos_or_testimonials')

  const minimumPlan: 'basic' | 'premium' =
    multiListing || needsPremium ? 'premium' : 'basic'

  const allowedPlans: PlanTier[] =
    minimumPlan === 'premium'
      ? ['premium', 'premium_annual']
      : ['basic', 'premium', 'premium_annual']

  return {
    allowedPlans,
    minimumPlan,
    reasons,
    otherListingsCount,
    photoCount,
    testimonialCount,
    returnTo: `/dashboard/listing?bid=${listingId}&step=preview`,
  }
}

// ─── Plan sufficiency check ─────────────────────────────────────────

/**
 * Check if a user's current plan meets the gate requirements.
 * Returns null if sufficient, or a structured error if not.
 */
export function checkPlanSufficiency(
  currentPlan: PlanTier | null,
  gateResult: CheckoutGateResult
): PlanGatingError | null {
  if (!currentPlan) {
    return {
      code: 'SUBSCRIPTION_REQUIRED',
      minimumPlan: gateResult.minimumPlan,
      currentPlan: null,
      allowedPlans: gateResult.allowedPlans,
      reasons: gateResult.reasons,
    }
  }

  if (currentPlan === 'basic' && gateResult.minimumPlan === 'premium') {
    return {
      code: 'UPGRADE_REQUIRED',
      minimumPlan: gateResult.minimumPlan,
      currentPlan,
      allowedPlans: gateResult.allowedPlans,
      reasons: gateResult.reasons,
    }
  }

  return null
}
