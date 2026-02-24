import type { PlanTier } from '@/lib/types'

export const BUSINESS_NAME_MAX = 80

export const DESCRIPTION_LIMITS: Record<PlanTier, number> = {
  free_trial: 250,
  basic: 500,
  premium: 1500,
  premium_annual: 2500,
}

export function getDescriptionLimit(plan: PlanTier | null): number {
  return plan ? DESCRIPTION_LIMITS[plan] : 250
}
