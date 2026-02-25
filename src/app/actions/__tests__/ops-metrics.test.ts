import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'
import { mockUser } from '@/__tests__/helpers/test-data'

const { client: mockSupabase, single, rpc } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

import {
  getSubscriptionMetrics,
  getListingMetrics,
  getModerationMetrics,
} from '../ops-metrics'

function setupAdmin() {
  mockSupabase.auth.getUser.mockResolvedValue({
    data: { user: mockUser },
    error: null,
  })
  // admin profile check
  single.mockResolvedValueOnce({
    data: { role: 'admin' },
    error: null,
  })
}

// ─── getSubscriptionMetrics ────────────────────────────────────────

describe('getSubscriptionMetrics', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('requires admin', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authed' },
    })
    await expect(getSubscriptionMetrics()).rejects.toThrow('logged in')
  })

  it('calls supabase.rpc with get_subscription_metrics', async () => {
    setupAdmin()

    const mockData = { total_subscriptions: 42, active: 35, canceled: 7 }
    rpc.mockResolvedValueOnce({ data: mockData, error: null })

    const result = await getSubscriptionMetrics(30)
    expect(result).toEqual(mockData)
    expect(rpc).toHaveBeenCalledWith('get_subscription_metrics', { p_days: 30 })
  })

  it('returns null on error', async () => {
    setupAdmin()

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })

    const result = await getSubscriptionMetrics()
    expect(result).toBeNull()
  })
})

// ─── getListingMetrics ─────────────────────────────────────────────

describe('getListingMetrics', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('requires admin', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { role: 'business' },
      error: null,
    })
    await expect(getListingMetrics()).rejects.toThrow('admin')
  })

  it('calls supabase.rpc with get_listing_metrics', async () => {
    setupAdmin()

    const mockData = { total_listings: 100, published: 80, draft: 20 }
    rpc.mockResolvedValueOnce({ data: mockData, error: null })

    const result = await getListingMetrics(60)
    expect(result).toEqual(mockData)
    expect(rpc).toHaveBeenCalledWith('get_listing_metrics', { p_days: 60 })
  })

  it('returns null on error', async () => {
    setupAdmin()

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })

    const result = await getListingMetrics()
    expect(result).toBeNull()
  })
})

// ─── getModerationMetrics ──────────────────────────────────────────

describe('getModerationMetrics', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('requires admin', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authed' },
    })
    await expect(getModerationMetrics()).rejects.toThrow('logged in')
  })

  it('calls supabase.rpc with get_moderation_metrics', async () => {
    setupAdmin()

    const mockData = { open_reports: 5, resolved_reports: 15 }
    rpc.mockResolvedValueOnce({ data: mockData, error: null })

    const result = await getModerationMetrics(90)
    expect(result).toEqual(mockData)
    expect(rpc).toHaveBeenCalledWith('get_moderation_metrics', { p_days: 90 })
  })

  it('returns null on error', async () => {
    setupAdmin()

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })

    const result = await getModerationMetrics()
    expect(result).toBeNull()
  })
})
