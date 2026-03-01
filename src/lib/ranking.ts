/**
 * ranking.ts
 *
 * Pure functions for fair search ranking.
 * Deterministic, rotation-based ranking that prevents placement complaints.
 *
 * rank_score = tier_weight + quality_score + proximity_bonus - exposure_penalty
 */

import type { PlanTier } from './types'

// ─── Tier Weights ───────────────────────────────────────────────────

const TIER_WEIGHTS: Record<string, number> = {
  premium_annual: 40,
  premium: 30,
  basic: 10,
}

export function getTierWeight(tier: PlanTier | string | null): number {
  if (!tier) return 0
  return TIER_WEIGHTS[tier] ?? 0
}

// ─── Quality Score ──────────────────────────────────────────────────

/**
 * Quality score (0-20) based on listing completeness and engagement.
 *
 * Components:
 * - Has description (3 pts)
 * - Has photo (3 pts)
 * - Has phone (2 pts)
 * - Has website (2 pts)
 * - Review count: min(review_count, 10) (up to 10 pts)
 */
export function calculateQualityScore(params: {
  hasDescription: boolean
  hasPhoto: boolean
  hasPhone: boolean
  hasWebsite: boolean
  reviewCount: number
  avgRating: number | null
}): number {
  let score = 0

  if (params.hasDescription) score += 3
  if (params.hasPhoto) score += 3
  if (params.hasPhone) score += 2
  if (params.hasWebsite) score += 2

  // Review bonus: up to 10 points
  score += Math.min(params.reviewCount, 10)

  return score
}

// ─── Proximity Bonus ────────────────────────────────────────────────

/**
 * Proximity bonus (0-15) — closer businesses get a higher bonus.
 * Only applies when the user provides coordinates.
 *
 * Within 5km: 15 pts
 * 5-10km: linear 15→10
 * 10-25km: linear 10→5
 * 25-50km: linear 5→0
 * >50km: 0
 */
export function calculateProximityBonus(distanceKm: number | null): number {
  if (distanceKm == null) return 0

  if (distanceKm < 5) return 15
  if (distanceKm <= 10) return 15 - ((distanceKm - 5) / 5) * 5    // 15→10
  if (distanceKm <= 25) return 10 - ((distanceKm - 10) / 15) * 5  // 10→5
  if (distanceKm <= 50) return 5 - ((distanceKm - 25) / 25) * 5   // 5→0
  return 0
}

// ─── Exposure Penalty ───────────────────────────────────────────────

/**
 * Exposure penalty (0-15) — businesses shown frequently recently get penalized.
 * This ensures fair rotation within the same tier.
 *
 * Based on recent_impressions relative to the average for the tier.
 * penalty = (recent_impressions / (avg_impressions + 1)) * 10, capped at 15
 */
export function calculateExposurePenalty(
  recentImpressions: number,
  avgTierImpressions: number
): number {
  if (recentImpressions <= 0) return 0
  const ratio = recentImpressions / (avgTierImpressions + 1)
  return Math.min(ratio * 10, 15)
}

// ─── Full Rank Score ────────────────────────────────────────────────

export interface RankScoreParams {
  tier: PlanTier | string | null
  hasDescription: boolean
  hasPhoto: boolean
  hasPhone: boolean
  hasWebsite: boolean
  reviewCount: number
  avgRating: number | null
  distanceKm: number | null
  recentImpressions: number
  avgTierImpressions: number
}

/**
 * Calculate the full rank score.
 *
 * rank_score = tier_weight + quality_score + proximity_bonus - exposure_penalty
 *
 * Range: roughly -15 to 75 (depending on all factors)
 * Higher = better ranking position.
 */
export function calculateRankScore(params: RankScoreParams): number {
  const tierWeight = getTierWeight(params.tier)
  const qualityScore = calculateQualityScore({
    hasDescription: params.hasDescription,
    hasPhoto: params.hasPhoto,
    hasPhone: params.hasPhone,
    hasWebsite: params.hasWebsite,
    reviewCount: params.reviewCount,
    avgRating: params.avgRating,
  })
  const proximityBonus = calculateProximityBonus(params.distanceKm)
  const exposurePenalty = calculateExposurePenalty(
    params.recentImpressions,
    params.avgTierImpressions
  )

  return Math.round((tierWeight + qualityScore + proximityBonus - exposurePenalty) * 100) / 100
}

// ─── Trial Expiration ───────────────────────────────────────────────

/** Default trial duration in days. Kept for backward compat with tests/migrations. */
export const TRIAL_DURATION_DAYS = 30

/**
 * Check if a trial has expired.
 * NOTE: With Stripe-native trials, trial expiry is handled by Stripe.
 * The free_trial plan no longer exists. This always returns false.
 */
export function isTrialExpired(
  _plan: PlanTier | string,
  _currentPeriodEnd: string | null
): boolean {
  return false
}

/**
 * Get effective tier weight. Trial expiry is now Stripe-managed.
 */
export function getEffectiveTierWeight(
  tier: PlanTier | string | null,
  _currentPeriodEnd: string | null
): number {
  if (!tier) return 0
  return getTierWeight(tier)
}
