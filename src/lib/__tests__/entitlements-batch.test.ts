import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock system-settings before importing entitlements
vi.mock('@/app/actions/system-settings', () => ({
  getSettingValue: vi.fn((_key: string, fallback: number) => Promise.resolve(fallback)),
}))

// Mock supabase/server (needed for getSettingValue internal use)
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

import { getBatchUserEntitlements } from '@/lib/entitlements'

/**
 * Creates a mock supabase client tailored for getBatchUserEntitlements.
 * The function makes two batch queries:
 *   1. user_subscriptions: select(*).in('user_id', userIds)
 *   2. businesses: select('owner_id', { count, head: false }).in('owner_id', userIds).eq('is_seed', false)
 */
function createBatchMockSupabase(opts: {
  subs?: Record<string, unknown>[]
  bizRows?: Record<string, unknown>[]
}) {
  const { subs = [], bizRows = [] } = opts

  let userSubCallCount = 0

  function buildChainable(data: unknown, isCount = false): any {
    const chain: any = {}
    const chainingMethods = ['select', 'eq', 'neq', 'order', 'limit', 'range', 'in', 'ilike']

    for (const m of chainingMethods) {
      chain[m] = vi.fn(() => chain)
    }
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data, error: null }))
    chain.single = vi.fn(() => Promise.resolve({ data, error: null }))

    if (isCount) {
      chain.then = vi.fn((resolve: (val: unknown) => void) =>
        resolve({ data: null, count: data, error: null })
      )
    } else {
      chain.then = vi.fn((resolve: (val: unknown) => void) =>
        resolve({ data, error: null })
      )
    }
    return chain
  }

  return {
    from: vi.fn((table: string) => {
      if (table === 'user_subscriptions') {
        userSubCallCount++
        return buildChainable(subs)
      }
      if (table === 'businesses') {
        return buildChainable(bizRows)
      }
      return buildChainable(null)
    }),
  }
}

describe('getBatchUserEntitlements', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns correct entitlements for multiple users', async () => {
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

    const supabase = createBatchMockSupabase({
      subs: [
        {
          user_id: 'user-1',
          status: 'active',
          plan: 'premium',
          current_period_end: futureDate,
          cancel_at_period_end: false,
          trial_ends_at: null,
          updated_at: '2024-06-01T00:00:00Z',
        },
        {
          user_id: 'user-2',
          status: 'active',
          plan: 'basic',
          current_period_end: futureDate,
          cancel_at_period_end: false,
          trial_ends_at: null,
          updated_at: '2024-06-01T00:00:00Z',
        },
      ],
      bizRows: [
        { owner_id: 'user-1' },
        { owner_id: 'user-1' },
        { owner_id: 'user-2' },
      ],
    })

    const result = await getBatchUserEntitlements(supabase, ['user-1', 'user-2'])

    expect(result.size).toBe(2)

    const ent1 = result.get('user-1')!
    expect(ent1.plan).toBe('premium')
    expect(ent1.isActive).toBe(true)
    expect(ent1.currentListingCount).toBe(2)

    const ent2 = result.get('user-2')!
    expect(ent2.plan).toBe('basic')
    expect(ent2.isActive).toBe(true)
    expect(ent2.currentListingCount).toBe(1)
  })

  it('handles missing subscriptions — user with no sub returns blocked state', async () => {
    const supabase = createBatchMockSupabase({
      subs: [],  // no subscriptions at all
      bizRows: [],
    })

    const result = await getBatchUserEntitlements(supabase, ['user-no-sub'])

    expect(result.size).toBe(1)
    const ent = result.get('user-no-sub')!
    expect(ent.plan).toBeNull()
    expect(ent.isActive).toBe(false)
    expect(ent.effectiveState).toBe('blocked')
    expect(ent.reasonCodes).toContain('no_subscription')
  })

  it('handles empty userIds array', async () => {
    const supabase = createBatchMockSupabase({})

    const result = await getBatchUserEntitlements(supabase, [])

    expect(result.size).toBe(0)
    // Should not even call from() since there's nothing to query
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
