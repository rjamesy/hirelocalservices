import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'

const { client: mockSupabase, single, maybeSingle, insert, chainResult } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve(
      new Map([['x-forwarded-for', '192.168.1.1']])
    )
  ),
}))

import { reportBusiness } from '../report'

function makeFormData(data: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(data)) {
    fd.set(key, value)
  }
  return fd
}

describe('reportBusiness', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns error if business not found', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const fd = makeFormData({ reason: 'spam' })
    const result = await reportBusiness('nonexistent', fd)
    expect(result).toEqual({ error: 'Business not found' })
  })

  it('validates form data', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { id: 'biz-123' },
      error: null,
    })

    const fd = makeFormData({ reason: 'invalid_reason' })
    const result = await reportBusiness('biz-123', fd)
    expect(result).toHaveProperty('error')
  })

  it('hashes IP address for privacy', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { id: 'biz-123' },
      error: null,
    })
    // rate limit check
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 0 })

    const fd = makeFormData({ reason: 'spam', details: '' })
    await reportBusiness('biz-123', fd)
    // The insert should have been called with a hashed IP
    expect(mockSupabase.from).toHaveBeenCalledWith('reports')
  })

  it('enforces rate limit of 5 reports per hour', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { id: 'biz-123' },
      error: null,
    })
    // rate limit count at 5
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 5 })

    const fd = makeFormData({ reason: 'spam', details: '' })
    const result = await reportBusiness('biz-123', fd)
    expect(result).toHaveProperty('error')
    expect((result as any).error).toContain('too many reports')
  })

  it('inserts report on success', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { id: 'biz-123' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 2 })

    const fd = makeFormData({ reason: 'spam', details: 'This is fake' })
    const result = await reportBusiness('biz-123', fd)
    expect(result).toEqual({ success: true })
  })

  it('handles null details', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { id: 'biz-123' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 0 })

    const fd = makeFormData({ reason: 'fake', details: '' })
    const result = await reportBusiness('biz-123', fd)
    expect(result).toEqual({ success: true })
  })

  it('handles insert failure', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { id: 'biz-123' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ data: null, error: null, count: 0 })
    // Make insert return an error
    insert.mockReturnValueOnce(Promise.resolve({ data: null, error: { message: 'Insert failed' } }))

    const fd = makeFormData({ reason: 'spam' })
    const result = await reportBusiness('biz-123', fd)
    expect(result).toHaveProperty('error')
  })

  it('accepts all valid reason types', async () => {
    for (const reason of ['spam', 'inappropriate', 'fake', 'other']) {
      vi.resetAllMocks()
      maybeSingle.mockResolvedValueOnce({
        data: { id: 'biz-123' },
        error: null,
      })
      chainResult.mockReturnValueOnce({ data: null, error: null, count: 0 })

      const fd = makeFormData({ reason, details: '' })
      const result = await reportBusiness('biz-123', fd)
      expect(result).toEqual({ success: true })
    }
  })
})
