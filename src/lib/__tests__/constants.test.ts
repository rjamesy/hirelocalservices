import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  PLANS,
  getPlanById,
  getPlanByPriceId,
  getValidPriceIds,
  AU_STATES,
  RADIUS_OPTIONS,
  MAX_PHOTOS,
  MAX_TESTIMONIALS,
  ITEMS_PER_PAGE,
  GRACE_PERIOD_DAYS,
} from '../constants'

// ─── PLANS ──────────────────────────────────────────────────────────

describe('PLANS', () => {
  it('has 3 plan tiers', () => {
    expect(PLANS).toHaveLength(3)
  })

  it('has correct plan IDs', () => {
    const ids = PLANS.map((p) => p.id)
    expect(ids).toEqual(['basic', 'premium', 'premium_annual'])
  })

  it('basic plan costs $4/month', () => {
    const plan = PLANS.find((p) => p.id === 'basic')!
    expect(plan.price).toBe(4)
    expect(plan.interval).toBe('month')
  })

  it('premium plan costs $10/month', () => {
    const plan = PLANS.find((p) => p.id === 'premium')!
    expect(plan.price).toBe(10)
    expect(plan.interval).toBe('month')
  })

  it('premium_annual costs $99/year', () => {
    const plan = PLANS.find((p) => p.id === 'premium_annual')!
    expect(plan.price).toBe(99)
    expect(plan.interval).toBe('year')
  })

  it('basic cannot upload photos', () => {
    expect(PLANS.find((p) => p.id === 'basic')!.canUploadPhotos).toBe(false)
  })

  it('premium plans can upload photos', () => {
    expect(PLANS.find((p) => p.id === 'premium')!.canUploadPhotos).toBe(true)
    expect(PLANS.find((p) => p.id === 'premium_annual')!.canUploadPhotos).toBe(true)
  })

  it('basic cannot add testimonials', () => {
    expect(PLANS.find((p) => p.id === 'basic')!.canAddTestimonials).toBe(false)
  })

  it('premium plans can add testimonials', () => {
    expect(PLANS.find((p) => p.id === 'premium')!.canAddTestimonials).toBe(true)
    expect(PLANS.find((p) => p.id === 'premium_annual')!.canAddTestimonials).toBe(true)
  })

  it('each plan has features array', () => {
    for (const plan of PLANS) {
      expect(Array.isArray(plan.features)).toBe(true)
      expect(plan.features.length).toBeGreaterThan(0)
    }
  })

  it('basic and premium have 30-day trial', () => {
    expect(PLANS.find((p) => p.id === 'basic')!.trialDays).toBe(30)
    expect(PLANS.find((p) => p.id === 'premium')!.trialDays).toBe(30)
  })

  it('premium_annual has no trial', () => {
    expect(PLANS.find((p) => p.id === 'premium_annual')!.trialDays).toBe(0)
  })
})

// ─── getPlanByPriceId ───────────────────────────────────────────────

describe('getPlanByPriceId', () => {
  afterEach(() => {
    delete process.env.STRIPE_PRICE_ID_BASIC
    delete process.env.STRIPE_PRICE_ID_PREMIUM
  })

  it('returns matching plan when env var is set', () => {
    process.env.STRIPE_PRICE_ID_BASIC = 'price_basic_123'
    const plan = getPlanByPriceId('price_basic_123')
    expect(plan).toBeDefined()
    expect(plan!.id).toBe('basic')
  })

  it('returns undefined for unknown price ID', () => {
    expect(getPlanByPriceId('price_unknown')).toBeUndefined()
  })

  it('returns undefined when no env vars are set', () => {
    expect(getPlanByPriceId('anything')).toBeUndefined()
  })
})

// ─── getPlanById ────────────────────────────────────────────────────

describe('getPlanById', () => {
  it('returns basic plan', () => {
    expect(getPlanById('basic').id).toBe('basic')
  })

  it('returns premium plan', () => {
    expect(getPlanById('premium').id).toBe('premium')
  })

  it('returns premium_annual plan', () => {
    expect(getPlanById('premium_annual').id).toBe('premium_annual')
  })

  it('defaults to basic for unknown tier', () => {
    expect(getPlanById('nonexistent' as any).id).toBe('basic')
  })
})

// ─── getValidPriceIds ───────────────────────────────────────────────

describe('getValidPriceIds', () => {
  afterEach(() => {
    delete process.env.STRIPE_PRICE_ID_BASIC
    delete process.env.STRIPE_PRICE_ID_PREMIUM
    delete process.env.STRIPE_PRICE_ID_ANNUAL
  })

  it('returns price IDs from env vars', () => {
    process.env.STRIPE_PRICE_ID_BASIC = 'price_b'
    process.env.STRIPE_PRICE_ID_PREMIUM = 'price_p'
    const ids = getValidPriceIds()
    expect(ids).toContain('price_b')
    expect(ids).toContain('price_p')
  })

  it('filters out undefined env vars', () => {
    process.env.STRIPE_PRICE_ID_BASIC = 'price_b'
    const ids = getValidPriceIds()
    expect(ids).toHaveLength(1)
    expect(ids[0]).toBe('price_b')
  })

  it('returns empty array when no env vars set', () => {
    expect(getValidPriceIds()).toHaveLength(0)
  })
})

// ─── Static Constants ───────────────────────────────────────────────

describe('static constants', () => {
  it('MAX_PHOTOS is 10', () => {
    expect(MAX_PHOTOS).toBe(10)
  })

  it('MAX_TESTIMONIALS is 20', () => {
    expect(MAX_TESTIMONIALS).toBe(20)
  })

  it('ITEMS_PER_PAGE is 20', () => {
    expect(ITEMS_PER_PAGE).toBe(20)
  })

  it('AU_STATES has 8 entries', () => {
    expect(AU_STATES).toHaveLength(8)
  })

  it('RADIUS_OPTIONS has 4 entries', () => {
    expect(RADIUS_OPTIONS).toHaveLength(4)
  })

  it('GRACE_PERIOD_DAYS is 7', () => {
    expect(GRACE_PERIOD_DAYS).toBe(7)
  })
})
