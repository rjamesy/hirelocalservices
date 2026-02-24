import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'
import { mockUser } from '@/__tests__/helpers/test-data'

const { client: mockSupabase, single, maybeSingle } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

const mockStripe = vi.hoisted(() => ({
  customers: {
    create: vi.fn(() => Promise.resolve({ id: 'cus_new' })),
  },
  checkout: {
    sessions: {
      create: vi.fn(() => Promise.resolve({ url: 'https://checkout.stripe.com/session' })),
    },
  },
}))

vi.mock('@/lib/stripe', () => ({
  stripe: mockStripe,
}))

import { POST } from '@/app/api/stripe/checkout/route'

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/stripe/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/stripe/checkout', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.STRIPE_PRICE_ID_BASIC = 'price_basic'
    process.env.STRIPE_PRICE_ID_PREMIUM = 'price_premium'
    process.env.STRIPE_PRICE_ID_FREE_TRIAL = 'price_free_trial'
    process.env.STRIPE_PRICE_ID_ANNUAL = 'price_annual'
  })

  afterEach(() => {
    delete process.env.STRIPE_PRICE_ID_BASIC
    delete process.env.STRIPE_PRICE_ID_PREMIUM
    delete process.env.STRIPE_PRICE_ID_FREE_TRIAL
    delete process.env.STRIPE_PRICE_ID_ANNUAL
  })

  it('returns 401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authed' },
    })

    const response = await POST(makeRequest({ planId: 'basic' }))
    expect(response.status).toBe(401)
  })

  it('resolves planId to priceId', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    // user_subscriptions check - no existing
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // profile for email
    single.mockResolvedValueOnce({
      data: { email: 'user@test.com' },
      error: null,
    })

    const response = await POST(makeRequest({ planId: 'basic' }))
    const json = await response.json()
    expect(json.url).toBe('https://checkout.stripe.com/session')
  })

  it('returns 400 for invalid price', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })

    const response = await POST(makeRequest({ priceId: 'price_invalid' }))
    expect(response.status).toBe(400)
  })

  it('returns 400 when no priceId or planId', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })

    const response = await POST(makeRequest({}))
    expect(response.status).toBe(400)
  })

  it('returns 400 when active subscription exists', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    // user_subscriptions check - active subscription exists
    maybeSingle.mockResolvedValueOnce({
      data: { id: 'sub-1', stripe_customer_id: 'cus_123', status: 'active' },
      error: null,
    })

    const response = await POST(makeRequest({ priceId: 'price_basic' }))
    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.error).toContain('active subscription')
  })

  it('creates customer if no existing one', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    // user_subscriptions check - no existing
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // profile for email
    single.mockResolvedValueOnce({
      data: { email: 'user@test.com' },
      error: null,
    })

    await POST(makeRequest({ priceId: 'price_basic' }))
    expect(mockStripe.customers.create).toHaveBeenCalled()
  })

  it('adds trial_period_days for free_trial plan', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    // user_subscriptions check - no existing
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // profile for email
    single.mockResolvedValueOnce({
      data: { email: 'user@test.com' },
      error: null,
    })

    await POST(makeRequest({ planId: 'free_trial' }))
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_data: expect.objectContaining({
          trial_period_days: 30,
        }),
      })
    )
  })

  it('returns checkout URL for canceled subscription', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    // user_subscriptions check - canceled subscription with stripe customer
    maybeSingle.mockResolvedValueOnce({
      data: { id: 'sub-1', stripe_customer_id: 'cus_123', status: 'canceled' },
      error: null,
    })

    const response = await POST(makeRequest({ priceId: 'price_premium' }))
    const json = await response.json()
    expect(json.url).toBe('https://checkout.stripe.com/session')
  })
})
