import { describe, it, expect, vi } from 'vitest'
import { computeCheckoutGate, checkPlanSufficiency } from '../required-plan'
import type { CheckoutGateResult } from '../required-plan'

// ─── Mock Supabase helpers ──────────────────────────────────────────

function createMockSupabase(
  otherListingsCount: number,
  photoCount: number,
  testimonialCount: number
) {
  let callIndex = 0
  const results = [
    { count: otherListingsCount }, // businesses
    { count: photoCount },         // photos
    { count: testimonialCount },   // testimonials
  ]

  // Each chain method returns a thenable that also supports further chaining.
  // This mirrors Supabase's PostgREST builder where every method returns
  // a PromiseLike, and awaiting resolves at whatever point the chain ends.
  function buildChainable(): any {
    const currentIndex = callIndex++
    const resolved = results[currentIndex]

    function makeThenable(): any {
      const obj: any = {
        then: (resolve: any, reject?: any) => Promise.resolve(resolved).then(resolve, reject),
      }
      obj.select = vi.fn(() => makeThenable())
      obj.eq = vi.fn(() => makeThenable())
      obj.neq = vi.fn(() => makeThenable())
      obj.is = vi.fn(() => makeThenable())
      return obj
    }

    return makeThenable()
  }

  return {
    from: vi.fn(() => buildChainable()),
  }
}

// ─── computeCheckoutGate ────────────────────────────────────────────

describe('computeCheckoutGate', () => {
  const userId = 'user-1'
  const listingId = 'biz-1'

  // Test 1: L=1, no content → 3 plans, basic
  it('returns 3 plans + basic when single listing, no content', async () => {
    const supabase = createMockSupabase(0, 0, 0)
    const result = await computeCheckoutGate(supabase, userId, listingId)
    expect(result.minimumPlan).toBe('basic')
    expect(result.allowedPlans).toEqual(['basic', 'premium', 'premium_annual'])
    expect(result.reasons).toEqual([])
    expect(result.otherListingsCount).toBe(0)
    expect(result.photoCount).toBe(0)
    expect(result.testimonialCount).toBe(0)
  })

  // Test 2: L=1, has photos → 2 plans, premium
  it('returns 2 plans + premium when single listing with photos', async () => {
    const supabase = createMockSupabase(0, 3, 0)
    const result = await computeCheckoutGate(supabase, userId, listingId)
    expect(result.minimumPlan).toBe('premium')
    expect(result.allowedPlans).toEqual(['premium', 'premium_annual'])
    expect(result.reasons).toEqual(['photos_or_testimonials'])
  })

  // Test 3: L=1, has testimonials → 2 plans, premium
  it('returns 2 plans + premium when single listing with testimonials', async () => {
    const supabase = createMockSupabase(0, 0, 2)
    const result = await computeCheckoutGate(supabase, userId, listingId)
    expect(result.minimumPlan).toBe('premium')
    expect(result.allowedPlans).toEqual(['premium', 'premium_annual'])
    expect(result.reasons).toEqual(['photos_or_testimonials'])
  })

  // Test 4: L=1, has photos + testimonials → 2 plans, premium
  it('returns 2 plans + premium when single listing with both photos and testimonials', async () => {
    const supabase = createMockSupabase(0, 5, 3)
    const result = await computeCheckoutGate(supabase, userId, listingId)
    expect(result.minimumPlan).toBe('premium')
    expect(result.allowedPlans).toEqual(['premium', 'premium_annual'])
    expect(result.reasons).toEqual(['photos_or_testimonials'])
  })

  // Test 5: L=2+, no content → 2 plans, premium (multi-listing forces premium)
  it('returns 2 plans + premium when multiple listings, no content', async () => {
    const supabase = createMockSupabase(1, 0, 0)
    const result = await computeCheckoutGate(supabase, userId, listingId)
    expect(result.minimumPlan).toBe('premium')
    expect(result.allowedPlans).toEqual(['premium', 'premium_annual'])
    expect(result.reasons).toEqual(['multiple_listings'])
    expect(result.otherListingsCount).toBe(1)
  })

  // Test 6: L=2+, has content → 2 plans, both reasons
  it('returns 2 plans with both reasons when multiple listings + content', async () => {
    const supabase = createMockSupabase(2, 1, 1)
    const result = await computeCheckoutGate(supabase, userId, listingId)
    expect(result.minimumPlan).toBe('premium')
    expect(result.allowedPlans).toEqual(['premium', 'premium_annual'])
    expect(result.reasons).toEqual(['multiple_listings', 'photos_or_testimonials'])
  })

  // Test 7: null counts treated as 0
  it('treats null counts as 0', async () => {
    const supabase = createMockSupabase(
      null as unknown as number,
      null as unknown as number,
      null as unknown as number
    )
    const result = await computeCheckoutGate(supabase, userId, listingId)
    expect(result.minimumPlan).toBe('basic')
    expect(result.allowedPlans).toEqual(['basic', 'premium', 'premium_annual'])
    expect(result.otherListingsCount).toBe(0)
    expect(result.photoCount).toBe(0)
    expect(result.testimonialCount).toBe(0)
  })

  // Test 8: returnTo is correctly built
  it('builds correct returnTo URL', async () => {
    const supabase = createMockSupabase(0, 0, 0)
    const result = await computeCheckoutGate(supabase, userId, 'abc-123')
    expect(result.returnTo).toBe('/dashboard/listing?bid=abc-123&step=preview')
  })

  // Test 9: queries correct tables
  it('queries businesses, photos, and testimonials tables', async () => {
    const supabase = createMockSupabase(0, 0, 0)
    await computeCheckoutGate(supabase, userId, listingId)
    expect(supabase.from).toHaveBeenCalledWith('businesses')
    expect(supabase.from).toHaveBeenCalledWith('photos')
    expect(supabase.from).toHaveBeenCalledWith('testimonials')
  })
})

// ─── checkPlanSufficiency ───────────────────────────────────────────

describe('checkPlanSufficiency', () => {
  // Helper to build a minimal gate result
  function gate(overrides: Partial<CheckoutGateResult> = {}): CheckoutGateResult {
    return {
      allowedPlans: ['basic', 'premium', 'premium_annual'],
      minimumPlan: 'basic',
      reasons: [],
      otherListingsCount: 0,
      photoCount: 0,
      testimonialCount: 0,
      returnTo: '/dashboard/listing?bid=test&step=preview',
      ...overrides,
    }
  }

  // Sufficient cases
  it('returns null when basic plan meets basic minimum', () => {
    expect(checkPlanSufficiency('basic', gate({ minimumPlan: 'basic' }))).toBeNull()
  })

  it('returns null when premium plan meets basic minimum', () => {
    expect(checkPlanSufficiency('premium', gate({ minimumPlan: 'basic' }))).toBeNull()
  })

  it('returns null when premium plan meets premium minimum', () => {
    expect(checkPlanSufficiency('premium', gate({ minimumPlan: 'premium' }))).toBeNull()
  })

  it('returns null when premium_annual plan meets premium minimum', () => {
    expect(checkPlanSufficiency('premium_annual', gate({ minimumPlan: 'premium' }))).toBeNull()
  })

  it('returns null when premium_annual plan meets basic minimum', () => {
    expect(checkPlanSufficiency('premium_annual', gate({ minimumPlan: 'basic' }))).toBeNull()
  })

  // SUBSCRIPTION_REQUIRED cases
  it('returns SUBSCRIPTION_REQUIRED when no plan and basic minimum', () => {
    const g = gate({ minimumPlan: 'basic' })
    const result = checkPlanSufficiency(null, g)
    expect(result).not.toBeNull()
    expect(result!.code).toBe('SUBSCRIPTION_REQUIRED')
    expect(result!.currentPlan).toBeNull()
    expect(result!.minimumPlan).toBe('basic')
    expect(result!.allowedPlans).toEqual(['basic', 'premium', 'premium_annual'])
    expect(result!.reasons).toEqual([])
  })

  it('returns SUBSCRIPTION_REQUIRED when no plan and premium minimum', () => {
    const g = gate({
      minimumPlan: 'premium',
      allowedPlans: ['premium', 'premium_annual'],
      reasons: ['photos_or_testimonials'],
    })
    const result = checkPlanSufficiency(null, g)
    expect(result).not.toBeNull()
    expect(result!.code).toBe('SUBSCRIPTION_REQUIRED')
    expect(result!.currentPlan).toBeNull()
    expect(result!.minimumPlan).toBe('premium')
    expect(result!.allowedPlans).toEqual(['premium', 'premium_annual'])
    expect(result!.reasons).toEqual(['photos_or_testimonials'])
  })

  // UPGRADE_REQUIRED case
  it('returns UPGRADE_REQUIRED when basic plan needs premium', () => {
    const g = gate({
      minimumPlan: 'premium',
      allowedPlans: ['premium', 'premium_annual'],
      reasons: ['multiple_listings'],
    })
    const result = checkPlanSufficiency('basic', g)
    expect(result).not.toBeNull()
    expect(result!.code).toBe('UPGRADE_REQUIRED')
    expect(result!.currentPlan).toBe('basic')
    expect(result!.minimumPlan).toBe('premium')
    expect(result!.allowedPlans).toEqual(['premium', 'premium_annual'])
    expect(result!.reasons).toEqual(['multiple_listings'])
  })
})
