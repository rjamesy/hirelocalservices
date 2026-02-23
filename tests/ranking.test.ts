/**
 * tests/ranking.test.ts
 *
 * Tests for the fair ranking rotation algorithm:
 * - Tier weight calculation
 * - Quality score calculation
 * - Proximity bonus calculation
 * - Exposure penalty calculation
 * - Full rank score formula
 * - Trial expiration logic
 */

import { describe, it, expect } from 'vitest'
import {
  getTierWeight,
  calculateQualityScore,
  calculateProximityBonus,
  calculateExposurePenalty,
  calculateRankScore,
  isTrialExpired,
  getEffectiveTierWeight,
  TRIAL_DURATION_DAYS,
} from '@/lib/ranking'

describe('Fair Ranking Algorithm', () => {
  // ─── Tier Weights ──────────────────────────────────────────────────

  describe('getTierWeight', () => {
    it('should return 40 for premium_annual', () => {
      expect(getTierWeight('premium_annual')).toBe(40)
    })

    it('should return 30 for premium', () => {
      expect(getTierWeight('premium')).toBe(30)
    })

    it('should return 10 for basic', () => {
      expect(getTierWeight('basic')).toBe(10)
    })

    it('should return 0 for free_trial', () => {
      expect(getTierWeight('free_trial')).toBe(0)
    })

    it('should return 0 for null tier', () => {
      expect(getTierWeight(null)).toBe(0)
    })

    it('should return 0 for unknown tier', () => {
      expect(getTierWeight('enterprise')).toBe(0)
    })

    it('should return 0 for empty string', () => {
      expect(getTierWeight('')).toBe(0)
    })
  })

  // ─── Quality Score ─────────────────────────────────────────────────

  describe('calculateQualityScore', () => {
    const baseParams = {
      hasDescription: false,
      hasPhoto: false,
      hasPhone: false,
      hasWebsite: false,
      reviewCount: 0,
      avgRating: null,
    }

    it('should return 0 for empty listing', () => {
      expect(calculateQualityScore(baseParams)).toBe(0)
    })

    it('should add 3 for description', () => {
      expect(calculateQualityScore({ ...baseParams, hasDescription: true })).toBe(3)
    })

    it('should add 3 for photo', () => {
      expect(calculateQualityScore({ ...baseParams, hasPhoto: true })).toBe(3)
    })

    it('should add 2 for phone', () => {
      expect(calculateQualityScore({ ...baseParams, hasPhone: true })).toBe(2)
    })

    it('should add 2 for website', () => {
      expect(calculateQualityScore({ ...baseParams, hasWebsite: true })).toBe(2)
    })

    it('should add review count up to 10', () => {
      expect(calculateQualityScore({ ...baseParams, reviewCount: 5 })).toBe(5)
      expect(calculateQualityScore({ ...baseParams, reviewCount: 10 })).toBe(10)
    })

    it('should cap review bonus at 10', () => {
      expect(calculateQualityScore({ ...baseParams, reviewCount: 50 })).toBe(10)
    })

    it('should return max 20 for fully complete listing', () => {
      const fullListing = {
        hasDescription: true,
        hasPhoto: true,
        hasPhone: true,
        hasWebsite: true,
        reviewCount: 10,
        avgRating: 5.0,
      }
      expect(calculateQualityScore(fullListing)).toBe(20) // 3+3+2+2+10
    })

    it('should handle partial completeness', () => {
      const partial = {
        ...baseParams,
        hasDescription: true,
        hasPhone: true,
        reviewCount: 3,
      }
      expect(calculateQualityScore(partial)).toBe(8) // 3+2+3
    })
  })

  // ─── Proximity Bonus ──────────────────────────────────────────────

  describe('calculateProximityBonus', () => {
    it('should return 0 for null distance', () => {
      expect(calculateProximityBonus(null)).toBe(0)
    })

    it('should return 15 for within 5km', () => {
      expect(calculateProximityBonus(0)).toBe(15)
      expect(calculateProximityBonus(2)).toBe(15)
      expect(calculateProximityBonus(4.9)).toBe(15)
    })

    it('should return 15 at exactly 5km', () => {
      // At 5km boundary, distanceKm < 5 is false, so falls into 5-10 range
      // 15 - ((5-5)/5)*5 = 15
      expect(calculateProximityBonus(5)).toBe(15)
    })

    it('should return ~12.5 at 7.5km (midpoint of 5-10 range)', () => {
      const bonus = calculateProximityBonus(7.5)
      expect(bonus).toBeCloseTo(12.5, 1)
    })

    it('should return 10 at 10km', () => {
      expect(calculateProximityBonus(10)).toBe(10)
    })

    it('should return ~7.5 at 17.5km (midpoint of 10-25 range)', () => {
      const bonus = calculateProximityBonus(17.5)
      expect(bonus).toBeCloseTo(7.5, 1)
    })

    it('should return 5 at 25km', () => {
      expect(calculateProximityBonus(25)).toBe(5)
    })

    it('should return ~2.5 at 37.5km (midpoint of 25-50 range)', () => {
      const bonus = calculateProximityBonus(37.5)
      expect(bonus).toBeCloseTo(2.5, 1)
    })

    it('should return 0 at 50km', () => {
      expect(calculateProximityBonus(50)).toBe(0)
    })

    it('should return 0 beyond 50km', () => {
      expect(calculateProximityBonus(100)).toBe(0)
    })

    it('should linearly decrease in each range', () => {
      const at6 = calculateProximityBonus(6)
      const at8 = calculateProximityBonus(8)
      expect(at6).toBeGreaterThan(at8) // closer = higher
    })
  })

  // ─── Exposure Penalty ─────────────────────────────────────────────

  describe('calculateExposurePenalty', () => {
    it('should return 0 when no recent impressions', () => {
      expect(calculateExposurePenalty(0, 100)).toBe(0)
    })

    it('should return 0 for negative impressions', () => {
      expect(calculateExposurePenalty(-5, 100)).toBe(0)
    })

    it('should calculate penalty based on ratio', () => {
      // ratio = 50 / (100 + 1) ≈ 0.495, penalty ≈ 4.95
      const penalty = calculateExposurePenalty(50, 100)
      expect(penalty).toBeCloseTo(4.95, 0)
    })

    it('should penalize more when impressions exceed average', () => {
      // ratio = 200 / (100 + 1) ≈ 1.98, penalty ≈ 19.8 → capped at 15
      const penalty = calculateExposurePenalty(200, 100)
      expect(penalty).toBe(15)
    })

    it('should cap penalty at 15', () => {
      const penalty = calculateExposurePenalty(1000, 10)
      expect(penalty).toBe(15)
    })

    it('should handle zero average impressions', () => {
      // ratio = 10 / (0 + 1) = 10, penalty = 100 → capped at 15
      const penalty = calculateExposurePenalty(10, 0)
      expect(penalty).toBe(15)
    })

    it('should give small penalty when impressions match average', () => {
      // ratio = 100 / (100 + 1) ≈ 0.99, penalty ≈ 9.9
      const penalty = calculateExposurePenalty(100, 100)
      expect(penalty).toBeCloseTo(9.9, 0)
    })
  })

  // ─── Full Rank Score ──────────────────────────────────────────────

  describe('calculateRankScore', () => {
    const baseRankParams = {
      tier: null as string | null,
      hasDescription: false,
      hasPhoto: false,
      hasPhone: false,
      hasWebsite: false,
      reviewCount: 0,
      avgRating: null as number | null,
      distanceKm: null as number | null,
      recentImpressions: 0,
      avgTierImpressions: 0,
    }

    it('should return 0 for a completely empty listing', () => {
      expect(calculateRankScore(baseRankParams)).toBe(0)
    })

    it('should be dominated by tier weight', () => {
      const premium = calculateRankScore({ ...baseRankParams, tier: 'premium' })
      const basic = calculateRankScore({ ...baseRankParams, tier: 'basic' })
      expect(premium).toBeGreaterThan(basic) // 30 vs 10
    })

    it('should give premium_annual highest rank', () => {
      const annual = calculateRankScore({ ...baseRankParams, tier: 'premium_annual' })
      const premium = calculateRankScore({ ...baseRankParams, tier: 'premium' })
      expect(annual).toBeGreaterThan(premium) // 40 vs 30
    })

    it('should add quality score components', () => {
      const withQuality = calculateRankScore({
        ...baseRankParams,
        tier: 'basic',
        hasDescription: true,
        hasPhoto: true,
        hasPhone: true,
        hasWebsite: true,
        reviewCount: 10,
      })
      // basic(10) + quality(20) = 30
      expect(withQuality).toBe(30)
    })

    it('should add proximity bonus', () => {
      const nearby = calculateRankScore({ ...baseRankParams, tier: 'basic', distanceKm: 2 })
      const faraway = calculateRankScore({ ...baseRankParams, tier: 'basic', distanceKm: 40 })
      expect(nearby).toBeGreaterThan(faraway)
    })

    it('should subtract exposure penalty', () => {
      const fresh = calculateRankScore({ ...baseRankParams, tier: 'basic', recentImpressions: 0 })
      const overexposed = calculateRankScore({
        ...baseRankParams,
        tier: 'basic',
        recentImpressions: 100,
        avgTierImpressions: 10,
      })
      expect(fresh).toBeGreaterThan(overexposed)
    })

    it('should allow negative scores with high exposure penalty', () => {
      const score = calculateRankScore({
        ...baseRankParams,
        tier: null,
        recentImpressions: 1000,
        avgTierImpressions: 0,
      })
      expect(score).toBeLessThan(0) // 0 + 0 + 0 - 15 = -15
    })

    it('should calculate maximum possible score', () => {
      const maxScore = calculateRankScore({
        tier: 'premium_annual',
        hasDescription: true,
        hasPhoto: true,
        hasPhone: true,
        hasWebsite: true,
        reviewCount: 10,
        avgRating: 5.0,
        distanceKm: 0,
        recentImpressions: 0,
        avgTierImpressions: 0,
      })
      // 40 + 20 + 15 - 0 = 75
      expect(maxScore).toBe(75)
    })

    it('should rank premium with quality above basic without quality', () => {
      const premiumFull = calculateRankScore({
        ...baseRankParams,
        tier: 'premium',
        hasDescription: true,
        hasPhoto: true,
        reviewCount: 5,
      })
      const basicEmpty = calculateRankScore({
        ...baseRankParams,
        tier: 'basic',
      })
      expect(premiumFull).toBeGreaterThan(basicEmpty)
    })

    it('should ensure trial tier has lower rank than basic tier', () => {
      const trial = calculateRankScore({ ...baseRankParams, tier: 'free_trial' })
      const basic = calculateRankScore({ ...baseRankParams, tier: 'basic' })
      expect(trial).toBeLessThan(basic)
    })
  })

  // ─── Trial Expiration ─────────────────────────────────────────────

  describe('isTrialExpired', () => {
    it('should return false for non-trial plans', () => {
      expect(isTrialExpired('basic', '2020-01-01T00:00:00Z')).toBe(false)
      expect(isTrialExpired('premium', '2020-01-01T00:00:00Z')).toBe(false)
      expect(isTrialExpired('premium_annual', '2020-01-01T00:00:00Z')).toBe(false)
    })

    it('should return false if trial has no end date', () => {
      expect(isTrialExpired('free_trial', null)).toBe(false)
    })

    it('should return true if trial end date is in the past', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      expect(isTrialExpired('free_trial', pastDate)).toBe(true)
    })

    it('should return false if trial end date is in the future', () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      expect(isTrialExpired('free_trial', futureDate)).toBe(false)
    })
  })

  describe('getEffectiveTierWeight', () => {
    it('should return normal weight for non-trial plans', () => {
      expect(getEffectiveTierWeight('premium', null)).toBe(30)
      expect(getEffectiveTierWeight('basic', null)).toBe(10)
    })

    it('should return 0 for null tier', () => {
      expect(getEffectiveTierWeight(null, null)).toBe(0)
    })

    it('should return 0 for expired trial', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      expect(getEffectiveTierWeight('free_trial', pastDate)).toBe(0)
    })

    it('should return 0 for active trial (tier weight is 0)', () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      expect(getEffectiveTierWeight('free_trial', futureDate)).toBe(0)
    })
  })

  describe('TRIAL_DURATION_DAYS', () => {
    it('should be 30 days', () => {
      expect(TRIAL_DURATION_DAYS).toBe(30)
    })
  })

  // ─── Ranking Fairness Properties ──────────────────────────────────

  describe('Ranking Fairness', () => {
    it('premium_annual > premium > basic > trial for same quality', () => {
      const quality = {
        hasDescription: true,
        hasPhoto: true,
        hasPhone: true,
        hasWebsite: true,
        reviewCount: 5,
        avgRating: 4.5 as number | null,
        distanceKm: 10 as number | null,
        recentImpressions: 0,
        avgTierImpressions: 0,
      }

      const annual = calculateRankScore({ ...quality, tier: 'premium_annual' })
      const premium = calculateRankScore({ ...quality, tier: 'premium' })
      const basic = calculateRankScore({ ...quality, tier: 'basic' })
      const trial = calculateRankScore({ ...quality, tier: 'free_trial' })

      expect(annual).toBeGreaterThan(premium)
      expect(premium).toBeGreaterThan(basic)
      expect(basic).toBeGreaterThan(trial)
    })

    it('exposure penalty can push overexposed premium below fresh basic', () => {
      const premiumOverexposed = calculateRankScore({
        tier: 'premium',
        hasDescription: false,
        hasPhoto: false,
        hasPhone: false,
        hasWebsite: false,
        reviewCount: 0,
        avgRating: null,
        distanceKm: null,
        recentImpressions: 500,
        avgTierImpressions: 50,
      })

      const basicFresh = calculateRankScore({
        tier: 'basic',
        hasDescription: true,
        hasPhoto: true,
        hasPhone: true,
        hasWebsite: true,
        reviewCount: 10,
        avgRating: 5.0,
        distanceKm: 2,
        recentImpressions: 0,
        avgTierImpressions: 50,
      })

      // Premium(30) - penalty(15) = 15
      // Basic(10) + quality(20) + proximity(15) = 45
      expect(basicFresh).toBeGreaterThan(premiumOverexposed)
    })

    it('proximity alone does not override tier advantage', () => {
      const premiumFar = calculateRankScore({
        tier: 'premium',
        hasDescription: false,
        hasPhoto: false,
        hasPhone: false,
        hasWebsite: false,
        reviewCount: 0,
        avgRating: null,
        distanceKm: 100, // beyond 50km, 0 bonus
        recentImpressions: 0,
        avgTierImpressions: 0,
      })

      const trialClose = calculateRankScore({
        tier: 'free_trial',
        hasDescription: false,
        hasPhoto: false,
        hasPhone: false,
        hasWebsite: false,
        reviewCount: 0,
        avgRating: null,
        distanceKm: 1, // 15 bonus
        recentImpressions: 0,
        avgTierImpressions: 0,
      })

      // Premium(30) + 0 = 30 vs Trial(0) + 15 = 15
      expect(premiumFar).toBeGreaterThan(trialClose)
    })
  })
})
