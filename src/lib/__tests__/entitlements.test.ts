import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock system-settings before importing entitlements
vi.mock('@/app/actions/system-settings', () => ({
  getSettingValue: vi.fn((_key: string, fallback: number) => Promise.resolve(fallback)),
}))

// Mock supabase/server for getSettingValue internal use
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  })),
}))

import { getUserEntitlements, syncBusinessBillingStatus } from '../entitlements'

function createMockSubRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'usub-1',
    user_id: 'user-1',
    stripe_customer_id: 'cus_test',
    stripe_subscription_id: 'sub_test',
    status: 'active',
    plan: 'premium',
    stripe_price_id: 'price_premium',
    current_period_start: '2024-06-01T00:00:00Z',
    current_period_end: '2026-06-01T00:00:00Z',
    cancel_at_period_end: false,
    trial_ends_at: null,
    updated_at: '2024-06-01T00:00:00Z',
    ...overrides,
  }
}

function createMockSupabase(opts: {
  activeSub?: Record<string, unknown> | null
  canceledSub?: Record<string, unknown> | null
  businessCount?: number
} = {}) {
  const { activeSub = null, canceledSub = null, businessCount = 0 } = opts

  // Build a fully chainable mock — every method returns itself,
  // terminal methods (maybeSingle, single) resolve with data
  function buildChainable(data: unknown): any {
    const chain: any = {}
    const terminalMethods = ['maybeSingle', 'single']
    const chainingMethods = ['select', 'eq', 'neq', 'order', 'limit', 'range', 'in', 'ilike']

    for (const m of terminalMethods) {
      chain[m] = vi.fn(() => Promise.resolve({ data, error: null }))
    }
    for (const m of chainingMethods) {
      chain[m] = vi.fn(() => chain)
    }
    // Also make it thenable for direct await (count queries)
    chain.then = vi.fn((resolve: (val: unknown) => void) =>
      resolve({ data: null, count: data, error: null })
    )
    return chain
  }

  // Track call count to differentiate first vs second user_subscriptions query
  let userSubCallCount = 0

  return {
    from: vi.fn((table: string) => {
      if (table === 'user_subscriptions') {
        userSubCallCount++
        // First call: look for active sub (neq 'canceled')
        // Second call: look for canceled sub (eq 'canceled')
        if (userSubCallCount === 1) {
          return buildChainable(activeSub)
        }
        return buildChainable(canceledSub)
      }
      if (table === 'businesses') {
        return {
          select: vi.fn(() => buildChainable(businessCount)),
          update: vi.fn(() => buildChainable(null)),
        }
      }
      return buildChainable(null)
    }),
  }
}

describe('getUserEntitlements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null plan when no subscription exists', async () => {
    const supabase = createMockSupabase()
    const result = await getUserEntitlements(supabase, 'user-1')

    expect(result.plan).toBeNull()
    expect(result.isActive).toBe(false)
    expect(result.canPublish).toBe(false)
    expect(result.canUploadPhotos).toBe(false)
    expect(result.maxListings).toBe(1)
    expect(result.effectiveState).toBe('blocked')
    expect(result.reasonCodes).toContain('no_subscription')
  })

  it('returns active premium entitlements', async () => {
    const sub = createMockSubRow({ status: 'active', plan: 'premium' })
    const supabase = createMockSupabase({ activeSub: sub, businessCount: 2 })
    const result = await getUserEntitlements(supabase, 'user-1')

    expect(result.plan).toBe('premium')
    expect(result.isActive).toBe(true)
    expect(result.canPublish).toBe(true)
    expect(result.canUploadPhotos).toBe(true)
    expect(result.canAddTestimonials).toBe(true)
    expect(result.maxPhotos).toBe(10)
    expect(result.maxTestimonials).toBe(20)
    expect(result.maxListings).toBe(10)
    expect(result.currentListingCount).toBe(2)
    expect(result.canClaimMore).toBe(true)
    expect(result.effectiveState).toBe('ok')
  })

  it('returns blocked state for canceled subscription', async () => {
    const sub = createMockSubRow({
      status: 'canceled',
      plan: 'basic',
      current_period_end: '2020-01-01T00:00:00Z', // in the past
    })
    const supabase = createMockSupabase({ canceledSub: sub })
    const result = await getUserEntitlements(supabase, 'user-1')

    expect(result.isActive).toBe(false)
    expect(result.canPublish).toBe(false)
    expect(result.effectiveState).toBe('blocked')
  })

  it('canClaimMore is false when at listing limit', async () => {
    const sub = createMockSubRow({ status: 'active', plan: 'basic' })
    const supabase = createMockSupabase({ activeSub: sub, businessCount: 1 })
    const result = await getUserEntitlements(supabase, 'user-1')

    expect(result.maxListings).toBe(1) // basic = 1
    expect(result.currentListingCount).toBe(1)
    expect(result.canClaimMore).toBe(false)
  })

  it('canEdit is always true (drafts allowed)', async () => {
    const supabase = createMockSupabase()
    const result = await getUserEntitlements(supabase, 'user-1')

    expect(result.canEdit).toBe(true)
  })

  it('returns trial entitlements for free_trial plan', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const sub = createMockSubRow({
      status: 'active',
      plan: 'free_trial',
      trial_ends_at: futureDate,
      current_period_end: futureDate,
    })
    const supabase = createMockSupabase({ activeSub: sub })
    const result = await getUserEntitlements(supabase, 'user-1')

    expect(result.isTrial).toBe(true)
    expect(result.isActive).toBe(true)
    expect(result.canPublish).toBe(true)
    expect(result.canUploadPhotos).toBe(false) // free_trial has no photos
  })

  it('blocks when trial has expired', async () => {
    const pastDate = '2020-01-01T00:00:00Z'
    const sub = createMockSubRow({
      status: 'active',
      plan: 'free_trial',
      trial_ends_at: pastDate,
      current_period_end: pastDate,
    })
    const supabase = createMockSupabase({ activeSub: sub })
    const result = await getUserEntitlements(supabase, 'user-1')

    expect(result.isActive).toBe(false)
    expect(result.effectiveState).toBe('blocked')
    expect(result.reasonCodes).toContain('trial_expired')
  })

  it('returns exactly one active subscription after repair (unique per user)', async () => {
    // After migration repair, only one non-canceled row per user
    const sub = createMockSubRow({ status: 'active', plan: 'premium' })
    const supabase = createMockSupabase({ activeSub: sub, businessCount: 1 })
    const result = await getUserEntitlements(supabase, 'user-1')

    // Should have exactly one plan, not duplicates
    expect(result.plan).toBe('premium')
    expect(result.isActive).toBe(true)
    expect(result.subscriptionStatus).toBe('active')
  })
})

describe('syncBusinessBillingStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets billing_status to active for active premium', async () => {
    const sub = createMockSubRow({ status: 'active', plan: 'premium' })
    const updateMock = vi.fn(() => {
      const chain: any = {}
      const methods = ['eq', 'neq', 'select', 'order', 'limit', 'range']
      for (const m of methods) chain[m] = vi.fn(() => chain)
      chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
      chain.then = vi.fn((resolve: (val: unknown) => void) => resolve({ error: null }))
      return chain
    })

    const supabase = createMockSupabase({ activeSub: sub, businessCount: 1 })
    // Override the businesses `update` specifically
    const origFrom = supabase.from
    supabase.from = vi.fn((table: string) => {
      if (table === 'businesses') {
        const chain = origFrom(table)
        chain.update = updateMock
        return chain
      }
      return origFrom(table)
    })

    await syncBusinessBillingStatus(supabase, 'user-1')
    expect(updateMock).toHaveBeenCalledWith({ billing_status: 'active' })
  })
})
