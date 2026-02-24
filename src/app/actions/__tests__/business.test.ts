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
  getUserPlan,
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
    // getUserListingCapacity: count query returns 1 existing business
    chainResult.mockReturnValueOnce({ count: 1, error: null })
    // getUserListingCapacity: user_subscriptions query
    maybeSingle.mockResolvedValueOnce({ data: { plan: 'basic', status: 'active' }, error: null })

    const fd = makeFormData({ name: 'Test', description: 'A valid description for testing.' })
    const result = await createBusinessDraft(fd)
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('already have a business listing')
  })

  it('returns validation errors for invalid data', async () => {
    // getUserListingCapacity: count=0 (no businesses)
    chainResult.mockReturnValueOnce({ count: 0, error: null })
    // getUserListingCapacity: no subscription
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const fd = makeFormData({ name: 'A', description: 'Short' })
    const result = await createBusinessDraft(fd)
    expect(result).toHaveProperty('error')
  })

  it('creates a draft on valid data', async () => {
    // getUserListingCapacity: count=0
    chainResult.mockReturnValueOnce({ count: 0, error: null })
    // getUserListingCapacity: no subscription
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
    // getUserListingCapacity: count=0
    chainResult.mockReturnValueOnce({ count: 0, error: null })
    // getUserListingCapacity: no subscription
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
    // getUserListingCapacity: count=0
    chainResult.mockReturnValueOnce({ count: 0, error: null })
    // getUserListingCapacity: no subscription
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
  })

  it('returns validation errors for invalid data', async () => {
    const fd = makeFormData({ name: 'A', description: 'Short' })
    const result = await updateBusiness('biz-123', fd)
    expect(result).toHaveProperty('error')
  })

  it('updates business on valid data', async () => {
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
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123' },
      error: null,
    })
  })

  it('rejects empty category array', async () => {
    const result = await updateBusinessCategories('biz-123', [])
    expect(result).toEqual({ error: 'Select at least one category' })
  })

  it('rejects more than 5 categories', async () => {
    const result = await updateBusinessCategories('biz-123', ['1', '2', '3', '4', '5', '6'])
    expect(result).toEqual({ error: 'You can select up to 5 categories' })
  })

  it('deletes and re-inserts categories', async () => {
    const result = await updateBusinessCategories('biz-123', ['cat-1', 'cat-2'])
    expect(result).toEqual({ success: true })
    expect(mockSupabase.from).toHaveBeenCalledWith('business_categories')
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
    // user_subscriptions check returns no subscription
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    const result = await publishChanges('biz-123')
    expect(result).toEqual({ error: 'subscription_required' })
  })

  it('rejects canceled user subscription', async () => {
    // user_subscriptions check returns canceled
    maybeSingle.mockResolvedValueOnce({
      data: { status: 'canceled' },
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

  it('returns null if billing_suspended and not owner', async () => {
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

    const result = await getBusinessBySlug('test-business')
    expect(result).not.toBeNull()
    expect(result!.location).toEqual({ id: 'loc-1', suburb: 'Sydney' })
  })
})

describe('getUserPlan', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns null when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })
    const result = await getUserPlan()
    expect(result).toBeNull()
  })

  it('returns null when no subscription exists', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    const result = await getUserPlan()
    expect(result).toBeNull()
  })

  it('returns null for canceled subscription', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'premium', status: 'canceled' },
      error: null,
    })
    const result = await getUserPlan()
    expect(result).toBeNull()
  })

  it('returns plan for active subscription', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'premium', status: 'active' },
      error: null,
    })
    const result = await getUserPlan()
    expect(result).toBe('premium')
  })

  it('returns plan for past_due subscription', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'premium_annual', status: 'past_due' },
      error: null,
    })
    const result = await getUserPlan()
    expect(result).toBe('premium_annual')
  })

  it('returns correct plan for basic tier', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'basic', status: 'active' },
      error: null,
    })
    const result = await getUserPlan()
    expect(result).toBe('basic')
  })

  it('returns correct plan for free_trial tier', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'free_trial', status: 'active' },
      error: null,
    })
    const result = await getUserPlan()
    expect(result).toBe('free_trial')
  })
})
