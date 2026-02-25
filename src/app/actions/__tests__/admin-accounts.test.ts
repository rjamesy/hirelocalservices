import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'
import { mockUser } from '@/__tests__/helpers/test-data'

const { client: mockSupabase, single, maybeSingle, chainResult, eq } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockLogAudit = vi.fn()
vi.mock('@/lib/audit', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}))

const mockGetBatchUserEntitlements = vi.fn()
const mockGetUserEntitlements = vi.fn()
const mockSyncBusinessBillingStatus = vi.fn()
vi.mock('@/lib/entitlements', () => ({
  getBatchUserEntitlements: (...args: unknown[]) => mockGetBatchUserEntitlements(...args),
  getUserEntitlements: (...args: unknown[]) => mockGetUserEntitlements(...args),
  syncBusinessBillingStatus: (...args: unknown[]) => mockSyncBusinessBillingStatus(...args),
}))

import {
  getAdminAccounts,
  getAdminAccountDetail,
  adminChangePlan,
  adminSuspendAccount,
  adminUnsuspendAccount,
  adminSoftDeleteAccount,
  adminUpdateAccountNotes,
  adminSetTrialEnd,
} from '../admin-accounts'

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

// ─── getAdminAccounts ──────────────────────────────────────────────

describe('getAdminAccounts', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('requires admin', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authed' },
    })
    await expect(getAdminAccounts()).rejects.toThrow('logged in')
  })

  it('returns paginated results with entitlements', async () => {
    setupAdmin()

    // profiles query
    chainResult.mockReturnValueOnce({
      data: [{ id: 'user-1', email: 'test@example.com', created_at: '2024-01-01' }],
      count: 1,
      error: null,
    })

    // getBatchUserEntitlements returns a Map
    const entMap = new Map()
    entMap.set('user-1', {
      userId: 'user-1',
      plan: 'premium',
      subscriptionStatus: 'active',
      isActive: true,
      isTrial: false,
      currentListingCount: 2,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: '2026-01-01T00:00:00Z',
    })
    mockGetBatchUserEntitlements.mockResolvedValue(entMap)

    // active listings count query
    chainResult.mockReturnValueOnce({
      data: [{ owner_id: 'user-1' }],
      error: null,
    })

    const result = await getAdminAccounts(1)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].userId).toBe('user-1')
    expect(result.data[0].plan).toBe('premium')
    expect(result.data[0].subscriptionStatus).toBe('active')
    expect(result.data[0].isActive).toBe(true)
    expect(result.data[0].businessCount).toBe(2)
    expect(result.totalCount).toBe(1)
  })
})

// ─── getAdminAccountDetail ─────────────────────────────────────────

describe('getAdminAccountDetail', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('requires admin', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authed' },
    })
    await expect(getAdminAccountDetail('user-1')).rejects.toThrow('logged in')
  })

  it('returns full detail for a user', async () => {
    setupAdmin()

    // profile fetch
    single.mockResolvedValueOnce({
      data: {
        id: 'user-1',
        email: 'test@example.com',
        created_at: '2024-01-01',
        role: 'business',
        admin_notes: null,
        suspended_at: null,
        suspended_reason: null,
      },
      error: null,
    })

    // user_subscriptions query (direct await)
    chainResult.mockReturnValueOnce({
      data: [
        {
          plan: 'premium',
          status: 'active',
          stripe_customer_id: 'cus_1',
          stripe_subscription_id: 'sub_1',
          current_period_end: '2026-01-01',
          cancel_at_period_end: false,
          trial_ends_at: null,
        },
      ],
      error: null,
    })

    // getUserEntitlements
    mockGetUserEntitlements.mockResolvedValue({
      userId: 'user-1',
      plan: 'premium',
      subscriptionStatus: 'active',
      isActive: true,
      isTrial: false,
      currentListingCount: 1,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: '2026-01-01',
    })

    // businesses query (direct await)
    chainResult.mockReturnValueOnce({
      data: [
        {
          id: 'biz-1',
          name: 'Test Biz',
          slug: 'test-biz',
          status: 'published',
          billing_status: 'active',
          is_seed: false,
          business_locations: [{ suburb: 'Brisbane', state: 'QLD' }],
          business_categories: [{ categories: { name: 'Plumbing' } }],
        },
      ],
      error: null,
    })

    // rpc is_search_eligible for the business
    mockSupabase.rpc.mockResolvedValueOnce({ data: true, error: null })

    // claims query (direct await)
    chainResult.mockReturnValueOnce({
      data: [],
      error: null,
    })

    const result = await getAdminAccountDetail('user-1')
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.userId).toBe('user-1')
      expect(result.email).toBe('test@example.com')
      expect(result.subscription).not.toBeNull()
      expect(result.subscription?.plan).toBe('premium')
      expect(result.ownedListings).toHaveLength(1)
      expect(result.ownedListings[0].categoryName).toBe('Plumbing')
    }
  })
})

// ─── adminChangePlan ───────────────────────────────────────────────

describe('adminChangePlan', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('updates subscription, calls syncBusinessBillingStatus, and logs audit', async () => {
    setupAdmin()

    // fetch before_state — existing sub via maybeSingle
    maybeSingle.mockResolvedValueOnce({
      data: { id: 'usub-1', plan: 'basic', status: 'active' },
      error: null,
    })

    // update subscription (chainResult for .update().eq())
    chainResult.mockReturnValueOnce({ data: null, error: null })

    // syncBusinessBillingStatus
    mockSyncBusinessBillingStatus.mockResolvedValue(undefined)

    const result = await adminChangePlan('user-1', 'premium', 'active')
    expect(result).toEqual({ success: true })
    expect(mockSyncBusinessBillingStatus).toHaveBeenCalledWith(expect.anything(), 'user-1')
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'account_plan_changed',
        entityType: 'account',
        entityId: 'user-1',
      })
    )
  })
})

// ─── adminSuspendAccount ───────────────────────────────────────────

describe('adminSuspendAccount', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('sets suspended_at and reason, then logs audit', async () => {
    setupAdmin()

    // fetch profile before_state
    single.mockResolvedValueOnce({
      data: { id: 'user-1', suspended_at: null, suspended_reason: null },
      error: null,
    })

    // update profile (chainResult)
    chainResult.mockReturnValueOnce({ data: null, error: null })

    const result = await adminSuspendAccount('user-1', 'TOS violation')
    expect(result).toEqual({ success: true })
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'account_suspended',
        entityType: 'account',
        entityId: 'user-1',
      })
    )
  })
})

// ─── adminUnsuspendAccount ─────────────────────────────────────────

describe('adminUnsuspendAccount', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('clears suspension and logs audit', async () => {
    setupAdmin()

    // fetch profile before_state
    single.mockResolvedValueOnce({
      data: {
        id: 'user-1',
        suspended_at: '2024-06-01T00:00:00Z',
        suspended_reason: 'TOS violation',
      },
      error: null,
    })

    // update profile (chainResult)
    chainResult.mockReturnValueOnce({ data: null, error: null })

    const result = await adminUnsuspendAccount('user-1')
    expect(result).toEqual({ success: true })
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'account_unsuspended',
        entityType: 'account',
        entityId: 'user-1',
      })
    )
  })
})

// ─── adminSoftDeleteAccount ────────────────────────────────────────

describe('adminSoftDeleteAccount', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('suspends profile, soft-deletes businesses, and logs audit', async () => {
    setupAdmin()

    // update profile suspension (chainResult)
    chainResult.mockReturnValueOnce({ data: null, error: null })

    // fetch businesses (chainResult)
    chainResult.mockReturnValueOnce({
      data: [{ id: 'biz-1', name: 'Test Biz', slug: 'test-biz', status: 'published' }],
      error: null,
    })

    // update each business to deleted (chainResult)
    chainResult.mockReturnValueOnce({ data: null, error: null })

    // rpc refresh_search_index
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: null })

    const result = await adminSoftDeleteAccount('user-1', 'Account removal')
    expect(result).toEqual({ success: true })
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'account_deleted',
        entityType: 'account',
        entityId: 'user-1',
      })
    )
  })
})

// ─── adminUpdateAccountNotes ───────────────────────────────────────

describe('adminUpdateAccountNotes', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('updates admin_notes and logs audit', async () => {
    setupAdmin()

    // fetch profile before_state
    single.mockResolvedValueOnce({
      data: { id: 'user-1', admin_notes: null },
      error: null,
    })

    // update notes (chainResult)
    chainResult.mockReturnValueOnce({ data: null, error: null })

    const result = await adminUpdateAccountNotes('user-1', 'VIP customer')
    expect(result).toEqual({ success: true })
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'account_notes_updated',
        entityType: 'account',
        entityId: 'user-1',
      })
    )
  })
})

// ─── adminSetTrialEnd ──────────────────────────────────────────────

describe('adminSetTrialEnd', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('updates trial_ends_at and calls syncBusinessBillingStatus', async () => {
    setupAdmin()

    // fetch before_state via maybeSingle
    maybeSingle.mockResolvedValueOnce({
      data: { id: 'usub-1', trial_ends_at: null },
      error: null,
    })

    // update subscription (chainResult)
    chainResult.mockReturnValueOnce({ data: null, error: null })

    // syncBusinessBillingStatus
    mockSyncBusinessBillingStatus.mockResolvedValue(undefined)

    const newTrialEnd = '2026-07-01T00:00:00Z'
    const result = await adminSetTrialEnd('user-1', newTrialEnd)
    expect(result).toEqual({ success: true })
    expect(mockSyncBusinessBillingStatus).toHaveBeenCalledWith(expect.anything(), 'user-1')
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'account_plan_changed',
        entityType: 'account',
        entityId: 'user-1',
      })
    )
  })
})
