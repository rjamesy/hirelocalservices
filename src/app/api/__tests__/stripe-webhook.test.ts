import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'

const { client: mockAdminSupabase, upsert, update, eq } = createMockSupabaseClient()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockAdminSupabase),
}))

const mockConstructEvent = vi.fn()
const mockSubscriptionsRetrieve = vi.fn()

vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
    subscriptions: {
      retrieve: (...args: unknown[]) => mockSubscriptionsRetrieve(...args),
    },
  },
}))

import { POST } from '@/app/api/stripe/webhook/route'

function makeWebhookRequest(body: string, signature = 'sig_test') {
  return new NextRequest('http://localhost:3000/api/stripe/webhook', {
    method: 'POST',
    body,
    headers: {
      'stripe-signature': signature,
    },
  })
}

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  })

  afterEach(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET
  })

  it('returns 400 when stripe-signature header is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/stripe/webhook', {
      method: 'POST',
      body: '{}',
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.error).toContain('Missing Stripe signature')
  })

  it('returns 500 when webhook secret is not set', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET
    const response = await POST(makeWebhookRequest('{}'))
    expect(response.status).toBe(500)
  })

  it('returns 400 when signature verification fails', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Invalid signature')
    })
    const response = await POST(makeWebhookRequest('{}'))
    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.error).toContain('verification failed')
  })

  it('handles checkout.session.completed event', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          subscription: 'sub_123',
          customer: 'cus_123',
          metadata: { business_id: 'biz-123', plan_tier: 'premium' },
        },
      },
    })
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_123',
      status: 'active',
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_premium' } }] },
    })

    const response = await POST(makeWebhookRequest('{}'))
    expect(response.status).toBe(200)
    expect(mockAdminSupabase.from).toHaveBeenCalledWith('subscriptions')
  })

  it('maps trialing status to active', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          subscription: 'sub_123',
          customer: 'cus_123',
          metadata: { business_id: 'biz-123', plan_tier: 'free_trial' },
        },
      },
    })
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_123',
      status: 'trialing',
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_free' } }] },
    })

    const response = await POST(makeWebhookRequest('{}'))
    expect(response.status).toBe(200)
    // The upsert should have status 'active' for trialing
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
      expect.any(Object)
    )
  })

  it('handles customer.subscription.updated event', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          status: 'active',
          metadata: { business_id: 'biz-123', plan_tier: 'premium' },
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          cancel_at_period_end: false,
          items: { data: [{ price: { id: 'price_premium' } }] },
        },
      },
    })

    const response = await POST(makeWebhookRequest('{}'))
    expect(response.status).toBe(200)
  })

  it('maps past_due subscription status', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          status: 'past_due',
          metadata: { business_id: 'biz-123' },
          current_period_end: Math.floor(Date.now() / 1000),
          cancel_at_period_end: false,
          items: { data: [{ price: { id: 'price_basic' } }] },
        },
      },
    })

    const response = await POST(makeWebhookRequest('{}'))
    expect(response.status).toBe(200)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'past_due' })
    )
  })

  it('handles customer.subscription.deleted event', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_123',
          metadata: { business_id: 'biz-123' },
        },
      },
    })

    const response = await POST(makeWebhookRequest('{}'))
    expect(response.status).toBe(200)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'canceled' })
    )
  })

  it('handles invoice.payment_failed event', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: {
        object: {
          subscription: 'sub_123',
        },
      },
    })

    const response = await POST(makeWebhookRequest('{}'))
    expect(response.status).toBe(200)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'past_due' })
    )
  })

  it('returns 200 for unhandled event types', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'some.unknown.event',
      data: { object: {} },
    })

    const response = await POST(makeWebhookRequest('{}'))
    expect(response.status).toBe(200)
  })

  it('returns 200 even on processing errors', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          subscription: 'sub_123',
          customer: 'cus_123',
          metadata: { business_id: 'biz-123' },
        },
      },
    })
    mockSubscriptionsRetrieve.mockRejectedValue(new Error('Stripe API error'))

    const response = await POST(makeWebhookRequest('{}'))
    expect(response.status).toBe(200)
  })

  it('ignores non-subscription checkout sessions', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'payment',
          metadata: { business_id: 'biz-123' },
        },
      },
    })

    const response = await POST(makeWebhookRequest('{}'))
    expect(response.status).toBe(200)
    // Should not have called upsert since mode !== 'subscription'
    expect(upsert).not.toHaveBeenCalled()
  })

  it('uses subscription_data fallback for business_id lookup', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          status: 'canceled',
          metadata: {},
          current_period_end: Math.floor(Date.now() / 1000),
          cancel_at_period_end: false,
          items: { data: [{ price: { id: 'price_basic' } }] },
        },
      },
    })
    // First update by stripe_subscription_id fails
    eq.mockReturnValueOnce(
      Promise.resolve({ data: null, error: { message: 'Not found' } })
    )

    const response = await POST(makeWebhookRequest('{}'))
    expect(response.status).toBe(200)
  })
})
