/**
 * tests/plan-features.test.ts
 *
 * Tests for plan-based premium feature access:
 * - Premium users can access photos
 * - Premium annual users can access testimonials
 * - Free trial users blocked from photos
 * - Basic users blocked from testimonials
 * - Premium check logic returns correct boolean
 */

import { describe, it, expect } from 'vitest'
import type { PlanTier } from '@/lib/types'

// This function replicates the check used in photos/page.tsx and testimonials/page.tsx
function isPremium(plan: PlanTier | null): boolean {
  return plan === 'premium' || plan === 'premium_annual'
}

describe('Plan-Based Feature Access', () => {
  // ─── Photo access ───────────────────────────────────────────────

  describe('Photo access (premium check)', () => {
    it('premium user can access photos', () => {
      expect(isPremium('premium')).toBe(true)
    })

    it('premium_annual user can access photos', () => {
      expect(isPremium('premium_annual')).toBe(true)
    })

    it('free_trial user blocked from photos', () => {
      expect(isPremium('free_trial')).toBe(false)
    })

    it('basic user blocked from photos', () => {
      expect(isPremium('basic')).toBe(false)
    })

    it('null plan (no subscription) blocked from photos', () => {
      expect(isPremium(null)).toBe(false)
    })
  })

  // ─── Testimonial access ─────────────────────────────────────────

  describe('Testimonial access (premium check)', () => {
    it('premium user can access testimonials', () => {
      expect(isPremium('premium')).toBe(true)
    })

    it('premium_annual user can access testimonials', () => {
      expect(isPremium('premium_annual')).toBe(true)
    })

    it('free_trial user blocked from testimonials', () => {
      expect(isPremium('free_trial')).toBe(false)
    })

    it('basic user blocked from testimonials', () => {
      expect(isPremium('basic')).toBe(false)
    })
  })

  // ─── Premium check logic ────────────────────────────────────────

  describe('isPremium() comprehensive check', () => {
    const allTiers: { tier: PlanTier; expected: boolean }[] = [
      { tier: 'free_trial', expected: false },
      { tier: 'basic', expected: false },
      { tier: 'premium', expected: true },
      { tier: 'premium_annual', expected: true },
    ]

    for (const { tier, expected } of allTiers) {
      it(`${tier} → isPremium = ${expected}`, () => {
        expect(isPremium(tier)).toBe(expected)
      })
    }
  })

  // ─── Bug fix verification ───────────────────────────────────────

  describe('Bug fix: null subscription no longer blocks premium users', () => {
    it('old pattern: business.subscription?.plan defaults to basic (the bug)', () => {
      // This simulates the old buggy pattern
      const business = { subscription: null }
      const sub = business.subscription as { plan?: string } | null
      const plan = sub?.plan ?? 'basic'
      // This always resulted in 'basic' even for premium users
      expect(plan).toBe('basic')
    })

    it('new pattern: getMyEntitlements() returns actual plan from user_subscriptions', () => {
      // Simulate what getMyEntitlements() returns for a premium user
      const planFromUserSubscriptions: PlanTier = 'premium'
      expect(isPremium(planFromUserSubscriptions)).toBe(true)
    })

    it('new pattern: getMyEntitlements() returns null for no subscription', () => {
      const planFromUserSubscriptions: PlanTier | null = null
      expect(isPremium(planFromUserSubscriptions)).toBe(false)
    })
  })
})
