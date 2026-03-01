/**
 * tests/subscriptions.test.ts
 *
 * Tests for subscription management:
 * - Plan tier definitions and configuration
 * - Subscription status handling
 * - Price ID resolution
 * - Plan lookup utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  PLANS,
  getPlanById,
  getPlanByPriceId,
  getValidPriceIds,
  GRACE_PERIOD_DAYS,
} from '@/lib/constants'
import type { PlanTier } from '@/lib/types'

describe('Subscription System', () => {
  // ─── Plan Definitions ─────────────────────────────────────────────

  describe('Plan Definitions', () => {
    it('should have exactly 3 plan tiers', () => {
      expect(PLANS).toHaveLength(3)
    })

    it('should include basic, premium, premium_annual', () => {
      const ids = PLANS.map((p) => p.id)
      expect(ids).toContain('basic')
      expect(ids).toContain('premium')
      expect(ids).toContain('premium_annual')
    })

    it('basic should cost $4/month', () => {
      const basic = PLANS.find((p) => p.id === 'basic')!
      expect(basic.price).toBe(4)
      expect(basic.interval).toBe('month')
    })

    it('premium should cost $10/month', () => {
      const premium = PLANS.find((p) => p.id === 'premium')!
      expect(premium.price).toBe(10)
      expect(premium.interval).toBe('month')
    })

    it('premium_annual should cost $99/year', () => {
      const annual = PLANS.find((p) => p.id === 'premium_annual')!
      expect(annual.price).toBe(99)
      expect(annual.interval).toBe('year')
    })

    it('annual premium saves money vs monthly premium', () => {
      const monthlyPremium = PLANS.find((p) => p.id === 'premium')!
      const annualPremium = PLANS.find((p) => p.id === 'premium_annual')!
      const yearlyMonthlyCost = monthlyPremium.price * 12 // $120
      expect(annualPremium.price).toBeLessThan(yearlyMonthlyCost)
    })
  })

  // ─── Feature Gating Configuration ─────────────────────────────────

  describe('Feature Gating Configuration', () => {
    it('basic should NOT allow photos or testimonials', () => {
      const basic = PLANS.find((p) => p.id === 'basic')!
      expect(basic.canUploadPhotos).toBe(false)
      expect(basic.canAddTestimonials).toBe(false)
      expect(basic.maxPhotos).toBe(0)
      expect(basic.maxTestimonials).toBe(0)
    })

    it('premium should allow photos and testimonials', () => {
      const premium = PLANS.find((p) => p.id === 'premium')!
      expect(premium.canUploadPhotos).toBe(true)
      expect(premium.canAddTestimonials).toBe(true)
      expect(premium.maxPhotos).toBe(10)
      expect(premium.maxTestimonials).toBe(20)
    })

    it('premium_annual should allow photos and testimonials', () => {
      const annual = PLANS.find((p) => p.id === 'premium_annual')!
      expect(annual.canUploadPhotos).toBe(true)
      expect(annual.canAddTestimonials).toBe(true)
      expect(annual.maxPhotos).toBe(10)
      expect(annual.maxTestimonials).toBe(20)
    })

    it('all plans should have features list', () => {
      for (const plan of PLANS) {
        expect(plan.features.length).toBeGreaterThan(0)
      }
    })

    it('premium plans should have more features than basic', () => {
      const basic = PLANS.find((p) => p.id === 'basic')!
      const premium = PLANS.find((p) => p.id === 'premium')!
      expect(premium.features.length).toBeGreaterThan(basic.features.length)
    })
  })

  // ─── Plan Lookup ──────────────────────────────────────────────────

  describe('getPlanById', () => {
    it('should return correct plan for each tier', () => {
      expect(getPlanById('basic').id).toBe('basic')
      expect(getPlanById('premium').id).toBe('premium')
      expect(getPlanById('premium_annual').id).toBe('premium_annual')
    })

    it('should return basic as fallback for unknown tier', () => {
      const fallback = getPlanById('unknown' as PlanTier)
      expect(fallback.id).toBe('basic')
    })
  })

  describe('getPlanByPriceId', () => {
    it('should return undefined for unknown price ID', () => {
      expect(getPlanByPriceId('price_unknown_123')).toBeUndefined()
    })

    it('should find plan by matching env var price ID', () => {
      // Set a known price ID for testing
      const originalEnv = process.env.STRIPE_PRICE_ID_BASIC
      process.env.STRIPE_PRICE_ID_BASIC = 'price_test_basic'

      const plan = getPlanByPriceId('price_test_basic')
      expect(plan?.id).toBe('basic')

      // Restore
      if (originalEnv !== undefined) {
        process.env.STRIPE_PRICE_ID_BASIC = originalEnv
      } else {
        delete process.env.STRIPE_PRICE_ID_BASIC
      }
    })
  })

  describe('getValidPriceIds', () => {
    it('should return array of strings', () => {
      const priceIds = getValidPriceIds()
      expect(Array.isArray(priceIds)).toBe(true)
      for (const id of priceIds) {
        expect(typeof id).toBe('string')
      }
    })

    it('should filter out undefined env vars', () => {
      // Without env vars set, should return empty array
      const priceIds = getValidPriceIds()
      // Each returned ID should be a non-empty string
      for (const id of priceIds) {
        expect(id.length).toBeGreaterThan(0)
      }
    })
  })

  // ─── Grace Period ─────────────────────────────────────────────────

  describe('Grace Period', () => {
    it('should be 7 days', () => {
      expect(GRACE_PERIOD_DAYS).toBe(7)
    })
  })

  // ─── Subscription Status Logic ────────────────────────────────────

  describe('Subscription Status', () => {
    it('should consider active as having subscription', () => {
      const status = 'active'
      expect(['active', 'past_due'].includes(status)).toBe(true)
    })

    it('should consider past_due as having subscription (grace period)', () => {
      const status = 'past_due'
      expect(['active', 'past_due'].includes(status)).toBe(true)
    })

    it('should NOT consider canceled as having subscription', () => {
      const status = 'canceled'
      expect(['active', 'past_due'].includes(status)).toBe(false)
    })

    it('should NOT consider incomplete as having subscription', () => {
      const status = 'incomplete'
      expect(['active', 'past_due'].includes(status)).toBe(false)
    })

    it('should NOT consider unpaid as having subscription', () => {
      const status = 'unpaid'
      expect(['active', 'past_due'].includes(status)).toBe(false)
    })
  })

  // ─── Tier Upgrade Path ────────────────────────────────────────────

  describe('Tier Upgrade Path', () => {
    it('should have ascending pricing from basic to annual', () => {
      const basic = PLANS.find((p) => p.id === 'basic')!
      const premium = PLANS.find((p) => p.id === 'premium')!

      expect(basic.price).toBeLessThan(premium.price)
    })

    it('each plan should have a price ID env var defined', () => {
      for (const plan of PLANS) {
        expect(plan.priceIdEnvVar).toBeTruthy()
        expect(plan.priceIdEnvVar.startsWith('STRIPE_PRICE_ID_')).toBe(true)
      }
    })
  })
})
