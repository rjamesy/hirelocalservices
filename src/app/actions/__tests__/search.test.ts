import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'

const { client: mockSupabase, maybeSingle, order, ilike, limit } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

import { searchBusinesses, lookupPostcode, lookupSuburb } from '../search'

describe('searchBusinesses', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('rejects search with no businessName and no location', async () => {
    const result = await searchBusinesses({})
    expect(result.error).toBeDefined()
    expect(result.results).toEqual([])
    expect(result.totalCount).toBe(0)
    expect(mockSupabase.rpc).not.toHaveBeenCalled()
  })

  it('rejects category-only search', async () => {
    const result = await searchBusinesses({ category: 'plumbing' })
    expect(result.error).toBeDefined()
    expect(result.results).toEqual([])
    expect(mockSupabase.rpc).not.toHaveBeenCalled()
  })

  it('accepts businessName-only search and calls RPC', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: [{ id: '1', total_count: 1 }],
      error: null,
    })

    const result = await searchBusinesses({
      businessName: 'Test Plumbing',
    })

    expect(result.error).toBeUndefined()
    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_businesses', expect.objectContaining({
      p_keyword: 'Test Plumbing',
      p_lat: null,
      p_lng: null,
    }))
    expect(result.results).toHaveLength(1)
  })

  it('validates location token against postcodes table', async () => {
    // Mock location validation
    maybeSingle.mockResolvedValueOnce({
      data: { suburb: 'BRISBANE', state: 'QLD', postcode: '4000', lat: -27.47, lng: 153.02 },
      error: null,
    })
    mockSupabase.rpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await searchBusinesses({
      category: 'plumbing',
      location: { suburb: 'Brisbane', state: 'QLD', postcode: '4000' },
      radius_km: 25,
    })

    expect(result.error).toBeUndefined()
    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_businesses', expect.objectContaining({
      p_category_slug: 'plumbing',
      p_lat: -27.47,
      p_lng: 153.02,
      p_radius_km: 25,
    }))
  })

  it('returns error for invalid location token', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const result = await searchBusinesses({
      location: { suburb: 'FakePlace', state: 'QLD', postcode: '9999' },
    })

    expect(result.error).toBeDefined()
    expect(result.results).toEqual([])
    expect(mockSupabase.rpc).not.toHaveBeenCalled()
  })

  it('calculates pagination correctly', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await searchBusinesses({ businessName: 'Test', page: 3 })
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'search_businesses',
      expect.objectContaining({ p_offset: 40 })
    )
    expect(result.page).toBe(3)
  })

  it('returns empty results on RPC error', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { suburb: 'BRISBANE', state: 'QLD', postcode: '4000', lat: -27.47, lng: 153.02 },
      error: null,
    })
    mockSupabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'RPC error' },
    })

    const result = await searchBusinesses({
      location: { suburb: 'Brisbane', state: 'QLD', postcode: '4000' },
    })
    expect(result.results).toEqual([])
    expect(result.totalCount).toBe(0)
  })

  it('calculates totalPages from total_count', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: [{ id: '1', total_count: 45 }],
      error: null,
    })

    const result = await searchBusinesses({ businessName: 'Test' })
    expect(result.totalCount).toBe(45)
    expect(result.totalPages).toBe(3) // ceil(45/20)
  })
})

describe('lookupPostcode', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns null for invalid postcode format', async () => {
    const result = await lookupPostcode('12')
    expect(result).toBeNull()
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })

  it('returns null for non-numeric postcode', async () => {
    const result = await lookupPostcode('abcd')
    expect(result).toBeNull()
  })

  it('queries postcodes table for valid format', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { suburb: 'Brisbane', state: 'QLD', lat: -27.47, lng: 153.02 },
      error: null,
    })

    const result = await lookupPostcode('4000')
    expect(result).toEqual({
      suburb: 'Brisbane',
      state: 'QLD',
      lat: -27.47,
      lng: 153.02,
    })
  })

  it('returns null when postcode not found', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const result = await lookupPostcode('9999')
    expect(result).toBeNull()
  })
})

describe('lookupSuburb', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns empty array for short query', async () => {
    const result = await lookupSuburb('B')
    expect(result).toEqual([])
  })

  it('returns empty array for empty query', async () => {
    const result = await lookupSuburb('')
    expect(result).toEqual([])
  })

  it('searches by suburb name for text queries', async () => {
    order.mockReturnValueOnce(
      Promise.resolve({
        data: [{ postcode: '4000', suburb: 'Brisbane', state: 'QLD', lat: -27.47, lng: 153.02 }],
        error: null,
      })
    )

    const result = await lookupSuburb('Bris')
    expect(result).toHaveLength(1)
    expect(result[0].suburb).toBe('Brisbane')
  })

  it('searches by postcode prefix for digit queries', async () => {
    order.mockReturnValueOnce(
      Promise.resolve({
        data: [{ postcode: '4000', suburb: 'Brisbane', state: 'QLD', lat: -27.47, lng: 153.02 }],
        error: null,
      })
    )

    const result = await lookupSuburb('40')
    expect(result).toHaveLength(1)
    expect(ilike).toHaveBeenCalled()
  })

  it('returns empty array on error', async () => {
    order.mockReturnValueOnce(
      Promise.resolve({ data: null, error: { message: 'Error' } })
    )

    const result = await lookupSuburb('Brisbane')
    expect(result).toEqual([])
  })

  it('limits results to 10', async () => {
    order.mockReturnValueOnce(
      Promise.resolve({ data: [], error: null })
    )

    await lookupSuburb('Syd')
    expect(limit).toHaveBeenCalledWith(10)
  })
})
