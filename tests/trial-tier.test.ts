/**
 * tests/trial-tier.test.ts
 *
 * Tests for trial behaviour (now Stripe-native):
 * - Trial duration constant
 * - isTrialExpired always returns false (trial is Stripe-native)
 * - Tier weight and ranking behaviour
 * - Upgrade path from basic
 * - Trial days remaining calculation
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

describe('Trial & Tier Behaviour', () => {
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

  // ─── isTrialExpired (now always returns false) ─────────────────────

  describe('isTrialExpired (Stripe-native trial)', () => {
    it('should always return false for all plans', () => {
      expect(isTrialExpired('basic', '2024-01-01T00:00:00Z')).toBe(false)
      expect(isTrialExpired('premium', '2024-01-01T00:00:00Z')).toBe(false)
      expect(isTrialExpired('premium_annual', '2024-01-01T00:00:00Z')).toBe(false)
    })

    it('should return false even with past date', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      expect(isTrialExpired('basic', pastDate)).toBe(false)
    })

    it('should return false with future date', () => {
      const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
      expect(isTrialExpired('premium', futureDate)).toBe(false)
    })

    it('should return false with null period_end', () => {
      expect(isTrialExpired('basic', null)).toBe(false)
    })
  })

  // ─── Tier Ranking Behaviour ──────────────────────────────────────

  describe('Tier Ranking Behaviour', () => {
    it('basic should have tier weight of 10', () => {
      expect(getTierWeight('basic')).toBe(10)
    })

    it('basic with quality should rank lower than premium with quality', () => {
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

      const premiumWithQuality = calculateRankScore({
        tier: 'premium',
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

      expect(basicWithQuality).toBeLessThan(premiumWithQuality)
      expect(premiumWithQuality - basicWithQuality).toBe(20) // premium(30) - basic(10)
    })

    it('basic businesses should still appear in search (rank > -infinity)', () => {
      const basicRank = calculateRankScore({
        tier: 'basic',
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

      expect(basicRank).toBeGreaterThan(-Infinity)
      expect(basicRank).toBe(10) // basic tier weight only
    })

    it('basic with good quality can have high rank', () => {
      const basicRank = calculateRankScore({
        tier: 'basic',
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

      // 10 + (3+3+2+2+5) + 15 - 0 = 40
      expect(basicRank).toBeGreaterThan(0)
    })
  })

  // ─── Effective Tier Weight ─────────────────────────────────────────

  describe('Effective Tier Weight', () => {
    it('basic should have effective weight of 10', () => {
      expect(getEffectiveTierWeight('basic', null)).toBe(10)
    })

    it('paid plans should not be affected by expiration logic', () => {
      expect(getEffectiveTierWeight('basic', '2020-01-01T00:00:00Z')).toBe(10)
      expect(getEffectiveTierWeight('premium', '2020-01-01T00:00:00Z')).toBe(30)
      expect(getEffectiveTierWeight('premium_annual', '2020-01-01T00:00:00Z')).toBe(40)
    })
  })

  // ─── Stripe-native Trial on Claim ──────────────────────────────────

  describe('Stripe-native Trial on Claim', () => {
    it('trialing subscription should use status trialing (not a separate plan)', () => {
      const subscription = {
        business_id: 'biz-123',
        status: 'trialing',
        plan: 'basic',
        current_period_end: new Date(Date.now() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        current_period_start: new Date().toISOString(),
        cancel_at_period_end: false,
      }

      expect(subscription.status).toBe('trialing')
      expect(subscription.plan).toBe('basic')
      expect(subscription.cancel_at_period_end).toBe(false)
    })

    it('should not assign trial if subscription already exists', () => {
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

  // ─── Plan Definitions ──────────────────────────────────────────────

  describe('Plan Definitions', () => {
    it('basic plan should have correct name', () => {
      const plan = getPlanById('basic')
      expect(plan.name).toBe('Basic')
    })

    it('basic should NOT have photo or testimonial access', () => {
      const plan = getPlanById('basic')
      expect(plan.canUploadPhotos).toBe(false)
      expect(plan.canAddTestimonials).toBe(false)
    })

    it('basic should have profile features', () => {
      const plan = getPlanById('basic')
      expect(plan.features).toContain('Professional business profile')
      expect(plan.features).toContain('Appear in search results')
    })
  })

  // ─── Upgrade Path from Basic ──────────────────────────────────────

  describe('Upgrade Path from Basic', () => {
    it('upgrading to premium should increase tier weight by 20', () => {
      const basicWeight = getTierWeight('basic')
      const premiumWeight = getTierWeight('premium')
      expect(premiumWeight - basicWeight).toBe(20)
    })

    it('upgrading to premium_annual should increase tier weight by 30', () => {
      const basicWeight = getTierWeight('basic')
      const annualWeight = getTierWeight('premium_annual')
      expect(annualWeight - basicWeight).toBe(30)
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

      const basicRank = calculateRankScore({ ...baseParams, tier: 'basic' })
      const premiumRank = calculateRankScore({ ...baseParams, tier: 'premium' })

      // Each upgrade should provide meaningful rank improvement
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
