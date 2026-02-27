import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'
import { mockUser, mockAdminUser, mockBusiness } from '@/__tests__/helpers/test-data'

// ─── Setup mocks ────────────────────────────────────────────────────────────

const { client: mockSupabase, maybeSingle, single, rpc, chainResult } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('@/app/actions/system-settings', () => ({
  getSettingValue: vi.fn(() => Promise.resolve(10)),
}))

vi.mock('@/lib/protection', () => ({
  getSystemFlagsSafe: vi.fn(() =>
    Promise.resolve({
      listings_enabled: true,
      listings_require_approval: false,
    })
  ),
  requireEmailVerified: vi.fn(),
}))

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn(),
  listingCreateLimiter: {},
  claimSubmitLimiter: {},
}))

vi.mock('@/lib/blacklist', () => ({
  quickBlacklistCheck: vi.fn(() => Promise.resolve({ blocked: false })),
}))

vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(),
}))

vi.mock('@/app/actions/notifications', () => ({
  createNotification: vi.fn(),
}))

// Import after mocks
import { getBusinessBySlug } from '../business'
import { approveClaim, rejectClaim } from '../claims'

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── getBusinessBySlug Visibility Gating ────────────────────────────────────

describe('getBusinessBySlug — public visibility gate', () => {
  const publishedApproved = {
    ...mockBusiness,
    status: 'published',
    verification_status: 'approved',
    deleted_at: null,
    billing_status: 'active',
    photos: [],
    testimonials: [],
    business_locations: [],
    business_categories: [],
  }

  it('returns null for draft business when anonymous', async () => {
    const draft = { ...publishedApproved, status: 'draft' }
    maybeSingle.mockResolvedValueOnce({ data: draft, error: null })
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })

    const result = await getBusinessBySlug('test-business')
    expect(result).toBeNull()
  })

  it('returns null for pending verification when anonymous', async () => {
    const pending = { ...publishedApproved, verification_status: 'pending' }
    maybeSingle.mockResolvedValueOnce({ data: pending, error: null })
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })

    const result = await getBusinessBySlug('test-business')
    expect(result).toBeNull()
  })

  it('returns null for rejected verification when anonymous', async () => {
    const rejected = { ...publishedApproved, verification_status: 'rejected' }
    maybeSingle.mockResolvedValueOnce({ data: rejected, error: null })
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })

    const result = await getBusinessBySlug('test-business')
    expect(result).toBeNull()
  })

  it('returns null for deleted business when anonymous', async () => {
    const deleted = { ...publishedApproved, deleted_at: '2024-01-01T00:00:00Z' }
    maybeSingle.mockResolvedValueOnce({ data: deleted, error: null })
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })

    const result = await getBusinessBySlug('test-business')
    expect(result).toBeNull()
  })

  it('returns null for billing_suspended when anonymous', async () => {
    const suspended = { ...publishedApproved, billing_status: 'billing_suspended' }
    maybeSingle.mockResolvedValueOnce({ data: suspended, error: null })
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })

    const result = await getBusinessBySlug('test-business')
    expect(result).toBeNull()
  })

  it('returns null for suspended status when anonymous', async () => {
    const suspended = { ...publishedApproved, status: 'suspended' }
    maybeSingle.mockResolvedValueOnce({ data: suspended, error: null })
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })

    const result = await getBusinessBySlug('test-business')
    expect(result).toBeNull()
  })

  it('returns business for published+approved when anonymous', async () => {
    maybeSingle.mockResolvedValueOnce({ data: publishedApproved, error: null })
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })

    const result = await getBusinessBySlug('test-business')
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Test Business')
  })

  it('returns draft business when user is owner', async () => {
    const draft = { ...publishedApproved, status: 'draft', owner_id: mockUser.id }
    maybeSingle.mockResolvedValueOnce({ data: draft, error: null })
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null })

    const result = await getBusinessBySlug('test-business')
    expect(result).not.toBeNull()
  })

  it('returns pending-verification business when user is owner', async () => {
    const pending = { ...publishedApproved, verification_status: 'pending', owner_id: mockUser.id }
    maybeSingle.mockResolvedValueOnce({ data: pending, error: null })
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null })

    const result = await getBusinessBySlug('test-business')
    expect(result).not.toBeNull()
  })

  it('returns any-status business when user is admin', async () => {
    const draft = { ...publishedApproved, status: 'draft', verification_status: 'pending', owner_id: 'other-user' }
    maybeSingle.mockResolvedValueOnce({ data: draft, error: null })
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockAdminUser }, error: null })
    // Admin profile check
    single.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })

    const result = await getBusinessBySlug('test-business')
    expect(result).not.toBeNull()
  })
})

// ─── approveClaim — transactional RPC ───────────────────────────────────────

describe('approveClaim — transactional RPC', () => {
  beforeEach(() => {
    // requireAdmin: getUser + profile check
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockAdminUser }, error: null })
    single.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
  })

  it('calls approve_business_claim RPC with correct params', async () => {
    // Claim fetch (single #2 after admin profile in beforeEach)
    single.mockResolvedValueOnce({
      data: { id: 'claim-1', business_id: 'biz-1', claimer_id: 'user-2', status: 'pending' },
      error: null,
    })
    // getUserListingCapacity: business count (chainResult) then subscription (maybeSingle)
    chainResult.mockReturnValueOnce({ count: 1, error: null })
    maybeSingle.mockResolvedValueOnce({ data: { plan: 'premium', status: 'active' }, error: null })
    // RPC
    rpc.mockResolvedValueOnce({
      data: { success: true, business_id: 'biz-1', claimer_id: 'user-2' },
      error: null,
    })
    // ensureUserSubscription: check existing (maybeSingle)
    maybeSingle.mockResolvedValueOnce({ data: { status: 'active' }, error: null })

    await approveClaim('claim-1', 'Looks good')

    expect(rpc).toHaveBeenCalledWith('approve_business_claim', {
      p_claim_id: 'claim-1',
      p_admin_notes: 'Looks good',
    })
  })

  it('returns error when capacity exceeded', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'claim-1', business_id: 'biz-1', claimer_id: 'user-2', status: 'pending' },
      error: null,
    })
    // getUserListingCapacity: count=1 (at limit), no subscription (maxAllowed=1)
    chainResult.mockReturnValueOnce({ count: 1, error: null })
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const result = await approveClaim('claim-1')
    expect(result.error).toContain('listing limit')
  })

  it('returns RPC error', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'claim-1', business_id: 'biz-1', claimer_id: 'user-2', status: 'pending' },
      error: null,
    })
    // getUserListingCapacity: business count (chainResult) then subscription (maybeSingle)
    chainResult.mockReturnValueOnce({ count: 1, error: null })
    maybeSingle.mockResolvedValueOnce({ data: { plan: 'premium', status: 'active' }, error: null })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })

    const result = await approveClaim('claim-1')
    expect(result.error).toContain('Failed to approve')
  })
})

// ─── rejectClaim — transactional RPC ────────────────────────────────────────

describe('rejectClaim — transactional RPC', () => {
  beforeEach(() => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockAdminUser }, error: null })
    single.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
  })

  it('calls reject_business_claim RPC with correct params', async () => {
    rpc.mockResolvedValueOnce({
      data: { success: true, business_id: 'biz-1', claimer_id: 'user-2' },
      error: null,
    })

    await rejectClaim('claim-1', 'Insufficient evidence')

    expect(rpc).toHaveBeenCalledWith('reject_business_claim', {
      p_claim_id: 'claim-1',
      p_admin_notes: 'Insufficient evidence',
    })
  })

  it('returns RPC error', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })

    const result = await rejectClaim('claim-1')
    expect(result.error).toContain('Failed to reject')
  })
})
