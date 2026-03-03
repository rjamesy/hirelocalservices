/**
 * tests/contact-clicks.test.ts
 *
 * Tests for contact click tracking and canViewMetrics entitlement.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase
const mockRpc = vi.fn()
const mockFrom = vi.fn()
const mockSupabase = {
  rpc: mockRpc,
  from: mockFrom,
  auth: {
    getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null })),
  },
}

// Helper to set up ownership mock for getBusinessMetrics
function mockOwnership(ownerId = 'user-1') {
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { owner_id: ownerId }, error: null }),
      }),
    }),
  })
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

describe('Contact Click Tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('trackContactClick', () => {
    it('should call RPC with phone click type', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null })
      const { trackContactClick } = await import('@/app/actions/metrics')

      await trackContactClick('biz-1', 'phone')

      expect(mockRpc).toHaveBeenCalledWith('increment_contact_click', {
        p_business_id: 'biz-1',
        p_click_type: 'phone',
      })
    })

    it('should call RPC with email click type', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null })
      const { trackContactClick } = await import('@/app/actions/metrics')

      await trackContactClick('biz-1', 'email')

      expect(mockRpc).toHaveBeenCalledWith('increment_contact_click', {
        p_business_id: 'biz-1',
        p_click_type: 'email',
      })
    })

    it('should call RPC with website click type', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null })
      const { trackContactClick } = await import('@/app/actions/metrics')

      await trackContactClick('biz-1', 'website')

      expect(mockRpc).toHaveBeenCalledWith('increment_contact_click', {
        p_business_id: 'biz-1',
        p_click_type: 'website',
      })
    })

    it('should not throw on RPC error', async () => {
      mockRpc.mockRejectedValue(new Error('DB error'))
      const { trackContactClick } = await import('@/app/actions/metrics')

      await expect(trackContactClick('biz-1', 'phone')).resolves.not.toThrow()
    })
  })

  describe('getBusinessMetrics with click data', () => {
    it('should return click metrics from RPC', async () => {
      mockOwnership('user-1')
      mockRpc.mockResolvedValue({
        data: [{
          total_impressions: 150,
          total_views: 42,
          total_phone_clicks: 10,
          total_email_clicks: 5,
          total_website_clicks: 8,
          daily_impressions: [],
          daily_views: [],
        }],
        error: null,
      })
      const { getBusinessMetrics } = await import('@/app/actions/metrics')

      const result = await getBusinessMetrics('biz-1')

      expect(result.total_phone_clicks).toBe(10)
      expect(result.total_email_clicks).toBe(5)
      expect(result.total_website_clicks).toBe(8)
    })

    it('should return zero click metrics on error', async () => {
      mockOwnership('user-1')
      mockRpc.mockResolvedValue({ data: null, error: { message: 'error' } })
      const { getBusinessMetrics } = await import('@/app/actions/metrics')

      const result = await getBusinessMetrics('biz-1')

      expect(result.total_phone_clicks).toBe(0)
      expect(result.total_email_clicks).toBe(0)
      expect(result.total_website_clicks).toBe(0)
    })
  })
})
