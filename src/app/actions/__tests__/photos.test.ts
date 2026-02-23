import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'
import { mockUser } from '@/__tests__/helpers/test-data'

const { client: mockSupabase, single, maybeSingle, chainResult } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { getUploadUrl, addPhoto, deletePhoto, reorderPhotos } from '../photos'

describe('getUploadUrl', () => {
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

  it('requires premium plan', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'basic' },
      error: null,
    })
    const result = await getUploadUrl('biz-123', 'test.jpg')
    expect(result).toEqual({ error: 'premium_required' })
  })

  it('returns error when no subscription', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    const result = await getUploadUrl('biz-123', 'test.jpg')
    expect(result).toEqual({ error: 'premium_required' })
  })

  it('enforces max photo limit', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'premium' },
      error: null,
    })
    // photo count at max
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 10 })

    const result = await getUploadUrl('biz-123', 'test.jpg')
    expect(result).toHaveProperty('error')
    expect((result as any).error).toContain('maximum')
  })

  it('returns signed URL for premium user', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'premium' },
      error: null,
    })
    // photo count OK
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 3 })

    const result = await getUploadUrl('biz-123', 'my photo.jpg')
    expect(result).toHaveProperty('data')
    expect((result as any).data).toHaveProperty('signedUrl')
    expect((result as any).data).toHaveProperty('path')
  })

  it('allows premium_annual plan', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'premium_annual' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 0 })

    const result = await getUploadUrl('biz-123', 'test.jpg')
    expect(result).toHaveProperty('data')
  })

  it('requires authentication', async () => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authed' },
    })
    await expect(getUploadUrl('biz-123', 'test.jpg')).rejects.toThrow('logged in')
  })
})

describe('addPhoto', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test-biz' },
      error: null,
    })
  })

  it('requires premium plan', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'basic' },
      error: null,
    })
    const result = await addPhoto('biz-123', 'https://url.com/photo.jpg', 0)
    expect(result).toEqual({ error: 'premium_required' })
  })

  it('enforces max photo limit', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'premium' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 10 })

    const result = await addPhoto('biz-123', 'https://url.com/photo.jpg', 0)
    expect(result).toHaveProperty('error')
  })

  it('inserts photo on success', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { plan: 'premium' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 3 })
    single.mockResolvedValueOnce({
      data: { id: 'photo-1', url: 'https://url.com/photo.jpg', sort_order: 0 },
      error: null,
    })

    const result = await addPhoto('biz-123', 'https://url.com/photo.jpg', 0)
    expect(result).toHaveProperty('data')
  })
})

describe('deletePhoto', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
  })

  it('returns error for non-existent photo', async () => {
    single.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } })
    const result = await deletePhoto('nonexistent')
    expect(result).toEqual({ error: 'Photo not found' })
  })

  it('verifies business ownership before deleting', async () => {
    // photo fetch
    single.mockResolvedValueOnce({
      data: { id: 'photo-1', business_id: 'biz-123', url: 'https://example.supabase.co/storage/v1/object/public/photos/biz-123/1234-test.jpg' },
      error: null,
    })
    // business fetch
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'other-user', slug: 'test' },
      error: null,
    })

    const result = await deletePhoto('photo-1')
    expect(result).toEqual({ error: 'You do not have permission to delete this photo' })
  })

  it('deletes from storage and DB', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'photo-1', business_id: 'biz-123', url: 'https://example.supabase.co/storage/v1/object/public/photos/biz-123/1234-test.jpg' },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test' },
      error: null,
    })

    const result = await deletePhoto('photo-1')
    expect(result).toEqual({ success: true })
    expect(mockSupabase.storage.from).toHaveBeenCalledWith('photos')
  })

  it('still deletes DB record if URL parsing fails', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'photo-1', business_id: 'biz-123', url: 'invalid-url' },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test' },
      error: null,
    })

    const result = await deletePhoto('photo-1')
    expect(result).toEqual({ success: true })
  })
})

describe('reorderPhotos', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test-biz' },
      error: null,
    })
  })

  it('updates sort_order for each photo', async () => {
    const result = await reorderPhotos('biz-123', ['photo-1', 'photo-2', 'photo-3'])
    expect(result).toEqual({ success: true })
    expect(mockSupabase.from).toHaveBeenCalledWith('photos')
  })
})
