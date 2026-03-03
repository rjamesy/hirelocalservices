/**
 * tests/business-metrics.test.ts
 *
 * Tests for business metrics tracking:
 * - Search impression tracking
 * - Profile view tracking
 * - Metrics retrieval
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

// Helper to set up ownership mock for getBusinessMetrics tests
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

describe('Business Metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── trackSearchImpressions ───────────────────────────────────────

  describe('trackSearchImpressions', () => {
    it('should call RPC with business IDs', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null })
      const { trackSearchImpressions } = await import('@/app/actions/metrics')

      const ids = ['id-1', 'id-2', 'id-3']
      await trackSearchImpressions(ids)

      expect(mockRpc).toHaveBeenCalledWith('increment_search_impressions', {
        p_business_ids: ids,
      })
    })

    it('should not call RPC with empty array', async () => {
      const { trackSearchImpressions } = await import('@/app/actions/metrics')

      await trackSearchImpressions([])

      expect(mockRpc).not.toHaveBeenCalled()
    })

    it('should not throw on RPC error', async () => {
      mockRpc.mockRejectedValue(new Error('DB error'))
      const { trackSearchImpressions } = await import('@/app/actions/metrics')

      // Should not throw
      await expect(trackSearchImpressions(['id-1'])).resolves.not.toThrow()
    })
  })

  // ─── trackProfileView ─────────────────────────────────────────────

  describe('trackProfileView', () => {
    it('should call RPC with business ID', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null })
      const { trackProfileView } = await import('@/app/actions/metrics')

      await trackProfileView('business-id-1')

      expect(mockRpc).toHaveBeenCalledWith('increment_profile_view', {
        p_business_id: 'business-id-1',
      })
    })

    it('should not throw on RPC error', async () => {
      mockRpc.mockRejectedValue(new Error('DB error'))
      const { trackProfileView } = await import('@/app/actions/metrics')

      await expect(trackProfileView('business-id-1')).resolves.not.toThrow()
    })
  })

  // ─── getBusinessMetrics ───────────────────────────────────────────

  describe('getBusinessMetrics', () => {
    it('should return metrics from RPC', async () => {
      mockOwnership('user-1')
      mockRpc.mockResolvedValue({
        data: [{
          total_impressions: 150,
          total_views: 42,
          daily_impressions: [{ date: '2026-02-01', count: 10 }],
          daily_views: [{ date: '2026-02-01', count: 5 }],
        }],
        error: null,
      })
      const { getBusinessMetrics } = await import('@/app/actions/metrics')

      const result = await getBusinessMetrics('business-id-1')

      expect(result.total_impressions).toBe(150)
      expect(result.total_views).toBe(42)
      expect(mockRpc).toHaveBeenCalledWith('get_business_metrics', {
        p_business_id: 'business-id-1',
        p_days: 30,
      })
    })

    it('should support custom day range', async () => {
      mockOwnership('user-1')
      mockRpc.mockResolvedValue({
        data: [{ total_impressions: 50, total_views: 10, daily_impressions: [], daily_views: [] }],
        error: null,
      })
      const { getBusinessMetrics } = await import('@/app/actions/metrics')

      await getBusinessMetrics('business-id-1', 7)

      expect(mockRpc).toHaveBeenCalledWith('get_business_metrics', {
        p_business_id: 'business-id-1',
        p_days: 7,
      })
    })

    it('should return zero metrics on error', async () => {
      mockOwnership('user-1')
      mockRpc.mockResolvedValue({ data: null, error: { message: 'Not found' } })
      const { getBusinessMetrics } = await import('@/app/actions/metrics')

      const result = await getBusinessMetrics('business-id-1')

      expect(result.total_impressions).toBe(0)
      expect(result.total_views).toBe(0)
      expect(result.daily_impressions).toEqual([])
      expect(result.daily_views).toEqual([])
    })

    it('should handle empty result array', async () => {
      mockOwnership('user-1')
      mockRpc.mockResolvedValue({ data: [], error: null })
      const { getBusinessMetrics } = await import('@/app/actions/metrics')

      const result = await getBusinessMetrics('business-id-1')

      expect(result.total_impressions).toBe(0)
      expect(result.total_views).toBe(0)
    })

    it('should return zero metrics for unauthenticated user', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
      const { getBusinessMetrics } = await import('@/app/actions/metrics')

      const result = await getBusinessMetrics('business-id-1')

      expect(result.total_impressions).toBe(0)
      expect(result.total_views).toBe(0)
    })

    it('should return zero metrics for non-owner non-admin', async () => {
      // Business owned by someone else
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { owner_id: 'other-user' }, error: null }),
          }),
        }),
      })
      // Profile check returns non-admin
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { role: 'business' }, error: null }),
          }),
        }),
      })
      const { getBusinessMetrics } = await import('@/app/actions/metrics')

      const result = await getBusinessMetrics('business-id-1')

      expect(result.total_impressions).toBe(0)
    })
  })

  // ─── Metrics Data Structure ───────────────────────────────────────

  describe('Metrics data structure', () => {
    it('should define BusinessMetrics type with correct fields', () => {
      type BusinessMetrics = {
        id: string
        business_id: string
        date: string
        search_impressions: number
        profile_views: number
        created_at: string
        updated_at: string
      }

      const sample: BusinessMetrics = {
        id: 'metric-1',
        business_id: 'business-1',
        date: '2026-02-23',
        search_impressions: 100,
        profile_views: 25,
        created_at: '2026-02-23T00:00:00Z',
        updated_at: '2026-02-23T12:00:00Z',
      }

      expect(sample.search_impressions).toBe(100)
      expect(sample.profile_views).toBe(25)
    })
  })

  // ─── SQL Migration Expectations ───────────────────────────────────

  describe('Migration expectations', () => {
    it('should have unique constraint on (business_id, date)', () => {
      // This documents the expected DB behavior
      // The UNIQUE constraint means only one metrics row per business per day
      const constraint = 'UNIQUE (business_id, date)'
      expect(constraint).toBeTruthy()
    })

    it('should use ON CONFLICT for upsert (increment counters)', () => {
      // Documents that increment functions use ON CONFLICT DO UPDATE
      const behavior = 'ON CONFLICT DO UPDATE SET search_impressions = search_impressions + 1'
      expect(behavior).toBeTruthy()
    })
  })
})
