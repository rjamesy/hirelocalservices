import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'
import { mockUser } from '@/__tests__/helpers/test-data'

const { client: mockSupabase, single, chainResult, rpc, eq } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockLogAudit = vi.fn()
vi.mock('@/lib/audit', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}))

const mockGetUserEntitlements = vi.fn()
const mockSyncBusinessBillingStatus = vi.fn()
vi.mock('@/lib/entitlements', () => ({
  getUserEntitlements: (...args: unknown[]) => mockGetUserEntitlements(...args),
  syncBusinessBillingStatus: (...args: unknown[]) => mockSyncBusinessBillingStatus(...args),
}))

vi.mock('@/app/actions/notifications', () => ({
  createNotification: vi.fn(),
}))

import {
  getAdminListingsEnhanced,
  getAdminListingDetail,
  adminSoftDeleteListing,
  adminRestoreListing,
  adminPauseListing,
  adminTransferOwnership,
  adminForceReverify,
} from '../admin'

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

// ─── adminSoftDeleteListing ────────────────────────────────────────

describe('adminSoftDeleteListing', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('sets deleted_at + status=deleted, refreshes search, and logs audit with before/after', async () => {
    setupAdmin()

    // fetch business
    single.mockResolvedValueOnce({
      data: {
        id: 'biz-1',
        slug: 'test-biz',
        name: 'Test Biz',
        status: 'published',
        deleted_at: null,
        owner_id: 'user-1',
      },
      error: null,
    })

    // update business (chainResult)
    chainResult.mockReturnValueOnce({ data: null, error: null })

    // rpc refresh_search_index
    rpc.mockResolvedValueOnce({ data: null, error: null })

    const result = await adminSoftDeleteListing('biz-1', 'Spam listing')
    expect(result).toEqual({ success: true })

    expect(rpc).toHaveBeenCalledWith('refresh_search_index', { p_business_id: 'biz-1' })

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'listing_deleted',
        entityType: 'listing',
        entityId: 'biz-1',
        details: expect.objectContaining({
          before_state: expect.objectContaining({ status: 'published' }),
          after_state: expect.objectContaining({ status: 'deleted' }),
        }),
      })
    )
  })
})

// ─── adminRestoreListing ───────────────────────────────────────────

describe('adminRestoreListing', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('clears deleted_at, restores prior status from audit, and refreshes search', async () => {
    setupAdmin()

    // fetch business
    single.mockResolvedValueOnce({
      data: {
        id: 'biz-1',
        slug: 'test-biz',
        name: 'Test Biz',
        status: 'deleted',
        deleted_at: '2024-06-01T00:00:00Z',
      },
      error: null,
    })

    // audit log query for prior status (chainResult for direct await)
    chainResult.mockReturnValueOnce({
      data: [
        {
          details: {
            before_state: { status: 'published' },
            after_state: { status: 'deleted' },
          },
        },
      ],
      error: null,
    })

    // update business (chainResult)
    chainResult.mockReturnValueOnce({ data: null, error: null })

    // rpc refresh_search_index
    rpc.mockResolvedValueOnce({ data: null, error: null })

    const result = await adminRestoreListing('biz-1')
    expect(result).toEqual({ success: true })

    expect(rpc).toHaveBeenCalledWith('refresh_search_index', { p_business_id: 'biz-1' })

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'listing_restored',
        entityType: 'listing',
        entityId: 'biz-1',
        details: expect.objectContaining({
          after_state: expect.objectContaining({ status: 'published', deleted_at: null }),
        }),
      })
    )
  })
})

// ─── adminPauseListing ─────────────────────────────────────────────

describe('adminPauseListing', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('sets status to paused and logs audit', async () => {
    setupAdmin()

    // fetch business
    single.mockResolvedValueOnce({
      data: { id: 'biz-1', slug: 'test-biz', name: 'Test Biz', status: 'published' },
      error: null,
    })

    // update business (chainResult)
    chainResult.mockReturnValueOnce({ data: null, error: null })

    // rpc refresh_search_index
    rpc.mockResolvedValueOnce({ data: null, error: null })

    const result = await adminPauseListing('biz-1')
    expect(result).toEqual({ success: true })
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'listing_paused',
        entityType: 'listing',
        entityId: 'biz-1',
        details: expect.objectContaining({
          before_state: { status: 'published' },
          after_state: { status: 'paused' },
        }),
      })
    )
  })
})

// ─── adminTransferOwnership ────────────────────────────────────────

describe('adminTransferOwnership', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('changes owner_id, calls syncBusinessBillingStatus for BOTH owners, and refreshes search', async () => {
    setupAdmin()

    // fetch business
    single.mockResolvedValueOnce({
      data: { id: 'biz-1', slug: 'test-biz', name: 'Test Biz', owner_id: 'old-owner' },
      error: null,
    })

    // fetch new owner profile
    single.mockResolvedValueOnce({
      data: { id: 'new-owner', email: 'new@example.com' },
      error: null,
    })

    // getUserEntitlements for new owner capacity check
    mockGetUserEntitlements.mockResolvedValueOnce({
      userId: 'new-owner',
      plan: 'premium',
      isActive: true,
      canClaimMore: true,
      maxListings: 10,
      currentListingCount: 1,
    })

    // update owner_id (chainResult)
    chainResult.mockReturnValueOnce({ data: null, error: null })

    // syncBusinessBillingStatus for new owner
    mockSyncBusinessBillingStatus.mockResolvedValue(undefined)

    // rpc refresh_search_index
    rpc.mockResolvedValueOnce({ data: null, error: null })

    const result = await adminTransferOwnership('biz-1', 'new-owner')
    expect(result).toEqual({ success: true })

    // Called for both new and old owner
    expect(mockSyncBusinessBillingStatus).toHaveBeenCalledWith(expect.anything(), 'new-owner')
    expect(mockSyncBusinessBillingStatus).toHaveBeenCalledWith(expect.anything(), 'old-owner')

    expect(rpc).toHaveBeenCalledWith('refresh_search_index', { p_business_id: 'biz-1' })

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'listing_transferred',
        entityType: 'listing',
        entityId: 'biz-1',
        details: expect.objectContaining({
          before_state: { owner_id: 'old-owner' },
          after_state: { owner_id: 'new-owner' },
        }),
      })
    )
  })
})

// ─── adminForceReverify ────────────────────────────────────────────

describe('adminForceReverify', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('sets verification_status to pending and logs audit', async () => {
    setupAdmin()

    // fetch business
    single.mockResolvedValueOnce({
      data: {
        id: 'biz-1',
        slug: 'test-biz',
        name: 'Test Biz',
        verification_status: 'approved',
      },
      error: null,
    })

    // update verification_status (chainResult)
    chainResult.mockReturnValueOnce({ data: null, error: null })

    // rpc refresh_search_index
    rpc.mockResolvedValueOnce({ data: null, error: null })

    const result = await adminForceReverify('biz-1')
    expect(result).toEqual({ success: true })
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'verification_completed',
        entityType: 'listing',
        entityId: 'biz-1',
        details: expect.objectContaining({
          before_state: { verification_status: 'approved' },
          after_state: { verification_status: 'pending' },
          admin_action: 'force_reverify',
        }),
      })
    )
  })
})
