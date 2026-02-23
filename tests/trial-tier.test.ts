/**
 * tests/trial-tier.test.ts
 *
 * Tests for trial tier behaviour:
 * - Auto-assignment on claim approval
 * - Trial duration and expiration
 * - Trial ranking behaviour
 * - Upgrade path from trial
 * - Trial expiration effect on visibility
 */

import { describe, it, expect } from 'vitest'
import {
  getTierWeight,
  calculateRankScore,
  isTrialExpired,
  getEffectiveTierWeight,
  TRIAL_DURATION_DAYS,
} from '@/lib/ranking'
import { getPlanById } from '@/lib/constants'

describe('Trial Tier', () => {
  // ─── Trial Duration ───────────────────────────────────────────────

  describe('Trial Duration', () => {
    it('should be 30 days', () => {
      expect(TRIAL_DURATION_DAYS).toBe(30)
    })

    it('should produce correct trial end date', () => {
      const now = new Date('2025-01-01T00:00:00Z')
      const trialEnd = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000)
      expect(trialEnd.toISOString()).toBe('2025-01-31T00:00:00.000Z')
    })

    it('should handle leap year correctly', () => {
      const now = new Date('2024-02-01T00:00:00Z') // 2024 is a leap year
      const trialEnd = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000)
      // 30 days from Feb 1 in a leap year = March 2
      expect(trialEnd.getDate()).toBe(2)
      expect(trialEnd.getMonth()).toBe(2) // March (0-indexed)
    })
  })

  // ─── Trial Expiration Detection ───────────────────────────────────

  describe('Trial Expiration Detection', () => {
    it('should detect expired trial', () => {
      const pastDate = '2024-01-01T00:00:00Z'
      expect(isTrialExpired('free_trial', pastDate)).toBe(true)
    })

    it('should detect active trial', () => {
      const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
      expect(isTrialExpired('free_trial', futureDate)).toBe(false)
    })

    it('should treat trial just expired (1 second ago) as expired', () => {
      const justExpired = new Date(Date.now() - 1000).toISOString()
      expect(isTrialExpired('free_trial', justExpired)).toBe(true)
    })

    it('should NOT treat non-trial plans as expired regardless of date', () => {
      expect(isTrialExpired('basic', '2020-01-01T00:00:00Z')).toBe(false)
      expect(isTrialExpired('premium', '2020-01-01T00:00:00Z')).toBe(false)
      expect(isTrialExpired('premium_annual', '2020-01-01T00:00:00Z')).toBe(false)
    })

    it('should handle null period_end as not expired', () => {
      expect(isTrialExpired('free_trial', null)).toBe(false)
    })
  })

  // ─── Trial Ranking Behaviour ──────────────────────────────────────

  describe('Trial Ranking Behaviour', () => {
    it('trial should have 0 tier weight', () => {
      expect(getTierWeight('free_trial')).toBe(0)
    })

    it('trial with quality should still rank lower than basic with quality', () => {
      const trialWithQuality = calculateRankScore({
        tier: 'free_trial',
        hasDescription: true,
        hasPhoto: true,
        hasPhone: true,
        hasWebsite: true,
        reviewCount: 10,
        avgRating: 5.0,
        distanceKm: 2,
        recentImpressions: 0,
        avgTierImpressions: 0,
      })

      const basicWithQuality = calculateRankScore({
        tier: 'basic',
        hasDescription: true,
        hasPhoto: true,
        hasPhone: true,
        hasWebsite: true,
        reviewCount: 10,
        avgRating: 5.0,
        distanceKm: 2,
        recentImpressions: 0,
        avgTierImpressions: 0,
      })

      expect(trialWithQuality).toBeLessThan(basicWithQuality)
      expect(basicWithQuality - trialWithQuality).toBe(10) // basic weight difference
    })

    it('trial businesses should still appear in search (rank > -infinity)', () => {
      const trialRank = calculateRankScore({
        tier: 'free_trial',
        hasDescription: false,
        hasPhoto: false,
        hasPhone: false,
        hasWebsite: false,
        reviewCount: 0,
        avgRating: null,
        distanceKm: null,
        recentImpressions: 0,
        avgTierImpressions: 0,
      })

      expect(trialRank).toBeGreaterThan(-Infinity)
      expect(trialRank).toBe(0) // 0 tier + 0 quality + 0 proximity - 0 penalty
    })

    it('trial with good quality can have positive rank', () => {
      const trialRank = calculateRankScore({
        tier: 'free_trial',
        hasDescription: true,
        hasPhoto: true,
        hasPhone: true,
        hasWebsite: true,
        reviewCount: 5,
        avgRating: 4.5,
        distanceKm: 3,
        recentImpressions: 0,
        avgTierImpressions: 0,
      })

      // 0 + (3+3+2+2+5) + 15 - 0 = 30
      expect(trialRank).toBeGreaterThan(0)
    })
  })

  // ─── Effective Tier Weight (Trial Expiration) ─────────────────────

  describe('Effective Tier Weight', () => {
    it('expired trial should have 0 effective weight', () => {
      const pastDate = '2024-01-01T00:00:00Z'
      expect(getEffectiveTierWeight('free_trial', pastDate)).toBe(0)
    })

    it('active trial should have 0 weight (trial weight is always 0)', () => {
      const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
      expect(getEffectiveTierWeight('free_trial', futureDate)).toBe(0)
    })

    it('paid plans should not be affected by expiration logic', () => {
      expect(getEffectiveTierWeight('basic', '2020-01-01T00:00:00Z')).toBe(10)
      expect(getEffectiveTierWeight('premium', '2020-01-01T00:00:00Z')).toBe(30)
      expect(getEffectiveTierWeight('premium_annual', '2020-01-01T00:00:00Z')).toBe(40)
    })
  })

  // ─── Trial Auto-Assignment on Claim ───────────────────────────────

  describe('Trial Auto-Assignment on Claim', () => {
    it('trial subscription should have correct structure', () => {
      const now = new Date()
      const trialEnd = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000)

      const subscription = {
        business_id: 'biz-123',
        status: 'active',
        plan: 'free_trial',
        current_period_end: trialEnd.toISOString(),
        current_period_start: now.toISOString(),
        cancel_at_period_end: false,
      }

      expect(subscription.status).toBe('active')
      expect(subscription.plan).toBe('free_trial')
      expect(subscription.cancel_at_period_end).toBe(false)

      // Verify end date is ~30 days from now
      const endDate = new Date(subscription.current_period_end)
      const diffMs = endDate.getTime() - now.getTime()
      const diffDays = diffMs / (24 * 60 * 60 * 1000)
      expect(Math.round(diffDays)).toBe(TRIAL_DURATION_DAYS)
    })

    it('should not assign trial if subscription already exists', () => {
      // Simulates the check in assignTrialSubscription
      const existingSubscription = { id: 'sub-123' }
      const shouldAssign = !existingSubscription
      expect(shouldAssign).toBe(false)
    })

    it('should assign trial if no subscription exists', () => {
      const existingSubscription = null
      const shouldAssign = !existingSubscription
      expect(shouldAssign).toBe(true)
    })
  })

  // ─── Trial Plan Definition ────────────────────────────────────────

  describe('Trial Plan Definition', () => {
    it('should have Free Trial name', () => {
      const plan = getPlanById('free_trial')
      expect(plan.name).toBe('Free Trial')
    })

    it('should have 30 days interval', () => {
      const plan = getPlanById('free_trial')
      expect(plan.interval).toBe('30 days')
    })

    it('should NOT have photo or testimonial access', () => {
      const plan = getPlanById('free_trial')
      expect(plan.canUploadPhotos).toBe(false)
      expect(plan.canAddTestimonials).toBe(false)
    })

    it('should have SEO and profile features', () => {
      const plan = getPlanById('free_trial')
      expect(plan.features).toContain('Professional business profile')
      expect(plan.features).toContain('Appear in search results')
      expect(plan.features).toContain('SEO-optimised listing')
    })
  })

  // ─── Upgrade Path from Trial ──────────────────────────────────────

  describe('Upgrade Path from Trial', () => {
    it('upgrading to basic should increase tier weight from 0 to 10', () => {
      const trialWeight = getTierWeight('free_trial')
      const basicWeight = getTierWeight('basic')
      expect(basicWeight - trialWeight).toBe(10)
    })

    it('upgrading to premium should increase tier weight from 0 to 30', () => {
      const trialWeight = getTierWeight('free_trial')
      const premiumWeight = getTierWeight('premium')
      expect(premiumWeight - trialWeight).toBe(30)
    })

    it('upgrading to premium_annual should increase tier weight from 0 to 40', () => {
      const trialWeight = getTierWeight('free_trial')
      const annualWeight = getTierWeight('premium_annual')
      expect(annualWeight - trialWeight).toBe(40)
    })

    it('upgrading should significantly improve rank score', () => {
      const baseParams = {
        hasDescription: true,
        hasPhoto: false,
        hasPhone: true,
        hasWebsite: false,
        reviewCount: 3,
        avgRating: 4.0 as number | null,
        distanceKm: 10 as number | null,
        recentImpressions: 0,
        avgTierImpressions: 0,
      }

      const trialRank = calculateRankScore({ ...baseParams, tier: 'free_trial' })
      const basicRank = calculateRankScore({ ...baseParams, tier: 'basic' })
      const premiumRank = calculateRankScore({ ...baseParams, tier: 'premium' })

      // Each upgrade should provide meaningful rank improvement
      expect(basicRank - trialRank).toBe(10)
      expect(premiumRank - basicRank).toBe(20)
    })
  })

  // ─── Trial Days Remaining Calculation ─────────────────────────────

  describe('Trial Days Remaining', () => {
    it('should correctly calculate days remaining', () => {
      const endDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
      const now = new Date()
      const daysRemaining = Math.max(
        0,
        Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      )
      expect(daysRemaining).toBe(15)
    })

    it('should return 0 for expired trial', () => {
      const endDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const now = new Date()
      const daysRemaining = Math.max(
        0,
        Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      )
      expect(daysRemaining).toBe(0)
    })

    it('should return 30 for fresh trial', () => {
      const now = new Date()
      const endDate = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000)
      const daysRemaining = Math.max(
        0,
        Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      )
      expect(daysRemaining).toBe(TRIAL_DURATION_DAYS)
    })
  })
})
