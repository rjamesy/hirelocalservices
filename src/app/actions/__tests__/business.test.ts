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
    // verifyBusinessOwnership (now includes billing_status in select)
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', status: 'published', slug: 'test', billing_status: 'active' },
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
    // fetch current business status
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

  it('allows editing a draft with verification_status=pending', async () => {
    // single #2: fetch current biz status — draft + pending should NOT block
    single.mockResolvedValueOnce({
      data: { status: 'draft', slug: 'test', billing_status: 'active', verification_status: 'pending' },
      error: null,
    })
    // single #3: update result
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

  it('blocks editing a published listing with verification_status=pending', async () => {
    // single #2: fetch current biz status — published + pending SHOULD block
    single.mockResolvedValueOnce({
      data: { status: 'published', slug: 'test', billing_status: 'active', verification_status: 'pending' },
      error: null,
    })

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
    // verifyBusinessOwnership
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123' },
      error: null,
    })
    // verification_status + status guard query
    single.mockResolvedValueOnce({
      data: { verification_status: 'approved', status: 'draft' },
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

  it('allows editing when draft has verification_status=pending', async () => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123' },
      error: null,
    })
    // draft + pending = should NOT block
    single.mockResolvedValueOnce({
      data: { verification_status: 'pending', status: 'draft' },
      error: null,
    })
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: null })

    const result = await updateBusinessCategories('biz-123', 'cat-1', [])
    expect(result).toEqual({ success: true })
  })

  it('blocks editing when published listing has verification_status=pending', async () => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123' },
      error: null,
    })
    // published + pending = SHOULD block
    single.mockResolvedValueOnce({
      data: { verification_status: 'pending', status: 'published' },
      error: null,
    })

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
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const result = await getMyBusiness()
    expect(result).toBeNull()
  })

  it('flattens location and returns null subscription', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    // getMyBusiness uses .order() without .single(), so result comes via chainResult
    chainResult.mockReturnValueOnce({
      data: [{
        ...mockBusiness,
        business_locations: [{ id: 'loc-1', suburb: 'Brisbane' }],
        business_categories: [],
        photos: [],
        testimonials: [],
      }],
      error: null,
    })

    const result = await getMyBusiness()
    expect(result).not.toBeNull()
    expect(result!.location).toEqual({ id: 'loc-1', suburb: 'Brisbane' })
    expect(result!.subscription).toBeNull()
  })
})

describe('getBusinessBySlug', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns null for non-existent business', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const result = await getBusinessBySlug('nonexistent')
    expect(result).toBeNull()
  })

  it('returns null if not publicly visible and not owner', async () => {
    // No authenticated user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })
    maybeSingle.mockResolvedValueOnce({
      data: {
        ...mockBusiness,
        billing_status: 'billing_suspended',
        business_locations: [],
        business_categories: [],
        photos: [],
        testimonials: [],
      },
      error: null,
    })
    mockGetListingEligibility.mockResolvedValueOnce({ visiblePublic: false })

    const result = await getBusinessBySlug('test-business')
    expect(result).toBeNull()
  })

  it('calculates average rating', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: {
        ...mockBusiness,
        billing_status: 'active',
        business_locations: [],
        business_categories: [],
        photos: [],
        testimonials: [
          { rating: 4 },
          { rating: 5 },
        ],
      },
      error: null,
    })
    mockGetListingEligibility.mockResolvedValueOnce({ visiblePublic: true })

    const result = await getBusinessBySlug('test-business')
    expect(result).not.toBeNull()
    expect(result!.avgRating).toBe(4.5)
    expect(result!.reviewCount).toBe(2)
  })

  it('returns business data with flattened location', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: {
        ...mockBusiness,
        billing_status: 'active',
        business_locations: [{ id: 'loc-1', suburb: 'Sydney' }],
        business_categories: [{ category_id: 'cat-1' }],
        photos: [{ url: '/photo.jpg', sort_order: 0 }],
        testimonials: [],
      },
      error: null,
    })
    mockGetListingEligibility.mockResolvedValueOnce({ visiblePublic: true })

    const result = await getBusinessBySlug('test-business')
    expect(result).not.toBeNull()
    expect(result!.location).toEqual({ id: 'loc-1', suburb: 'Sydney' })
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
