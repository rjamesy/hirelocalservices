/**
 * tests/admin-ranking-settings.test.ts
 *
 * Tests for configurable ranking settings:
 * - Configurable tier weights (defaults, custom, ordering maintained)
 * - Exposure balance strength scaling (low/high/zero/capped)
 */

import { describe, it, expect } from 'vitest'

// ─── Configurable Tier Weights ───────────────────────────────────────

const DEFAULT_TIER_WEIGHTS: Record<string, number> = {
  premium_annual: 40,
  premium: 30,
  basic: 10,
  free_trial: 0,
}

function getConfigurableTierWeight(
  tier: string | null,
  customWeights: Record<string, number> = DEFAULT_TIER_WEIGHTS
): number {
  if (!tier) return 0
  return customWeights[tier] ?? 0
}

// ─── Configurable Exposure Balance ───────────────────────────────────

function calculateConfigurableExposurePenalty(
  recentImpressions: number,
  avgTierImpressions: number,
  strength: number
): number {
  if (recentImpressions <= 0) return 0
  if (strength <= 0) return 0
  const ratio = recentImpressions / (avgTierImpressions + 1)
  return Math.min(ratio * strength, 15)
}

describe('Admin Ranking Settings', () => {
  // ─── Configurable Tier Weights ──────────────────────────────────

  describe('Configurable tier weights', () => {
    it('should return default weight for premium_annual (40)', () => {
      expect(getConfigurableTierWeight('premium_annual')).toBe(40)
    })

    it('should return default weight for premium (30)', () => {
      expect(getConfigurableTierWeight('premium')).toBe(30)
    })

    it('should return default weight for basic (10)', () => {
      expect(getConfigurableTierWeight('basic')).toBe(10)
    })

    it('should return default weight for free_trial (0)', () => {
      expect(getConfigurableTierWeight('free_trial')).toBe(0)
    })

    it('should use custom weights when provided', () => {
      const custom = {
        premium_annual: 50,
        premium: 35,
        basic: 15,
        free_trial: 5,
      }
      expect(getConfigurableTierWeight('premium_annual', custom)).toBe(50)
      expect(getConfigurableTierWeight('premium', custom)).toBe(35)
      expect(getConfigurableTierWeight('basic', custom)).toBe(15)
      expect(getConfigurableTierWeight('free_trial', custom)).toBe(5)
    })

    it('should maintain ordering: annual > premium > basic > trial', () => {
      const w = DEFAULT_TIER_WEIGHTS
      expect(w.premium_annual).toBeGreaterThan(w.premium)
      expect(w.premium).toBeGreaterThan(w.basic)
      expect(w.basic).toBeGreaterThan(w.free_trial)
    })

    it('should maintain ordering with custom weights too', () => {
      const custom = { premium_annual: 60, premium: 40, basic: 20, free_trial: 5 }
      expect(custom.premium_annual).toBeGreaterThan(custom.premium)
      expect(custom.premium).toBeGreaterThan(custom.basic)
      expect(custom.basic).toBeGreaterThan(custom.free_trial)
    })

    it('should return 0 for null tier', () => {
      expect(getConfigurableTierWeight(null)).toBe(0)
    })

    it('should return 0 for unknown tier', () => {
      expect(getConfigurableTierWeight('enterprise')).toBe(0)
    })

    it('should allow setting all weights to same value', () => {
      const flat = { premium_annual: 10, premium: 10, basic: 10, free_trial: 10 }
      expect(getConfigurableTierWeight('premium_annual', flat))
        .toBe(getConfigurableTierWeight('free_trial', flat))
    })
  })

  // ─── Exposure Balance Strength ──────────────────────────────────

  describe('Exposure balance strength scaling', () => {
    it('should use default strength (10) for standard penalty', () => {
      // ratio = 50 / (100 + 1) ≈ 0.495, penalty ≈ 4.95
      const penalty = calculateConfigurableExposurePenalty(50, 100, 10)
      expect(penalty).toBeCloseTo(4.95, 0)
    })

    it('should increase penalty with high strength (20)', () => {
      // ratio ≈ 0.495, penalty ≈ 9.9
      const penalty = calculateConfigurableExposurePenalty(50, 100, 20)
      expect(penalty).toBeCloseTo(9.9, 0)
    })

    it('should decrease penalty with low strength (5)', () => {
      // ratio ≈ 0.495, penalty ≈ 2.475
      const penalty = calculateConfigurableExposurePenalty(50, 100, 5)
      expect(penalty).toBeCloseTo(2.475, 0)
    })

    it('should return 0 penalty with zero strength', () => {
      const penalty = calculateConfigurableExposurePenalty(50, 100, 0)
      expect(penalty).toBe(0)
    })

    it('should cap penalty at 15 regardless of strength', () => {
      const penalty = calculateConfigurableExposurePenalty(1000, 10, 50)
      expect(penalty).toBe(15)
    })

    it('should return 0 for zero impressions', () => {
      const penalty = calculateConfigurableExposurePenalty(0, 100, 10)
      expect(penalty).toBe(0)
    })

    it('should return 0 for negative impressions', () => {
      const penalty = calculateConfigurableExposurePenalty(-5, 100, 10)
      expect(penalty).toBe(0)
    })

    it('higher strength means more penalty for same impressions', () => {
      const low = calculateConfigurableExposurePenalty(50, 50, 5)
      const high = calculateConfigurableExposurePenalty(50, 50, 20)
      expect(high).toBeGreaterThan(low)
    })

    it('strength of 1 gives minimal penalty', () => {
      // ratio = 50 / (100 + 1) ≈ 0.495, penalty ≈ 0.495
      const penalty = calculateConfigurableExposurePenalty(50, 100, 1)
      expect(penalty).toBeCloseTo(0.495, 1)
    })

    it('strength linearly scales the penalty', () => {
      const s5 = calculateConfigurableExposurePenalty(50, 100, 5)
      const s10 = calculateConfigurableExposurePenalty(50, 100, 10)
      // s10 should be roughly double s5
      expect(s10).toBeCloseTo(s5 * 2, 1)
    })
  })
})
