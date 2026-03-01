import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'
import { mockUser, mockBusiness } from '@/__tests__/helpers/test-data'

// Mock createClient
const { client: mockSupabase, single, maybeSingle, chainResult } = createMockSupabaseClient()

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
}))

const mockGetListingEligibility = vi.fn()
vi.mock('@/lib/search/eligibility', () => ({
  getListingEligibility: (...args: any[]) => mockGetListingEligibility(...args),
}))

const mockFuzzyNameScore = vi.fn(() => 0.9)
vi.mock('@/lib/claim-scoring', () => ({
  fuzzyNameScore: (...args: any[]) => mockFuzzyNameScore(...args),
}))

const mockGetCurrentPublishedTyped = vi.fn()
const mockGetActiveWorkingTyped = vi.fn()
const mockDeriveStatus = vi.fn()
const mockGetEditGuard = vi.fn()
vi.mock('@/lib/pw-service', () => ({
  getCurrentPublishedTyped: (...args: any[]) => mockGetCurrentPublishedTyped(...args),
  getActiveWorkingTyped: (...args: any[]) => mockGetActiveWorkingTyped(...args),
  getListingState: vi.fn(),
  deriveStatus: (...args: any[]) => mockDeriveStatus(...args),
  getEditGuard: (...args: any[]) => mockGetEditGuard(...args),
  dualWrite: vi.fn(async (_label: string, fn: () => Promise<void>) => { try { await fn() } catch {} }),
  createWorking: vi.fn(),
  updateWorking: vi.fn(),
  submitWorking: vi.fn(),
  approveWorking: vi.fn(),
  rejectWorking: vi.fn(),
  archiveWorking: vi.fn(),
  setVisibility: vi.fn(),
}))

// Import actions after mocks
import {
  createBusinessDraft,
  updateBusiness,
  updateBusinessLocation,
  updateBusinessCategories,
  publishChanges,
  unpublishBusiness,
  getMyBusiness,
  getMyBusinesses,
  getMyEntitlements,
  getBusinessBySlug,
  findPotentialDuplicates,
  saveDuplicateChoice,
} from '../business'

function makeFormData(data: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(data)) {
    fd.set(key, value)
  }
  return fd
}

describe('createBusinessDraft', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
  })

  it('requires authentication', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    })
    const fd = makeFormData({ name: 'Test', description: 'A valid description for testing.' })
    await expect(createBusinessDraft(fd)).rejects.toThrow('You must be logged in')
  })

  it('rejects if user has reached listing limit', async () => {
    // getUserEntitlements: subscription query (active basic)
    maybeSingle.mockResolvedValueOnce({ data: { plan: 'basic', status: 'active' }, error: null })
    // getUserEntitlements: business count = 1 (at limit for basic)
    chainResult.mockReturnValueOnce({ count: 1, error: null })

    const fd = makeFormData({ name: 'Test', description: 'A valid description for testing.' })
    const result = await createBusinessDraft(fd)
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('already have a business listing')
  })

  it('returns validation errors for invalid data', async () => {
    // getUserEntitlements: no subscription
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // getUserEntitlements: business count = 0
    chainResult.mockReturnValueOnce({ count: 0, error: null })
    // getUserEntitlements: canceled sub check
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const fd = makeFormData({ name: 'A', description: 'Short' })
    const result = await createBusinessDraft(fd)
    expect(result).toHaveProperty('error')
  })

  it('creates a draft on valid data', async () => {
    // getUserEntitlements: no subscription
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // getUserEntitlements: business count = 0
    chainResult.mockReturnValueOnce({ count: 0, error: null })
    // getUserEntitlements: canceled sub check
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // slug check
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // insert
    single.mockResolvedValueOnce({ data: mockBusiness, error: null })

    const fd = makeFormData({
      name: 'Test Business',
      description: 'A valid description for testing purposes.',
      phone: '', email_contact: '', website: '', abn: '',
    })
    const result = await createBusinessDraft(fd)
    expect(result).toHaveProperty('data')
  })

  it('appends random suffix for duplicate slugs', async () => {
    // getUserEntitlements: no subscription
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // getUserEntitlements: business count = 0
    chainResult.mockReturnValueOnce({ count: 0, error: null })
    // getUserEntitlements: canceled sub check
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    maybeSingle.mockResolvedValueOnce({ data: { id: 'dup' }, error: null }) // slug exists
    single.mockResolvedValueOnce({ data: mockBusiness, error: null })

    const fd = makeFormData({
      name: 'Test Business',
      description: 'A valid description for testing purposes.',
      phone: '', email_contact: '', website: '', abn: '',
    })
    const result = await createBusinessDraft(fd)
    expect(result).toHaveProperty('data')
    // Verify insert was called (the slug with suffix is handled internally)
    expect(mockSupabase.from).toHaveBeenCalledWith('businesses')
  })

  it('handles insert failure', async () => {
    // getUserEntitlements: no subscription
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // getUserEntitlements: business count = 0
    chainResult.mockReturnValueOnce({ count: 0, error: null })
    // getUserEntitlements: canceled sub check
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    single.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })

    const fd = makeFormData({
      name: 'Test Business',
      description: 'A valid description for testing purposes.',
      phone: '', email_contact: '', website: '', abn: '',
    })
    const result = await createBusinessDraft(fd)
    expect(result).toEqual({ error: 'Failed to create business. Please try again.' })
  })
})

describe('updateBusiness', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    mockGetEditGuard.mockResolvedValue({ underReview: false, verificationOk: false, isLive: false, visibilityStatus: null })
    // verifyBusinessOwnership
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123' },
      error: null,
    })
    // getUserEntitlements: no subscription
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // getUserEntitlements: business count
    chainResult.mockReturnValueOnce({ count: 0, error: null })
    // getUserEntitlements: canceled sub check
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
  })

  it('returns validation errors for invalid data', async () => {
    const fd = makeFormData({ name: 'A', description: 'Short' })
    const result = await updateBusiness('biz-123', fd)
    expect(result).toHaveProperty('error')
  })

  it('updates business on valid data', async () => {
    // fetch slug + billing_status
    single.mockResolvedValueOnce({
      data: { slug: 'test', billing_status: 'active' },
      error: null,
    })
    // update result
    single.mockResolvedValueOnce({
      data: { ...mockBusiness, name: 'Updated' },
      error: null,
    })

    const fd = makeFormData({
      name: 'Updated Business',
      description: 'A valid updated description for testing.',
      phone: '', email_contact: '', website: '', abn: '',
    })
    const result = await updateBusiness('biz-123', fd)
    expect(result).toHaveProperty('data')
  })

  it('rejects non-owner', async () => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { ...mockUser, id: 'other-user' } },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123' },
      error: null,
    })

    const fd = makeFormData({
      name: 'Updated Business',
      description: 'A valid updated description for testing.',
      phone: '', email_contact: '', website: '', abn: '',
    })
    await expect(updateBusiness('biz-123', fd)).rejects.toThrow('permission')
  })

  it('allows editing when not under review', async () => {
    // guard.underReview = false (default) → editing allowed
    // fetch slug + billing_status
    single.mockResolvedValueOnce({
      data: { slug: 'test', billing_status: 'active' },
      error: null,
    })
    // update result
    single.mockResolvedValueOnce({
      data: { ...mockBusiness, status: 'draft', name: 'Updated' },
      error: null,
    })

    const fd = makeFormData({
      name: 'Updated Business',
      description: 'A valid updated description for testing.',
      phone: '', email_contact: '', website: '', abn: '',
    })
    const result = await updateBusiness('biz-123', fd)
    expect(result).toHaveProperty('data')
  })

  it('blocks editing when under review', async () => {
    mockGetEditGuard.mockResolvedValueOnce({ underReview: true, verificationOk: false, isLive: true, visibilityStatus: 'live' })

    const fd = makeFormData({
      name: 'Updated Business',
      description: 'A valid updated description for testing.',
      phone: '', email_contact: '', website: '', abn: '',
    })
    const result = await updateBusiness('biz-123', fd)
    expect(result).toEqual({ error: 'This listing is currently under review and cannot be edited.' })
  })
})

describe('updateBusinessLocation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    mockGetEditGuard.mockResolvedValue({ underReview: false, verificationOk: false, isLive: false, visibilityStatus: null })
    // ownership check
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123' },
      error: null,
    })
  })

  it('validates location data', async () => {
    const fd = makeFormData({
      suburb: '',
      state: 'INVALID',
      postcode: '12',
      service_radius_km: '25',
    })
    const result = await updateBusinessLocation('biz-123', fd)
    expect(result).toHaveProperty('error')
  })

  it('looks up postcode for lat/lng', async () => {
    // postcode lookup
    maybeSingle.mockResolvedValueOnce({
      data: { lat: -27.47, lng: 153.02 },
      error: null,
    })
    // existing location check
    maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    })
    // RPC call
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: null })

    const fd = makeFormData({
      suburb: 'Brisbane',
      state: 'QLD',
      postcode: '4000',
      service_radius_km: '25',
    })
    const result = await updateBusinessLocation('biz-123', fd)
    expect(result).toEqual({ success: true })
  })

  it('falls back to postcode-only lookup', async () => {
    // exact match fails
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // fallback postcode-only
    maybeSingle.mockResolvedValueOnce({
      data: { lat: -27.47, lng: 153.02 },
      error: null,
    })
    // existing location check
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // RPC call
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: null })

    const fd = makeFormData({
      suburb: 'Brisbane',
      state: 'QLD',
      postcode: '4000',
      service_radius_km: '25',
    })
    const result = await updateBusinessLocation('biz-123', fd)
    expect(result).toEqual({ success: true })
  })

  it('uses fallback insert when RPC fails for new location', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // existing location check - no existing
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // RPC fails
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'RPC not found' } })
    // Fallback insert succeeds (the mock chainable returns { data: null, error: null } by default)

    const fd = makeFormData({
      suburb: 'Brisbane',
      state: 'QLD',
      postcode: '4000',
      service_radius_km: '25',
    })
    const result = await updateBusinessLocation('biz-123', fd)
    // Should use the fallback path
    expect(mockSupabase.from).toHaveBeenCalledWith('business_locations')
  })
})

describe('updateBusinessCategories', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    mockGetEditGuard.mockResolvedValue({ underReview: false, verificationOk: false, isLive: false, visibilityStatus: null })
    // verifyBusinessOwnership
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123' },
      error: null,
    })
  })

  it('rejects empty primary category', async () => {
    const result = await updateBusinessCategories('biz-123', '', [])
    expect(result).toEqual({ error: 'Select a primary category' })
  })

  it('rejects more than 3 secondary categories', async () => {
    const result = await updateBusinessCategories('biz-123', 'cat-1', ['a', 'b', 'c', 'd'])
    expect(result).toEqual({ error: 'You can select up to 3 additional categories' })
  })

  it('calls RPC and returns success', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: null })

    const result = await updateBusinessCategories('biz-123', 'cat-1', ['cat-2'])
    expect(result).toEqual({ success: true })
    expect(mockSupabase.rpc).toHaveBeenCalledWith('upsert_business_categories', {
      p_business_id: 'biz-123',
      p_primary_id: 'cat-1',
      p_secondary_ids: ['cat-2'],
    })
  })

  it('maps trigger error for group category', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Cannot assign a group category directly; choose a child category' },
    })

    const result = await updateBusinessCategories('biz-123', 'group-id', [])
    expect(result).toEqual({ error: 'Cannot select a category group. Choose a specific service.' })
  })

  it('maps trigger error for cross-group secondary', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Secondary categories must be within the same group as the primary category' },
    })

    const result = await updateBusinessCategories('biz-123', 'cat-1', ['cross-group'])
    expect(result).toEqual({ error: 'Secondary categories must be in the same group as the primary category.' })
  })

  it('allows editing when not under review', async () => {
    // guard.underReview = false (default) → editing allowed
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: null })

    const result = await updateBusinessCategories('biz-123', 'cat-1', [])
    expect(result).toEqual({ success: true })
  })

  it('blocks editing when under review', async () => {
    mockGetEditGuard.mockResolvedValueOnce({ underReview: true, verificationOk: false, isLive: true, visibilityStatus: 'live' })

    const result = await updateBusinessCategories('biz-123', 'cat-1', [])
    expect(result).toEqual({ error: 'This listing is currently under review and cannot be edited.' })
  })

  it('returns fallback error on unknown RPC failure', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'connection refused' },
    })

    const result = await updateBusinessCategories('biz-123', 'cat-1', [])
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('Failed to save categories')
  })
})

describe('publishChanges', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    mockGetEditGuard.mockResolvedValue({ underReview: false, verificationOk: false, isLive: false, visibilityStatus: null })
    // verifyBusinessOwnership: business fetch
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123' },
      error: null,
    })
  })

  it('requires active user subscription', async () => {
    // getUserEntitlements: no subscription
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // getUserEntitlements: business count
    chainResult.mockReturnValueOnce({ count: 0, error: null })
    // getUserEntitlements: canceled sub check
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    const result = await publishChanges('biz-123')
    expect(result).toEqual({ error: 'subscription_required' })
  })

  it('rejects canceled user subscription', async () => {
    // getUserEntitlements: no active sub (neq status canceled filters it out)
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // getUserEntitlements: business count
    chainResult.mockReturnValueOnce({ count: 0, error: null })
    // getUserEntitlements: canceled sub check — expired
    maybeSingle.mockResolvedValueOnce({
      data: { status: 'canceled', current_period_end: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:00:00Z' },
      error: null,
    })
    const result = await publishChanges('biz-123')
    expect(result).toEqual({ error: 'subscription_required' })
  })
})

describe('unpublishBusiness', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
  })

  it('allows owner to unpublish', async () => {
    // business fetch
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test' },
      error: null,
    })
    // profile fetch
    single.mockResolvedValueOnce({
      data: { role: 'business' },
      error: null,
    })

    const result = await unpublishBusiness('biz-123')
    expect(result).toEqual({ success: true })
  })

  it('allows admin to unpublish', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { ...mockUser, id: 'admin-123' } },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test' },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { role: 'admin' },
      error: null,
    })

    const result = await unpublishBusiness('biz-123')
    expect(result).toEqual({ success: true })
  })

  it('rejects non-owner non-admin', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { ...mockUser, id: 'other-user' } },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test' },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { role: 'business' },
      error: null,
    })

    await expect(unpublishBusiness('biz-123')).rejects.toThrow('permission')
  })
})

describe('getMyBusiness', () => {
  const derivedPublished = {
    effectiveStatus: 'published',
    effectiveVerification: 'approved',
    hasPendingChanges: false,
    visibilityStatus: 'live',
    reviewStatus: null,
  }

  const mockW = {
    id: 'w-1',
    business_id: mockBusiness.id,
    name: 'Working Name',
    description: 'Working desc',
    phone: '0400000000',
    email_contact: 'w@test.com',
    website: 'https://working.com',
    abn: '99999999999',
    suburb: 'Melbourne',
    state: 'VIC',
    postcode: '3000',
    address_text: '1 Working St',
    service_radius_km: 10,
    lat: null,
    lng: null,
    primary_category_id: 'cat-1',
    secondary_category_ids: ['cat-2'],
    review_status: 'draft' as const,
    change_type: 'edit' as const,
    rejection_reason: null,
    rejection_count: 0,
    verification_job_id: null,
    submitted_at: null,
    reviewed_at: null,
    reviewed_by: null,
    archived_at: null,
    created_at: '',
    updated_at: '',
  }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns null when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })
    const result = await getMyBusiness()
    expect(result).toBeNull()
  })

  it('returns null when no business found', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    // No selectedId → .order() → chainResult
    chainResult.mockReturnValueOnce({ data: [], error: null })

    const result = await getMyBusiness()
    expect(result).toBeNull()
  })

  it('overrides content from W when W exists', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    // No selectedId → .order() → chainResult (businesses list)
    chainResult.mockReturnValueOnce({
      data: [{
        ...mockBusiness,
        business_locations: [{ suburb: 'Brisbane', state: 'QLD', postcode: '4000' }],
        business_categories: [{ category_id: 'cat-1', is_primary: true }],
        photos: [],
        testimonials: [],
      }],
      error: null,
    })
    // W + P fetched in parallel
    mockGetActiveWorkingTyped.mockResolvedValueOnce(mockW)
    mockGetCurrentPublishedTyped.mockResolvedValueOnce(null)
    mockDeriveStatus.mockReturnValueOnce(derivedPublished)
    // photos + testimonials chainResult (from Promise.all with W/P)
    chainResult.mockReturnValueOnce({ data: [], error: null }) // photos
    chainResult.mockReturnValueOnce({ data: [], error: null }) // testimonials

    const result = await getMyBusiness()
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Working Name')
    expect(result!.description).toBe('Working desc')
    expect(result!.phone).toBe('0400000000')
    expect(result!.subscription).toBeNull()
  })

  it('uses location from W/P when available', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    chainResult.mockReturnValueOnce({
      data: [{
        ...mockBusiness,
        business_locations: [{ suburb: 'Brisbane', state: 'QLD', postcode: '4000' }],
        business_categories: [],
        photos: [],
        testimonials: [],
      }],
      error: null,
    })
    mockGetActiveWorkingTyped.mockResolvedValueOnce(mockW)
    mockGetCurrentPublishedTyped.mockResolvedValueOnce(null)
    mockDeriveStatus.mockReturnValueOnce(derivedPublished)
    chainResult.mockReturnValueOnce({ data: [], error: null })
    chainResult.mockReturnValueOnce({ data: [], error: null })

    const result = await getMyBusiness()
    expect(result!.location).toEqual({
      suburb: 'Melbourne', state: 'VIC', postcode: '3000',
      address_text: '1 Working St', service_radius_km: 10,
    })
  })

  it('falls back to businesses table location when no W/P location', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    chainResult.mockReturnValueOnce({
      data: [{
        ...mockBusiness,
        business_locations: [{ id: 'loc-1', suburb: 'Brisbane', state: 'QLD', postcode: '4000' }],
        business_categories: [],
        photos: [],
        testimonials: [],
      }],
      error: null,
    })
    // No W, no P
    mockGetActiveWorkingTyped.mockResolvedValueOnce(null)
    mockGetCurrentPublishedTyped.mockResolvedValueOnce(null)
    mockDeriveStatus.mockReturnValueOnce(derivedPublished)
    chainResult.mockReturnValueOnce({ data: [], error: null })
    chainResult.mockReturnValueOnce({ data: [], error: null })

    const result = await getMyBusiness()
    // Falls back to relational join location
    expect(result!.location).toEqual({ id: 'loc-1', suburb: 'Brisbane', state: 'QLD', postcode: '4000' })
  })

  it('returns derived status and verification from deriveStatus', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    chainResult.mockReturnValueOnce({
      data: [{
        ...mockBusiness,
        business_locations: [],
        business_categories: [],
        photos: [],
        testimonials: [],
      }],
      error: null,
    })
    mockGetActiveWorkingTyped.mockResolvedValueOnce({
      ...mockW,
      review_status: 'pending',
    })
    mockGetCurrentPublishedTyped.mockResolvedValueOnce(null)
    mockDeriveStatus.mockReturnValueOnce({
      ...derivedPublished,
      effectiveStatus: 'published',
      effectiveVerification: 'pending',
    })
    chainResult.mockReturnValueOnce({ data: [], error: null })
    chainResult.mockReturnValueOnce({ data: [], error: null })

    const result = await getMyBusiness()
    expect(result!.status).toBe('published')
    expect(result!.verification_status).toBe('pending')
  })
})

describe('getBusinessBySlug', () => {
  // Helper: identity row returned by the businesses query
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

  // Helper: P snapshot matching the published listing
  const mockP = {
    id: 'p-1',
    business_id: mockBusiness.id,
    amendment: 0,
    is_current: true,
    visibility_status: 'live',
    name: mockBusiness.name,
    slug: mockBusiness.slug,
    description: mockBusiness.description,
    phone: mockBusiness.phone,
    email_contact: mockBusiness.email_contact,
    website: mockBusiness.website,
    abn: mockBusiness.abn,
    suburb: null,
    state: null,
    postcode: null,
    address_text: null,
    lat: null,
    lng: null,
    service_radius_km: null,
    category_ids: [],
    category_names: [],
    primary_category_id: null,
    photos_snapshot: [],
    testimonials_snapshot: [],
    approved_by: null,
    approval_comment: null,
    verification_job_id: null,
    approved_at: '',
    created_at: '',
  }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns null for non-existent business', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const result = await getBusinessBySlug('nonexistent')
    expect(result).toBeNull()
  })

  it('returns null if not publicly visible and not owner', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })
    // Identity query returns business
    maybeSingle.mockResolvedValueOnce({
      data: { ...bizIdentity, billing_status: 'billing_suspended' },
      error: null,
    })
    // P exists but eligibility fails
    mockGetCurrentPublishedTyped.mockResolvedValueOnce({ ...mockP, visibility_status: 'live' })
    mockGetListingEligibility.mockResolvedValueOnce({ visiblePublic: false })

    const result = await getBusinessBySlug('test-business')
    expect(result).toBeNull()
  })

  it('returns null if no published listing exists', async () => {
    maybeSingle.mockResolvedValueOnce({ data: bizIdentity, error: null })
    mockGetCurrentPublishedTyped.mockResolvedValueOnce(null)

    const result = await getBusinessBySlug('test-business')
    expect(result).toBeNull()
  })

  it('calculates average rating from P testimonials_snapshot', async () => {
    maybeSingle.mockResolvedValueOnce({ data: bizIdentity, error: null })
    mockGetCurrentPublishedTyped.mockResolvedValueOnce({
      ...mockP,
      testimonials_snapshot: [
        { id: 't1', author_name: 'A', text: 'Good', rating: 4 },
        { id: 't2', author_name: 'B', text: 'Great', rating: 5 },
      ],
    })
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    mockGetListingEligibility.mockResolvedValueOnce({ visiblePublic: true })

    const result = await getBusinessBySlug('test-business')
    expect(result).not.toBeNull()
    expect(result!.avgRating).toBe(4.5)
    expect(result!.reviewCount).toBe(2)
  })

  it('returns location from P denormalized fields', async () => {
    maybeSingle.mockResolvedValueOnce({ data: bizIdentity, error: null })
    mockGetCurrentPublishedTyped.mockResolvedValueOnce({
      ...mockP,
      suburb: 'Sydney',
      state: 'NSW',
      postcode: '2000',
    })
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    mockGetListingEligibility.mockResolvedValueOnce({ visiblePublic: true })

    const result = await getBusinessBySlug('test-business')
    expect(result).not.toBeNull()
    expect(result!.location).toEqual({
      suburb: 'Sydney', state: 'NSW', postcode: '2000',
      address_text: null, service_radius_km: null, lat: null, lng: null,
    })
  })

  it('returns photos from P photos_snapshot sorted by sort_order', async () => {
    maybeSingle.mockResolvedValueOnce({ data: bizIdentity, error: null })
    mockGetCurrentPublishedTyped.mockResolvedValueOnce({
      ...mockP,
      photos_snapshot: [
        { id: 'ph2', url: '/b.jpg', sort_order: 1 },
        { id: 'ph1', url: '/a.jpg', sort_order: 0 },
      ],
    })
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    mockGetListingEligibility.mockResolvedValueOnce({ visiblePublic: true })

    const result = await getBusinessBySlug('test-business')
    expect(result).not.toBeNull()
    expect(result!.photos[0].url).toBe('/a.jpg')
    expect(result!.photos[1].url).toBe('/b.jpg')
  })
})

describe('getMyEntitlements', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns null when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })
    const result = await getMyEntitlements()
    expect(result).toBeNull()
  })

  it('returns entitlements for active subscription', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    // getUserEntitlements: active sub
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'premium', status: 'active', user_id: 'user-123' },
      error: null,
    })
    // getUserEntitlements: business count
    chainResult.mockReturnValueOnce({ count: 1, error: null })

    const result = await getMyEntitlements()
    expect(result).not.toBeNull()
    expect(result!.plan).toBe('premium')
    expect(result!.isActive).toBe(true)
    expect(result!.canUploadPhotos).toBe(true)
    expect(result!.descriptionLimit).toBe(1500)
  })

  it('returns blocked entitlements when no subscription', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    // getUserEntitlements: no active sub
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // getUserEntitlements: business count
    chainResult.mockReturnValueOnce({ count: 0, error: null })
    // getUserEntitlements: canceled sub check
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const result = await getMyEntitlements()
    expect(result).not.toBeNull()
    expect(result!.plan).toBeNull()
    expect(result!.isActive).toBe(false)
    expect(result!.canPublish).toBe(false)
    expect(result!.descriptionLimit).toBe(250)
  })
})

// ─── Duplicate Detection Tests ──────────────────────────────────────

describe('findPotentialDuplicates', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
  })

  it('requires authentication', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    })
    await expect(findPotentialDuplicates('biz-123')).rejects.toThrow()
  })

  it('returns empty array when no nearby businesses', async () => {
    // verifyBusinessOwnership: fetch business
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123' },
      error: null,
    })
    // fetch business with location
    single.mockResolvedValueOnce({
      data: {
        id: 'biz-123',
        name: 'Test Business',
        business_locations: { suburb: 'Brisbane', state: 'QLD', postcode: '4000', lat: -27.47, lng: 153.03 },
      },
      error: null,
    })
    // search index query — no results
    chainResult.mockReturnValueOnce({ data: [], error: null })

    const result = await findPotentialDuplicates('biz-123')
    expect(result).toEqual({ candidates: [] })
  })

  it('returns scored candidates above threshold', async () => {
    // verifyBusinessOwnership: fetch business
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123' },
      error: null,
    })
    // fetch business with location
    single.mockResolvedValueOnce({
      data: {
        id: 'biz-123',
        name: 'Test Plumbing',
        business_locations: { suburb: 'Brisbane', state: 'QLD', postcode: '4000', lat: -27.47, lng: 153.03 },
      },
      error: null,
    })
    // search index query — one matching candidate
    mockFuzzyNameScore.mockReturnValue(0.95)
    chainResult.mockReturnValueOnce({
      data: [
        { business_id: 'seed-1', name: 'Test Plumbing Services', suburb: 'Brisbane', state: 'QLD', postcode: '4000' },
      ],
      error: null,
    })

    const result = await findPotentialDuplicates('biz-123')
    expect(result.candidates.length).toBe(1)
    expect(result.candidates[0].id).toBe('seed-1')
    expect(result.candidates[0].score).toBeGreaterThanOrEqual(70)
    expect(result.candidates[0].matchReasons).toContain('name_similarity')
  })

  it('filters out candidates below score threshold', async () => {
    // verifyBusinessOwnership
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123' },
      error: null,
    })
    // business with location
    single.mockResolvedValueOnce({
      data: {
        id: 'biz-123',
        name: 'Test Business',
        business_locations: { suburb: 'Brisbane', state: 'QLD', postcode: '4000', lat: -27.47, lng: 153.03 },
      },
      error: null,
    })
    // Low similarity — should not pass 70 threshold
    mockFuzzyNameScore.mockReturnValue(0.2)
    chainResult.mockReturnValueOnce({
      data: [
        { business_id: 'seed-1', name: 'Completely Different', suburb: 'Sydney', state: 'NSW', postcode: '2000' },
      ],
      error: null,
    })

    const result = await findPotentialDuplicates('biz-123')
    expect(result.candidates.length).toBe(0)
  })

  it('returns at most 3 candidates', async () => {
    // verifyBusinessOwnership
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123' },
      error: null,
    })
    // business with location
    single.mockResolvedValueOnce({
      data: {
        id: 'biz-123',
        name: 'Test Plumbing',
        business_locations: { suburb: 'Brisbane', state: 'QLD', postcode: '4000', lat: -27.47, lng: 153.03 },
      },
      error: null,
    })
    // High similarity for all 5 candidates
    mockFuzzyNameScore.mockReturnValue(0.95)
    chainResult.mockReturnValueOnce({
      data: [
        { business_id: 'seed-1', name: 'Test Plumbing A', suburb: 'Brisbane', state: 'QLD', postcode: '4000' },
        { business_id: 'seed-2', name: 'Test Plumbing B', suburb: 'Brisbane', state: 'QLD', postcode: '4000' },
        { business_id: 'seed-3', name: 'Test Plumbing C', suburb: 'Brisbane', state: 'QLD', postcode: '4000' },
        { business_id: 'seed-4', name: 'Test Plumbing D', suburb: 'Brisbane', state: 'QLD', postcode: '4000' },
        { business_id: 'seed-5', name: 'Test Plumbing E', suburb: 'Brisbane', state: 'QLD', postcode: '4000' },
      ],
      error: null,
    })

    const result = await findPotentialDuplicates('biz-123')
    expect(result.candidates.length).toBe(3)
  })
})

describe('saveDuplicateChoice', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
  })

  it('requires authentication', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    })
    await expect(saveDuplicateChoice('biz-123', 'matched', 'seed-1', 85)).rejects.toThrow()
  })

  it('saves matched choice with business ID and confidence', async () => {
    // verifyBusinessOwnership
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123' },
      error: null,
    })
    // update
    chainResult.mockReturnValueOnce({ error: null })

    const result = await saveDuplicateChoice('biz-123', 'matched', 'seed-1', 92, [
      { id: 'seed-1', name: 'Test', score: 92 },
    ])
    expect(result).toEqual({ success: true })
  })

  it('saves not_matched choice and clears matched ID', async () => {
    // verifyBusinessOwnership
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123' },
      error: null,
    })
    // update
    chainResult.mockReturnValueOnce({ error: null })

    const result = await saveDuplicateChoice('biz-123', 'not_matched')
    expect(result).toEqual({ success: true })
  })

  it('returns error on update failure', async () => {
    // verifyBusinessOwnership
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123' },
      error: null,
    })
    // update fails
    chainResult.mockReturnValueOnce({ error: { message: 'DB error' } })

    const result = await saveDuplicateChoice('biz-123', 'matched', 'seed-1', 85)
    expect(result).toEqual({ error: 'Failed to save duplicate choice.' })
  })
})
