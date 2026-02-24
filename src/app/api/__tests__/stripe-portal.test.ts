import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'
import { mockUser } from '@/__tests__/helpers/test-data'

const { client: mockSupabase, single, maybeSingle } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    billingPortal: {
      sessions: {
        create: vi.fn(() =>
          Promise.resolve({ url: 'https://billing.stripe.com/portal' })
        ),
      },
    },
  },
}))

import { POST } from '@/app/api/stripe/portal/route'

function makeRequest() {
  return new NextRequest('http://localhost:3000/api/stripe/portal', {
    method: 'POST',
  })
}

describe('POST /api/stripe/portal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authed' },
    })

    const response = await POST(makeRequest())
    expect(response.status).toBe(401)
  })

  it('returns 400 when no subscription found', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    // user_subscriptions query returns null
    maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    })

    const response = await POST(makeRequest())
    expect(response.status).toBe(400)
  })

  it('returns 400 when no stripe customer ID', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    // user_subscriptions query returns record without stripe_customer_id
    maybeSingle.mockResolvedValueOnce({
      data: { stripe_customer_id: null },
      error: null,
    })

    const response = await POST(makeRequest())
    expect(response.status).toBe(400)
  })

  it('returns portal URL on success', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    // user_subscriptions query returns valid record
    maybeSingle.mockResolvedValueOnce({
      data: { stripe_customer_id: 'cus_123' },
      error: null,
    })

    const response = await POST(makeRequest())
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.url).toBe('https://billing.stripe.com/portal')
  })

  it('returns 400 when subscription query errors', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    // user_subscriptions query errors
    maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'DB error' },
    })

    const response = await POST(makeRequest())
    expect(response.status).toBe(400)
  })
})
