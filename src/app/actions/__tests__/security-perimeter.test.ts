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

const mockGetListingEligibility = vi.fn()
vi.mock('@/lib/search/eligibility', () => ({
  getListingEligibility: (...args: any[]) => mockGetListingEligibility(...args),
}))

vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(),
}))

vi.mock('@/app/actions/notifications', () => ({
  createNotification: vi.fn(),
}))

const mockGetCurrentPublishedTyped = vi.fn()
vi.mock('@/lib/pw-service', () => ({
  getCurrentPublishedTyped: (...args: any[]) => mockGetCurrentPublishedTyped(...args),
  dualWrite: vi.fn(async (_label: string, fn: () => Promise<void>) => { try { await fn() } catch {} }),
  createWorking: vi.fn(),
  updateWorking: vi.fn(),
  submitWorking: vi.fn(),
  approveWorking: vi.fn(),
  rejectWorking: vi.fn(),
  archiveWorking: vi.fn(),
  setVisibility: vi.fn(),
}))

// Import after mocks
import { getBusinessBySlug } from '../business'
import { approveClaim, rejectClaim } from '../claims'

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── getBusinessBySlug Visibility Gating (P-based) ──────────────────────────

describe('getBusinessBySlug — public visibility gate', () => {
  // Identity-only fields returned by businesses query
  const bizIdentity = {
    id: mockBusiness.id,
    owner_id: mockBusiness.owner_id,
    slug: mockBusiness.slug,
    billing_status: 'active',
    deleted_at: null,
    is_seed: false,
    claim_status: 'unclaimed',
    listing_source: 'manual',
  }

  // Published listing (P) — content source
  const mockP = {
    id: 'pl-1',
    business_id: mockBusiness.id,
    amendment_number: 1,
    is_current: true,
    visibility_status: 'live' as const,
    name: 'Test Business',
    description: 'A great test business',
    phone: '0412345678',
    email_contact: 'contact@test.com',
    website: 'https://test.com',
    abn: '12345678901',
    suburb: 'Brisbane',
    state: 'QLD',
    postcode: '4000',
    address_text: '123 Test St',
    service_radius_km: 25,
    lat: -27.4698,
    lng: 153.0251,
    primary_category_id: null,
    category_ids: [],
    category_names: [],
    photos_snapshot: [],
    testimonials_snapshot: [],
    published_at: '2024-06-01T00:00:00Z',
    created_at: '2024-06-01T00:00:00Z',
  }

  it('returns null when no published listing (P) exists — anonymous', async () => {
    maybeSingle.mockResolvedValueOnce({ data: bizIdentity, error: null })
    mockGetCurrentPublishedTyped.mockResolvedValueOnce(null)

    const result = await getBusinessBySlug('test-business')
    expect(result).toBeNull()
  })

  it('returns null when P.visibility_status is paused — anonymous', async () => {
    maybeSingle.mockResolvedValueOnce({ data: bizIdentity, error: null })
    mockGetCurrentPublishedTyped.mockResolvedValueOnce({ ...mockP, visibility_status: 'paused' })
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })

    const result = await getBusinessBySlug('test-business')
    expect(result).toBeNull()
  })

  it('returns null when P.visibility_status is suspended — anonymous', async () => {
    maybeSingle.mockResolvedValueOnce({ data: bizIdentity, error: null })
    mockGetCurrentPublishedTyped.mockResolvedValueOnce({ ...mockP, visibility_status: 'suspended' })
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })

    const result = await getBusinessBySlug('test-business')
    expect(result).toBeNull()
  })

  it('returns null when eligibility check fails — anonymous', async () => {
    maybeSingle.mockResolvedValueOnce({ data: bizIdentity, error: null })
    mockGetCurrentPublishedTyped.mockResolvedValueOnce({ ...mockP, visibility_status: 'live' })
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    mockGetListingEligibility.mockResolvedValueOnce({ visiblePublic: false })

    const result = await getBusinessBySlug('test-business')
    expect(result).toBeNull()
  })

  it('returns business when P is live and eligible — anonymous', async () => {
    maybeSingle.mockResolvedValueOnce({ data: bizIdentity, error: null })
    mockGetCurrentPublishedTyped.mockResolvedValueOnce({ ...mockP, visibility_status: 'live' })
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    mockGetListingEligibility.mockResolvedValueOnce({ visiblePublic: true })

    const result = await getBusinessBySlug('test-business')
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Test Business')
  })

  it('returns business for owner — bypasses visibility check', async () => {
    const ownerBiz = { ...bizIdentity, owner_id: mockUser.id }
    maybeSingle.mockResolvedValueOnce({ data: ownerBiz, error: null })
    mockGetCurrentPublishedTyped.mockResolvedValueOnce({ ...mockP, visibility_status: 'paused' })
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null })

    const result = await getBusinessBySlug('test-business')
    expect(result).not.toBeNull()
  })

  it('returns business for admin — bypasses visibility check', async () => {
    maybeSingle.mockResolvedValueOnce({ data: bizIdentity, error: null })
    mockGetCurrentPublishedTyped.mockResolvedValueOnce({ ...mockP, visibility_status: 'suspended' })
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockAdminUser }, error: null })
    // Admin profile check
    single.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })

    const result = await getBusinessBySlug('test-business')
    expect(result).not.toBeNull()
  })

  it('returns null for everyone (including owner) when no P exists', async () => {
    const ownerBiz = { ...bizIdentity, owner_id: mockUser.id }
    maybeSingle.mockResolvedValueOnce({ data: ownerBiz, error: null })
    mockGetCurrentPublishedTyped.mockResolvedValueOnce(null)

    const result = await getBusinessBySlug('test-business')
    expect(result).toBeNull()
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
    // getUserEntitlements: subscription (maybeSingle) then business count (chainResult)
    maybeSingle.mockResolvedValueOnce({ data: { plan: 'premium', status: 'active' }, error: null })
    chainResult.mockReturnValueOnce({ count: 1, error: null })
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
    // getUserEntitlements: no subscription, count=1 (at limit for maxListings=1)
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    chainResult.mockReturnValueOnce({ count: 1, error: null })
    // getUserEntitlements: canceled sub check
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const result = await approveClaim('claim-1')
    expect(result.error).toContain('listing limit')
  })

  it('returns RPC error', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'claim-1', business_id: 'biz-1', claimer_id: 'user-2', status: 'pending' },
      error: null,
    })
    // getUserEntitlements: subscription (maybeSingle) then business count (chainResult)
    maybeSingle.mockResolvedValueOnce({ data: { plan: 'premium', status: 'active' }, error: null })
    chainResult.mockReturnValueOnce({ count: 1, error: null })
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
