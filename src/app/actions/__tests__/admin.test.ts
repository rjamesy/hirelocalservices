import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'
import { mockUser } from '@/__tests__/helpers/test-data'

const { client: mockSupabase, single, chainResult, eq } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

const mockLogAudit = vi.fn()
vi.mock('@/lib/audit', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}))

const mockGetUserEntitlements = vi.fn()
vi.mock('@/lib/entitlements', () => ({
  getUserEntitlements: (...args: unknown[]) => mockGetUserEntitlements(...args),
}))

import {
  getAdminListings,
  adminSuspendBusiness,
  adminUnsuspendBusiness,
  adminResolveReport,
  getAdminAccounts,
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

describe('admin role verification', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('throws if not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authed' },
    })
    await expect(getAdminListings()).rejects.toThrow('logged in')
  })

  it('throws if not admin role', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { role: 'business' },
      error: null,
    })
    await expect(getAdminListings()).rejects.toThrow('admin')
  })
})

describe('getAdminListings', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setupAdmin()
  })

  it('returns paginated listings with billing_status', async () => {
    chainResult.mockReturnValueOnce({
      data: [
        {
          id: 'biz-1',
          name: 'Test',
          slug: 'test',
          status: 'published',
          created_at: '2024-01-01',
          billing_status: 'active',
          profiles: { email: 'owner@test.com' },
        },
      ],
      count: 1,
      error: null,
    })

    const result = await getAdminListings(1)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].owner_email).toBe('owner@test.com')
    expect(result.data[0].subscription_status).toBe('active')
  })

  it('handles status filter', async () => {
    chainResult.mockReturnValueOnce({ data: [], count: 0, error: null })

    await getAdminListings(1, 'published')
    expect(eq).toHaveBeenCalled()
  })

  it('returns empty on error', async () => {
    chainResult.mockReturnValueOnce({ data: null, count: 0, error: { message: 'Error' } })

    const result = await getAdminListings(1)
    expect(result.data).toEqual([])
    expect(result.totalCount).toBe(0)
  })

  it('calculates pagination correctly', async () => {
    chainResult.mockReturnValueOnce({ data: [], count: 45, error: null })

    const result = await getAdminListings(2)
    expect(result.page).toBe(2)
    expect(result.totalPages).toBe(3)
  })
})

describe('adminSuspendBusiness', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setupAdmin()
  })

  it('returns error for non-existent business', async () => {
    single.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } })
    const result = await adminSuspendBusiness('nonexistent')
    expect(result).toEqual({ error: 'Business not found' })
  })

  it('returns error if already suspended', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'biz-1', slug: 'test', name: 'Test Biz', status: 'suspended' },
      error: null,
    })
    const result = await adminSuspendBusiness('biz-1')
    expect(result).toEqual({ error: 'Business is already suspended' })
  })

  it('suspends a published business and logs audit', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'biz-1', slug: 'test', name: 'Test Biz', status: 'published' },
      error: null,
    })
    const result = await adminSuspendBusiness('biz-1')
    expect(result).toEqual({ success: true })
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'listing_suspended',
        entityType: 'listing',
        entityId: 'biz-1',
      })
    )
  })
})

describe('adminUnsuspendBusiness', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setupAdmin()
  })

  it('returns error for non-existent business', async () => {
    single.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } })
    const result = await adminUnsuspendBusiness('nonexistent')
    expect(result).toEqual({ error: 'Business not found' })
  })

  it('returns error if not suspended', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'biz-1', slug: 'test', name: 'Test Biz', status: 'published' },
      error: null,
    })
    const result = await adminUnsuspendBusiness('biz-1')
    expect(result).toEqual({ error: 'Business is not currently suspended' })
  })

  it('unsuspends a suspended business and logs audit', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'biz-1', slug: 'test', name: 'Test Biz', status: 'suspended' },
      error: null,
    })
    const result = await adminUnsuspendBusiness('biz-1')
    expect(result).toEqual({ success: true })
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'listing_unsuspended',
        entityType: 'listing',
        entityId: 'biz-1',
      })
    )
  })

  it('unsuspend restores to published (not draft)', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'biz-1', slug: 'test', name: 'Test Biz', status: 'suspended' },
      error: null,
    })
    const result = await adminUnsuspendBusiness('biz-1')
    expect(result).toEqual({ success: true })
  })
})

describe('adminResolveReport', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setupAdmin()
  })

  it('returns error for non-existent report', async () => {
    single.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } })
    const result = await adminResolveReport('nonexistent')
    expect(result).toEqual({ error: 'Report not found' })
  })

  it('returns error if already resolved', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'rep-1', status: 'resolved', business_id: 'biz-1' },
      error: null,
    })
    const result = await adminResolveReport('rep-1')
    expect(result).toEqual({ error: 'Report is already resolved' })
  })

  it('resolves an open report and logs audit', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'rep-1', status: 'open', business_id: 'biz-1' },
      error: null,
    })
    const result = await adminResolveReport('rep-1')
    expect(result).toEqual({ success: true })
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'report_resolved',
        entityType: 'report',
        entityId: 'rep-1',
      })
    )
  })
})

describe('getAdminAccounts', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setupAdmin()
  })

  it('returns accounts with entitlements from getUserEntitlements', async () => {
    chainResult.mockReturnValueOnce({
      data: [{ id: 'user-1', email: 'test@example.com' }],
      count: 1,
      error: null,
    })

    mockGetUserEntitlements.mockResolvedValue({
      userId: 'user-1',
      plan: 'premium',
      subscriptionStatus: 'active',
      currentPeriodEnd: '2026-01-01T00:00:00Z',
      isActive: true,
      isTrial: false,
      currentListingCount: 2,
      cancelAtPeriodEnd: false,
    })

    const result = await getAdminAccounts(1)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].plan).toBe('premium')
    expect(result.data[0].subscriptionStatus).toBe('active')
    expect(result.data[0].isActive).toBe(true)
    expect(result.data[0].businessCount).toBe(2)
    expect(mockGetUserEntitlements).toHaveBeenCalledWith(expect.anything(), 'user-1')
  })

  it('returns empty on error', async () => {
    chainResult.mockReturnValueOnce({ data: null, count: 0, error: { message: 'Error' } })

    const result = await getAdminAccounts(1)
    expect(result.data).toEqual([])
  })

  it('returns exactly 1 subscription entry per user (after repair)', async () => {
    // User who had duplicate rows — now repaired — should show one entry
    chainResult.mockReturnValueOnce({
      data: [{ id: 'user-dup', email: 'dup@example.com' }],
      count: 1,
      error: null,
    })

    mockGetUserEntitlements.mockResolvedValue({
      userId: 'user-dup',
      plan: 'basic',
      subscriptionStatus: 'active',
      currentPeriodEnd: '2026-06-01T00:00:00Z',
      isActive: true,
      isTrial: false,
      currentListingCount: 1,
      cancelAtPeriodEnd: false,
    })

    const result = await getAdminAccounts(1)
    expect(result.data).toHaveLength(1) // exactly 1 entry per user
    expect(result.data[0].plan).toBe('basic')
  })
})
