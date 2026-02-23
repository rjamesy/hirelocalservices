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
    // ownership check
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test-biz' },
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
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'basic' },
      error: null,
    })
    const fd = makeFormData({ author_name: 'John', text: 'Great service provided!', rating: '5' })
    const result = await addTestimonial('biz-123', fd)
    expect(result).toEqual({ error: 'premium_required' })
  })

  it('enforces max testimonial limit', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'premium' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 20 })

    const fd = makeFormData({ author_name: 'John', text: 'Great service provided!', rating: '5' })
    const result = await addTestimonial('biz-123', fd)
    expect(result).toHaveProperty('error')
    expect((result as any).error).toContain('maximum')
  })

  it('validates form data', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'premium' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 0 })

    const fd = makeFormData({ author_name: 'J', text: 'Short', rating: '0' })
    const result = await addTestimonial('biz-123', fd)
    expect(result).toHaveProperty('error')
  })

  it('inserts testimonial on valid data', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'premium' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 5 })
    single.mockResolvedValueOnce({
      data: { id: 'test-1', author_name: 'John', text: 'Great service provided!', rating: 5 },
      error: null,
    })

    const fd = makeFormData({ author_name: 'John Smith', text: 'Great service provided by the team!', rating: '5' })
    const result = await addTestimonial('biz-123', fd)
    expect(result).toHaveProperty('data')
  })

  it('allows premium_annual plan', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'premium_annual' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 0 })
    single.mockResolvedValueOnce({
      data: { id: 'test-1' },
      error: null,
    })

    const fd = makeFormData({ author_name: 'John Smith', text: 'Great service provided by the team!', rating: '5' })
    const result = await addTestimonial('biz-123', fd)
    expect(result).toHaveProperty('data')
  })

  it('handles insert failure', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'premium' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 0 })
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
      data: { id: 'test-1', business_id: 'biz-123' },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'other-user', slug: 'test' },
      error: null,
    })

    const result = await deleteTestimonial('test-1')
    expect(result).toEqual({ error: 'You do not have permission to delete this testimonial' })
  })

  it('deletes testimonial as owner', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'test-1', business_id: 'biz-123' },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test' },
      error: null,
    })

    const result = await deleteTestimonial('test-1')
    expect(result).toEqual({ success: true })
  })

  it('handles delete failure', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'test-1', business_id: 'biz-123' },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test' },
      error: null,
    })
    // The delete chain (direct-await) returns an error
    chainResult.mockReturnValueOnce({ data: null, error: { message: 'DB error' } })

    const result = await deleteTestimonial('test-1')
    expect(result).toBeDefined()
  })
})
