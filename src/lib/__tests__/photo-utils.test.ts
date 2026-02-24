import { describe, it, expect } from 'vitest'
import { extractStoragePath } from '@/lib/photo-utils'

describe('extractStoragePath', () => {
  it('extracts path from standard Supabase photo URL', () => {
    const url = 'https://myproject.supabase.co/storage/v1/object/public/photos/biz-123/1234-test.jpg'
    expect(extractStoragePath(url)).toBe('biz-123/1234-test.jpg')
  })

  it('extracts path with timestamp prefix', () => {
    const url = 'https://myproject.supabase.co/storage/v1/object/public/photos/biz-456/1706123456789-my-photo.jpg'
    expect(extractStoragePath(url)).toBe('biz-456/1706123456789-my-photo.jpg')
  })

  it('decodes URL-encoded characters', () => {
    const url = 'https://myproject.supabase.co/storage/v1/object/public/photos/biz-123/some%20file%20name.jpg'
    expect(extractStoragePath(url)).toBe('biz-123/some file name.jpg')
  })

  it('returns null for non-Supabase URL', () => {
    expect(extractStoragePath('https://example.com/photo.jpg')).toBeNull()
  })

  it('returns null for invalid URL', () => {
    expect(extractStoragePath('not-a-url')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractStoragePath('')).toBeNull()
  })

  it('returns null for URL with different bucket', () => {
    const url = 'https://myproject.supabase.co/storage/v1/object/public/avatars/user-123/avatar.png'
    expect(extractStoragePath(url)).toBeNull()
  })

  it('handles nested paths', () => {
    const url = 'https://myproject.supabase.co/storage/v1/object/public/photos/biz-123/subfolder/deep/photo.png'
    expect(extractStoragePath(url)).toBe('biz-123/subfolder/deep/photo.png')
  })
})
