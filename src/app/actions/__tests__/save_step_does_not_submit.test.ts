/**
 * Regression guard: Save step actions must NEVER change review_status.
 *
 * Only publishChanges() (the explicit "Submit for Review" action) is allowed
 * to set review_status = 'pending'. All other actions (photo upload, photo
 * delete, testimonial add, testimonial delete, business update, location
 * update, category update) must leave review_status unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'
import { mockUser } from '@/__tests__/helpers/test-data'

const { client: mockSupabase, single, chainResult } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/app/actions/system-settings', () => ({
  getSettingValue: vi.fn(() => Promise.resolve(10)),
}))

const mockGetEditGuard = vi.fn()
const mockUpdateWorking = vi.fn()
const mockSubmitWorking = vi.fn()

vi.mock('@/lib/pw-service', () => ({
  getEditGuard: (...args: any[]) => mockGetEditGuard(...args),
  dualWrite: vi.fn(async (_label: string, fn: () => Promise<void>) => fn()),
  updateWorking: (...args: any[]) => mockUpdateWorking(...args),
  submitWorking: (...args: any[]) => mockSubmitWorking(...args),
}))

vi.mock('@/lib/verification', () => ({
  moderateImages: vi.fn(() => Promise.resolve([{ safe: true, adult_content: 0, violence: 0 }])),
}))

import { addPhoto, deletePhoto } from '../photos'
import { addTestimonial, deleteTestimonial } from '../testimonials'

describe('save step does not submit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    mockGetEditGuard.mockResolvedValue({
      underReview: false,
      verificationOk: false,
      isLive: false,
      visibilityStatus: null,
    })
    mockSubmitWorking.mockReset()
  })

  it('addPhoto does not call submitWorking', async () => {
    // ownership check
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test-biz', status: 'draft' },
      error: null,
    })
    // photo count
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 0 })
    // insert result
    single.mockResolvedValueOnce({
      data: { id: 'photo-1', url: 'https://url.com/photo.jpg', sort_order: 0, status: 'live' },
      error: null,
    })

    await addPhoto('biz-123', 'https://url.com/photo.jpg', 0)
    expect(mockSubmitWorking).not.toHaveBeenCalled()
  })

  it('deletePhoto does not call submitWorking', async () => {
    // photo fetch
    single.mockResolvedValueOnce({
      data: { id: 'photo-1', business_id: 'biz-123', url: 'https://example.supabase.co/storage/v1/object/public/photos/biz-123/1234-test.jpg', status: 'live' },
      error: null,
    })
    // business fetch
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test', status: 'draft' },
      error: null,
    })

    await deletePhoto('photo-1')
    expect(mockSubmitWorking).not.toHaveBeenCalled()
  })

  it('addTestimonial does not call submitWorking', async () => {
    // ownership check
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test-biz', status: 'draft' },
      error: null,
    })
    // testimonial count
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 0 })
    // insert result
    single.mockResolvedValueOnce({
      data: { id: 'test-1', author_name: 'John', text: 'Great service!', rating: 5, status: 'live' },
      error: null,
    })

    const fd = new FormData()
    fd.set('author_name', 'John Smith')
    fd.set('text', 'Great service provided by the team!')
    fd.set('rating', '5')

    await addTestimonial('biz-123', fd)
    expect(mockSubmitWorking).not.toHaveBeenCalled()
  })

  it('deleteTestimonial does not call submitWorking', async () => {
    // testimonial fetch
    single.mockResolvedValueOnce({
      data: { id: 'test-1', business_id: 'biz-123', status: 'live' },
      error: null,
    })
    // business fetch
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test', status: 'draft' },
      error: null,
    })

    await deleteTestimonial('test-1')
    expect(mockSubmitWorking).not.toHaveBeenCalled()
  })
})
