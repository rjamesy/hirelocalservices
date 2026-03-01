import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PublishedListing, WorkingListing } from '@/lib/types'

// ─── Mock createAdminClient (used by getActiveWorkingTyped / getCurrentPublishedTyped) ──

let mockWRow: Partial<WorkingListing> | null = null
let mockPRow: Partial<PublishedListing> | null = null

function chainable(row: unknown) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
  }
  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => chainable(
      table === 'working_listings' ? mockWRow : mockPRow
    ),
  }),
}))

import { getEditGuard } from '@/lib/pw-service'

beforeEach(() => {
  mockWRow = null
  mockPRow = null
  vi.clearAllMocks()
})

describe('getEditGuard', () => {
  it('no W, no P → all false, visibilityStatus null', async () => {
    const g = await getEditGuard('biz-1')
    expect(g).toEqual({
      underReview: false,
      verificationOk: false,
      isLive: false,
      visibilityStatus: null,
    })
  })

  it('no W, P.live → verificationOk true, isLive true', async () => {
    mockPRow = { visibility_status: 'live' } as Partial<PublishedListing>
    const g = await getEditGuard('biz-1')
    expect(g).toEqual({
      underReview: false,
      verificationOk: true,
      isLive: true,
      visibilityStatus: 'live',
    })
  })

  it('W.pending, no P → underReview true, rest false', async () => {
    mockWRow = { review_status: 'pending', submitted_at: '2025-01-01T00:00:00Z' } as Partial<WorkingListing>
    const g = await getEditGuard('biz-1')
    expect(g).toEqual({
      underReview: true,
      verificationOk: false,
      isLive: false,
      visibilityStatus: null,
    })
  })

  it('W.pending, P.live → underReview true, isLive true, verificationOk false', async () => {
    mockWRow = { review_status: 'pending', submitted_at: '2025-01-01T00:00:00Z' } as Partial<WorkingListing>
    mockPRow = { visibility_status: 'live' } as Partial<PublishedListing>
    const g = await getEditGuard('biz-1')
    expect(g).toEqual({
      underReview: true,
      verificationOk: false,
      isLive: true,
      visibilityStatus: 'live',
    })
  })

  it('W.draft, P.paused → verificationOk true, isLive true', async () => {
    mockWRow = { review_status: 'draft' } as Partial<WorkingListing>
    mockPRow = { visibility_status: 'paused' } as Partial<PublishedListing>
    const g = await getEditGuard('biz-1')
    expect(g).toEqual({
      underReview: false,
      verificationOk: true,
      isLive: true,
      visibilityStatus: 'paused',
    })
  })

  it('W.changes_required, P.live → verificationOk false', async () => {
    mockWRow = { review_status: 'changes_required' } as Partial<WorkingListing>
    mockPRow = { visibility_status: 'live' } as Partial<PublishedListing>
    const g = await getEditGuard('biz-1')
    expect(g).toEqual({
      underReview: false,
      verificationOk: false,
      isLive: true,
      visibilityStatus: 'live',
    })
  })

  it('no W, P.suspended → verificationOk true, isLive false', async () => {
    mockPRow = { visibility_status: 'suspended' } as Partial<PublishedListing>
    const g = await getEditGuard('biz-1')
    expect(g).toEqual({
      underReview: false,
      verificationOk: true,
      isLive: false,
      visibilityStatus: 'suspended',
    })
  })

  it('logs invariant violation for pending W without submitted_at', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockWRow = { review_status: 'pending', submitted_at: null } as Partial<WorkingListing>
    await getEditGuard('biz-1')
    expect(consoleSpy).toHaveBeenCalledWith(
      '[getEditGuard] Invariant violation: pending W without submitted_at',
      { businessId: 'biz-1' }
    )
    consoleSpy.mockRestore()
  })
})
