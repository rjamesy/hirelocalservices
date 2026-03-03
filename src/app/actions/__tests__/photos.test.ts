import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'
import { mockUser } from '@/__tests__/helpers/test-data'

const { client: mockSupabase, single, chainResult, storageBucket } = createMockSupabaseClient()

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
vi.mock('@/lib/pw-service', () => ({
  getEditGuard: (...args: any[]) => mockGetEditGuard(...args),
}))

vi.mock('@/lib/verification', () => ({
  moderateImages: vi.fn(() => Promise.resolve([{ safe: true, adult_content: 0, violence: 0 }])),
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
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test-biz', status: 'draft' },
      error: null,
    })
  })

  it('enforces max photo limit', async () => {
    // photo count at max (no entitlements check — gate removed)
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 10 })

    const result = await getUploadUrl('biz-123', 'test.jpg')
    expect(result).toHaveProperty('error')
    expect((result as any).error).toContain('maximum')
  })

  it('returns signed URL when under limit', async () => {
    // photo count OK
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 3 })

    const result = await getUploadUrl('biz-123', 'my photo.jpg')
    expect(result).toHaveProperty('data')
    expect((result as any).data).toHaveProperty('signedUrl')
    expect((result as any).data).toHaveProperty('path')
  })

  it('requires authentication', async () => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authed' },
    })
    await expect(getUploadUrl('biz-123', 'test.jpg')).rejects.toThrow('logged in')
  })

  it('excludes pending_delete photos from count', async () => {
    // Count returns 9 (one pending_delete excluded by .neq query)
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 9 })

    const result = await getUploadUrl('biz-123', 'test.jpg')
    expect(result).toHaveProperty('data')
  })
})

describe('addPhoto', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    mockGetEditGuard.mockResolvedValue({ underReview: false, verificationOk: false, isLive: false, visibilityStatus: null })
  })

  it('enforces max photo limit', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test-biz', status: 'draft' },
      error: null,
    })
    // photo count at max (no entitlements check — gate removed)
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 10 })

    const result = await addPhoto('biz-123', 'https://url.com/photo.jpg', 0)
    expect(result).toHaveProperty('error')
  })

  it('inserts photo with live status for draft business', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test-biz', status: 'draft' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 3 }) // photo count
    single.mockResolvedValueOnce({
      data: { id: 'photo-1', url: 'https://url.com/photo.jpg', sort_order: 0, status: 'live' },
      error: null,
    })

    const result = await addPhoto('biz-123', 'https://url.com/photo.jpg', 0)
    expect(result).toHaveProperty('data')
    expect((result as any).data.status).toBe('live')
  })

  it('inserts photo with pending_add status for published business', async () => {
    mockGetEditGuard.mockResolvedValueOnce({ underReview: false, verificationOk: true, isLive: true, visibilityStatus: 'live' })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test-biz', status: 'published' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 3 }) // photo count
    single.mockResolvedValueOnce({
      data: { id: 'photo-1', url: 'https://url.com/photo.jpg', sort_order: 0, status: 'pending_add' },
      error: null,
    })

    const result = await addPhoto('biz-123', 'https://url.com/photo.jpg', 0)
    expect(result).toHaveProperty('data')
    expect((result as any).data.status).toBe('pending_add')
  })

  it('inserts photo with pending_add status for paused business', async () => {
    mockGetEditGuard.mockResolvedValueOnce({ underReview: false, verificationOk: true, isLive: true, visibilityStatus: 'paused' })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test-biz', status: 'paused' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 0 }) // photo count
    single.mockResolvedValueOnce({
      data: { id: 'photo-1', url: 'https://url.com/photo.jpg', sort_order: 0, status: 'pending_add' },
      error: null,
    })

    const result = await addPhoto('biz-123', 'https://url.com/photo.jpg', 0)
    expect(result).toHaveProperty('data')
    expect((result as any).data.status).toBe('pending_add')
  })
})

describe('deletePhoto', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    mockGetEditGuard.mockResolvedValue({ underReview: false, verificationOk: false, isLive: false, visibilityStatus: null })
  })

  it('returns error for non-existent photo', async () => {
    single.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } })
    const result = await deletePhoto('nonexistent')
    expect(result).toEqual({ error: 'Photo not found' })
  })

  it('verifies business ownership before deleting', async () => {
    // photo fetch
    single.mockResolvedValueOnce({
      data: { id: 'photo-1', business_id: 'biz-123', url: 'https://example.supabase.co/storage/v1/object/public/photos/biz-123/1234-test.jpg', status: 'live' },
      error: null,
    })
    // business fetch
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'other-user', slug: 'test', status: 'published' },
      error: null,
    })

    const result = await deletePhoto('photo-1')
    expect(result).toEqual({ error: 'You do not have permission to delete this photo' })
  })

  it('immediately deletes photo from draft business', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'photo-1', business_id: 'biz-123', url: 'https://example.supabase.co/storage/v1/object/public/photos/biz-123/1234-test.jpg', status: 'live' },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test', status: 'draft' },
      error: null,
    })

    const result = await deletePhoto('photo-1')
    expect(result).toEqual({ success: true })
    expect(mockSupabase.storage.from).toHaveBeenCalledWith('photos')
  })

  it('marks live photo as pending_delete on published business', async () => {
    mockGetEditGuard.mockResolvedValueOnce({ underReview: false, verificationOk: true, isLive: true, visibilityStatus: 'live' })
    single.mockResolvedValueOnce({
      data: { id: 'photo-1', business_id: 'biz-123', url: 'https://example.supabase.co/storage/v1/object/public/photos/biz-123/1234-test.jpg', status: 'live' },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test', status: 'published' },
      error: null,
    })

    const result = await deletePhoto('photo-1')
    expect(result).toEqual({ success: true })
    // Should NOT have deleted from storage (pending_delete, not immediate)
    expect(mockSupabase.storage.from).not.toHaveBeenCalled()
  })

  it('marks live photo as pending_delete on paused business', async () => {
    mockGetEditGuard.mockResolvedValueOnce({ underReview: false, verificationOk: true, isLive: true, visibilityStatus: 'paused' })
    single.mockResolvedValueOnce({
      data: { id: 'photo-1', business_id: 'biz-123', url: 'https://example.supabase.co/storage/v1/object/public/photos/biz-123/1234-test.jpg', status: 'live' },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test', status: 'paused' },
      error: null,
    })

    const result = await deletePhoto('photo-1')
    expect(result).toEqual({ success: true })
    expect(mockSupabase.storage.from).not.toHaveBeenCalled()
  })

  it('immediately deletes pending_add photo on published business', async () => {
    mockGetEditGuard.mockResolvedValueOnce({ underReview: false, verificationOk: true, isLive: true, visibilityStatus: 'live' })
    single.mockResolvedValueOnce({
      data: { id: 'photo-1', business_id: 'biz-123', url: 'https://example.supabase.co/storage/v1/object/public/photos/biz-123/1234-test.jpg', status: 'pending_add' },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test', status: 'published' },
      error: null,
    })

    const result = await deletePhoto('photo-1')
    expect(result).toEqual({ success: true })
    // pending_add photos are immediately deleted from storage
    expect(mockSupabase.storage.from).toHaveBeenCalledWith('photos')
  })

  it('still deletes DB record if URL parsing fails', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'photo-1', business_id: 'biz-123', url: 'invalid-url', status: 'live' },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test', status: 'draft' },
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
    mockGetEditGuard.mockResolvedValue({ underReview: false, verificationOk: false, isLive: false, visibilityStatus: null })
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', owner_id: 'user-123', slug: 'test-biz', status: 'published' },
      error: null,
    })
  })

  it('updates sort_order for each photo', async () => {
    const result = await reorderPhotos('biz-123', ['photo-1', 'photo-2', 'photo-3'])
    expect(result).toEqual({ success: true })
    expect(mockSupabase.from).toHaveBeenCalledWith('photos')
  })
})
