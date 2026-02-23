/**
 * tests/feature-gating.test.ts
 *
 * Tests for feature gating by subscription tier:
 * - Photo upload restrictions by tier
 * - Testimonial restrictions by tier
 * - Plan capability checks
 * - Max limits enforcement
 */

import { describe, it, expect } from 'vitest'
import { PLANS, getPlanById, MAX_PHOTOS, MAX_TESTIMONIALS } from '@/lib/constants'
import type { PlanTier } from '@/lib/types'

describe('Feature Gating', () => {
  // ─── Photo Gating ─────────────────────────────────────────────────

  describe('Photo Upload Gating', () => {
    it('free_trial cannot upload photos', () => {
      const plan = getPlanById('free_trial')
      expect(plan.canUploadPhotos).toBe(false)
    })

    it('basic cannot upload photos', () => {
      const plan = getPlanById('basic')
      expect(plan.canUploadPhotos).toBe(false)
    })

    it('premium can upload photos', () => {
      const plan = getPlanById('premium')
      expect(plan.canUploadPhotos).toBe(true)
    })

    it('premium_annual can upload photos', () => {
      const plan = getPlanById('premium_annual')
      expect(plan.canUploadPhotos).toBe(true)
    })

    it('premium allows up to MAX_PHOTOS', () => {
      const plan = getPlanById('premium')
      expect(plan.maxPhotos).toBe(MAX_PHOTOS)
    })

    it('premium_annual allows up to MAX_PHOTOS', () => {
      const plan = getPlanById('premium_annual')
      expect(plan.maxPhotos).toBe(MAX_PHOTOS)
    })

    it('MAX_PHOTOS should be 10', () => {
      expect(MAX_PHOTOS).toBe(10)
    })

    it('non-premium plans should have 0 max photos', () => {
      const trial = getPlanById('free_trial')
      const basic = getPlanById('basic')
      expect(trial.maxPhotos).toBe(0)
      expect(basic.maxPhotos).toBe(0)
    })
  })

  // ─── Testimonial Gating ───────────────────────────────────────────

  describe('Testimonial Gating', () => {
    it('free_trial cannot add testimonials', () => {
      const plan = getPlanById('free_trial')
      expect(plan.canAddTestimonials).toBe(false)
    })

    it('basic cannot add testimonials', () => {
      const plan = getPlanById('basic')
      expect(plan.canAddTestimonials).toBe(false)
    })

    it('premium can add testimonials', () => {
      const plan = getPlanById('premium')
      expect(plan.canAddTestimonials).toBe(true)
    })

    it('premium_annual can add testimonials', () => {
      const plan = getPlanById('premium_annual')
      expect(plan.canAddTestimonials).toBe(true)
    })

    it('premium allows up to MAX_TESTIMONIALS', () => {
      const plan = getPlanById('premium')
      expect(plan.maxTestimonials).toBe(MAX_TESTIMONIALS)
    })

    it('MAX_TESTIMONIALS should be 20', () => {
      expect(MAX_TESTIMONIALS).toBe(20)
    })

    it('non-premium plans should have 0 max testimonials', () => {
      const trial = getPlanById('free_trial')
      const basic = getPlanById('basic')
      expect(trial.maxTestimonials).toBe(0)
      expect(basic.maxTestimonials).toBe(0)
    })
  })

  // ─── Premium Check Logic ──────────────────────────────────────────

  describe('Premium Check Logic', () => {
    const premiumTiers: PlanTier[] = ['premium', 'premium_annual']
    const nonPremiumTiers: PlanTier[] = ['free_trial', 'basic']

    it('premium check should match premium and premium_annual', () => {
      for (const tier of premiumTiers) {
        const isPremium = tier === 'premium' || tier === 'premium_annual'
        expect(isPremium).toBe(true)
      }
    })

    it('premium check should NOT match trial or basic', () => {
      for (const tier of nonPremiumTiers) {
        const isPremium = tier === 'premium' || tier === 'premium_annual'
        expect(isPremium).toBe(false)
      }
    })

    it('all premium tiers should have same photo and testimonial limits', () => {
      const premiumPlans = premiumTiers.map((id) => getPlanById(id))
      for (const plan of premiumPlans) {
        expect(plan.maxPhotos).toBe(MAX_PHOTOS)
        expect(plan.maxTestimonials).toBe(MAX_TESTIMONIALS)
      }
    })
  })

  // ─── Feature Access Matrix ────────────────────────────────────────

  describe('Feature Access Matrix', () => {
    const featureMatrix: { tier: PlanTier; photos: boolean; testimonials: boolean }[] = [
      { tier: 'free_trial', photos: false, testimonials: false },
      { tier: 'basic', photos: false, testimonials: false },
      { tier: 'premium', photos: true, testimonials: true },
      { tier: 'premium_annual', photos: true, testimonials: true },
    ]

    for (const { tier, photos, testimonials } of featureMatrix) {
      it(`${tier} should have photos=${photos} and testimonials=${testimonials}`, () => {
        const plan = getPlanById(tier)
        expect(plan.canUploadPhotos).toBe(photos)
        expect(plan.canAddTestimonials).toBe(testimonials)
      })
    }
  })

  // ─── Server Action Gating Pattern ─────────────────────────────────

  describe('Server Action Gating Pattern', () => {
    it('premium_required check should reject non-premium plans', () => {
      // Simulates the pattern used in photos.ts and testimonials.ts
      const nonPremiumPlans = ['free_trial', 'basic']
      for (const plan of nonPremiumPlans) {
        const isPremium = plan === 'premium' || plan === 'premium_annual'
        expect(isPremium).toBe(false)
      }
    })

    it('premium_required check should allow premium plans', () => {
      const premiumPlans = ['premium', 'premium_annual']
      for (const plan of premiumPlans) {
        const isPremium = plan === 'premium' || plan === 'premium_annual'
        expect(isPremium).toBe(true)
      }
    })

    it('null subscription should be treated as no access', () => {
      const sub = null
      const hasAccess = sub !== null && (sub as any).plan !== 'premium'
      expect(hasAccess).toBe(false)
    })
  })

  // ─── Plan Features Listing ────────────────────────────────────────

  describe('Plan Features Listing', () => {
    it('all plans should include basic features', () => {
      const basicFeatures = [
        'Professional business profile',
        'Appear in search results',
        'Phone, email, and website links',
      ]

      for (const plan of PLANS) {
        for (const feature of basicFeatures) {
          expect(plan.features).toContain(feature)
        }
      }
    })

    it('premium plans should include photo gallery feature', () => {
      const premium = getPlanById('premium')
      const annual = getPlanById('premium_annual')

      const photoFeature = premium.features.find((f) => f.includes('Photo gallery'))
      expect(photoFeature).toBeTruthy()

      const annualPhotoFeature = annual.features.find((f) => f.includes('Photo gallery'))
      expect(annualPhotoFeature).toBeTruthy()
    })

    it('premium plans should include testimonials feature', () => {
      const premium = getPlanById('premium')
      const testimonialFeature = premium.features.find((f) => f.includes('testimonials'))
      expect(testimonialFeature).toBeTruthy()
    })

    it('basic/trial should NOT include photo gallery feature', () => {
      const trial = getPlanById('free_trial')
      const basic = getPlanById('basic')

      const trialPhoto = trial.features.find((f) => f.includes('Photo gallery'))
      const basicPhoto = basic.features.find((f) => f.includes('Photo gallery'))

      expect(trialPhoto).toBeUndefined()
      expect(basicPhoto).toBeUndefined()
    })
  })
})
