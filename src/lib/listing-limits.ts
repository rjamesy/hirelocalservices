import { getSettingValue } from '@/app/actions/system-settings'
import type { PlanTier } from '@/lib/types'

type SupabaseClient = {
  from: (table: string) => any
}

export async function getUserListingCapacity(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  currentCount: number
  maxAllowed: number
  canClaimMore: boolean
  userPlan: PlanTier | null
}> {
  // 1. Count non-seed, non-deleted businesses owned by user
  const { count } = await supabase
    .from('businesses')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', userId)
    .eq('is_seed', false)
    .is('deleted_at', null)

  // 2. Get user's plan from user_subscriptions
  const { data: userSub } = await supabase
    .from('user_subscriptions')
    .select('plan, status')
    .eq('user_id', userId)
    .maybeSingle()

  const activePlan =
    userSub && ['active', 'past_due'].includes(userSub.status)
      ? (userSub.plan as PlanTier)
      : null

  // 3. Determine max allowed listings
  let maxAllowed = 1
  if (activePlan === 'premium' || activePlan === 'premium_annual') {
    maxAllowed = await getSettingValue('max_premium_listings', 10)
  }

  return {
    currentCount: count ?? 0,
    maxAllowed,
    canClaimMore: (count ?? 0) < maxAllowed,
    userPlan: activePlan,
  }
}
