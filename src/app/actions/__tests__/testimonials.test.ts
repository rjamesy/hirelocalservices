import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'
import { mockUser } from '@/__tests__/helpers/test-data'

const { client: mockSupabase, single, maybeSingle, eq, chainResult } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/app/actions/system-settings', () => ({
  getSettingValue: vi.fn(() => Promise.resolve(10)),
}))

import { addTestimonial, deleteTestimonial } from '../testimonials'

function makeFormData(data: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(data)) {
    fd.set(key, value)
  }
  return fd
}

describe('addTestimonial', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
  })

  it('requires authentication', async () => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authed' },
    })
    const fd = makeFormData({ author_name: 'John', text: 'Great service!', rating: '5' })
    await expect(addTestimonial('biz-123', fd)).rejects.toThrow('logged in')
  })

  it('requires premium plan', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test-biz', status: 'draft' },
      error: null,
    })
    // getUserEntitlements: basic plan
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'basic', status: 'active' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ count: 0, error: null }) // entitlements: business count
    const fd = makeFormData({ author_name: 'John', text: 'Great service provided!', rating: '5' })
    const result = await addTestimonial('biz-123', fd)
    expect(result).toEqual({ error: 'premium_required' })
  })

  it('enforces max testimonial limit', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test-biz', status: 'draft' },
      error: null,
    })
    // getUserEntitlements: premium plan
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'premium', status: 'active' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ count: 0, error: null }) // entitlements: business count
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 20 }) // testimonial count

    const fd = makeFormData({ author_name: 'John', text: 'Great service provided!', rating: '5' })
    const result = await addTestimonial('biz-123', fd)
    expect(result).toHaveProperty('error')
    expect((result as any).error).toContain('maximum')
  })

  it('validates form data', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test-biz', status: 'draft' },
      error: null,
    })
    // getUserEntitlements: premium plan
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'premium', status: 'active' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ count: 0, error: null }) // entitlements: business count
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 0 }) // testimonial count

    const fd = makeFormData({ author_name: 'J', text: 'Short', rating: '0' })
    const result = await addTestimonial('biz-123', fd)
    expect(result).toHaveProperty('error')
  })

  it('inserts testimonial with live status for draft business', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test-biz', status: 'draft' },
      error: null,
    })
    // getUserEntitlements: premium plan
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'premium', status: 'active' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ count: 0, error: null }) // entitlements: business count
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 5 }) // testimonial count
    single.mockResolvedValueOnce({
      data: { id: 'test-1', author_name: 'John Smith', text: 'Great service provided!', rating: 5, status: 'live' },
      error: null,
    })

    const fd = makeFormData({ author_name: 'John Smith', text: 'Great service provided by the team!', rating: '5' })
    const result = await addTestimonial('biz-123', fd)
    expect(result).toHaveProperty('data')
    expect((result as any).data.status).toBe('live')
  })

  it('inserts testimonial with pending_add status for published business', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test-biz', status: 'published' },
      error: null,
    })
    // getUserEntitlements: premium plan
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'premium', status: 'active' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ count: 0, error: null }) // entitlements: business count
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 5 }) // testimonial count
    single.mockResolvedValueOnce({
      data: { id: 'test-1', author_name: 'John Smith', text: 'Great service!', rating: 5, status: 'pending_add' },
      error: null,
    })

    const fd = makeFormData({ author_name: 'John Smith', text: 'Great service provided by the team!', rating: '5' })
    const result = await addTestimonial('biz-123', fd)
    expect(result).toHaveProperty('data')
    expect((result as any).data.status).toBe('pending_add')
  })

  it('inserts testimonial with pending_add status for paused business', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test-biz', status: 'paused' },
      error: null,
    })
    // getUserEntitlements: premium plan
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'premium', status: 'active' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ count: 0, error: null }) // entitlements: business count
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 0 }) // testimonial count
    single.mockResolvedValueOnce({
      data: { id: 'test-1', author_name: 'Jane', text: 'Excellent!', rating: 4, status: 'pending_add' },
      error: null,
    })

    const fd = makeFormData({ author_name: 'Jane Smith', text: 'Excellent service provided here!', rating: '4' })
    const result = await addTestimonial('biz-123', fd)
    expect(result).toHaveProperty('data')
    expect((result as any).data.status).toBe('pending_add')
  })

  it('allows premium_annual plan', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test-biz', status: 'draft' },
      error: null,
    })
    // getUserEntitlements: premium_annual plan
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'premium_annual', status: 'active' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ count: 0, error: null }) // entitlements: business count
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 0 }) // testimonial count
    single.mockResolvedValueOnce({
      data: { id: 'test-1' },
      error: null,
    })

    const fd = makeFormData({ author_name: 'John Smith', text: 'Great service provided by the team!', rating: '5' })
    const result = await addTestimonial('biz-123', fd)
    expect(result).toHaveProperty('data')
  })

  it('handles insert failure', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test-biz', status: 'draft' },
      error: null,
    })
    // getUserEntitlements: premium plan
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'premium', status: 'active' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ count: 0, error: null }) // entitlements: business count
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 0 }) // testimonial count
    single.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })

    const fd = makeFormData({ author_name: 'John Smith', text: 'Great service provided by the team!', rating: '5' })
    const result = await addTestimonial('biz-123', fd)
    expect(result).toEqual({ error: 'Failed to add testimonial. Please try again.' })
  })
})

describe('deleteTestimonial', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
  })

  it('returns error for non-existent testimonial', async () => {
    single.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } })
    const result = await deleteTestimonial('nonexistent')
    expect(result).toEqual({ error: 'Testimonial not found' })
  })

  it('verifies business ownership', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'test-1', business_id: 'biz-123', status: 'live' },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'other-user', slug: 'test', status: 'published' },
      error: null,
    })

    const result = await deleteTestimonial('test-1')
    expect(result).toEqual({ error: 'You do not have permission to delete this testimonial' })
  })

  it('immediately deletes testimonial from draft business', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'test-1', business_id: 'biz-123', status: 'live' },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test', status: 'draft' },
      error: null,
    })

    const result = await deleteTestimonial('test-1')
    expect(result).toEqual({ success: true })
  })

  it('marks live testimonial as pending_delete on published business', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'test-1', business_id: 'biz-123', status: 'live' },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test', status: 'published' },
      error: null,
    })

    const result = await deleteTestimonial('test-1')
    expect(result).toEqual({ success: true })
  })

  it('marks live testimonial as pending_delete on paused business', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'test-1', business_id: 'biz-123', status: 'live' },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test', status: 'paused' },
      error: null,
    })

    const result = await deleteTestimonial('test-1')
    expect(result).toEqual({ success: true })
  })

  it('immediately deletes pending_add testimonial on published business', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'test-1', business_id: 'biz-123', status: 'pending_add' },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test', status: 'published' },
      error: null,
    })

    const result = await deleteTestimonial('test-1')
    expect(result).toEqual({ success: true })
  })

  it('handles delete failure', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'test-1', business_id: 'biz-123', status: 'live' },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test', status: 'draft' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ data: null, error: { message: 'DB error' } })

    const result = await deleteTestimonial('test-1')
    expect(result).toBeDefined()
  })

  it('handles update failure for pending_delete', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'test-1', business_id: 'biz-123', status: 'live' },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test', status: 'published' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ data: null, error: { message: 'DB error' } })

    const result = await deleteTestimonial('test-1')
    expect(result).toEqual({ error: 'Failed to mark testimonial for deletion. Please try again.' })
  })
})
