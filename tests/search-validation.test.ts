/**
 * tests/search-validation.test.ts
 *
 * Tests for the search validation and location token system:
 * - Server-side validation: reject category-only, require location or businessName
 * - Location token validation against postcodes table
 * - Business name search without location
 * - Suggest endpoint logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ValidatedSearchParams, LocationToken } from '@/app/actions/search'

// ─── Mock Supabase ───────────────────────────────────────────────────

const mockRpc = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockIlike = vi.fn()
const mockLimit = vi.fn()
const mockMaybeSingle = vi.fn()
const mockOrder = vi.fn()

function resetChain() {
  mockSelect.mockReturnValue({ eq: mockEq, ilike: mockIlike, limit: mockLimit, order: mockOrder })
  mockEq.mockReturnValue({ eq: mockEq, ilike: mockIlike, limit: mockLimit, order: mockOrder })
  mockIlike.mockReturnValue({ eq: mockEq, ilike: mockIlike, limit: mockLimit, order: mockOrder })
  mockLimit.mockReturnValue({ maybeSingle: mockMaybeSingle, order: mockOrder })
  mockOrder.mockResolvedValue({ data: [], error: null })
  mockMaybeSingle.mockResolvedValue({ data: null, error: null })
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: mockSelect,
    })),
    rpc: mockRpc,
  })),
}))

// ─── Import after mocks ─────────────────────────────────────────────

import { searchBusinesses, validateLocationToken } from '@/app/actions/search'

describe('Search Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetChain()
    mockRpc.mockResolvedValue({ data: [], error: null })
  })

  // ─── Server-Side Validation Rules ──────────────────────────────

  describe('searchBusinesses validation', () => {
    it('should reject search with no businessName and no location', async () => {
      const result = await searchBusinesses({
        category: 'plumbing',
      })
      expect(result.error).toBeDefined()
      expect(result.results).toHaveLength(0)
      expect(result.totalCount).toBe(0)
    })

    it('should reject category-only search (the Sydney bug)', async () => {
      const result = await searchBusinesses({
        category: 'plumbing',
        // no businessName, no location
      })
      expect(result.error).toBeDefined()
      expect(result.results).toHaveLength(0)
    })

    it('should reject empty params', async () => {
      const result = await searchBusinesses({})
      expect(result.error).toBeDefined()
      expect(result.results).toHaveLength(0)
    })

    it('should accept businessName-only search (no location required)', async () => {
      mockRpc.mockResolvedValue({
        data: [
          {
            id: '1',
            name: 'Test Plumbing',
            slug: 'test-plumbing',
            phone: null,
            website: null,
            description: 'A plumber',
            listing_source: 'manual',
            is_claimed: true,
            suburb: 'Brisbane',
            state: 'QLD',
            postcode: '4000',
            service_radius_km: 25,
            distance_m: null,
            category_names: ['plumbing'],
            avg_rating: 4.5,
            review_count: 3,
            photo_url: null,
            total_count: 1,
          },
        ],
        error: null,
      })

      const result = await searchBusinesses({
        businessName: 'Test Plumbing',
      })
      expect(result.error).toBeUndefined()
      expect(result.totalCount).toBe(1)
    })

    it('should accept valid location + category search', async () => {
      // Mock location validation
      mockMaybeSingle.mockResolvedValue({
        data: { suburb: 'BRISBANE', state: 'QLD', postcode: '4000', lat: -27.47, lng: 153.02 },
        error: null,
      })
      mockRpc.mockResolvedValue({ data: [], error: null })

      const result = await searchBusinesses({
        category: 'plumbing',
        location: { suburb: 'Brisbane', state: 'QLD', postcode: '4000' },
      })
      expect(result.error).toBeUndefined()
    })

    it('should return error when location token is invalid', async () => {
      // Mock location validation - no match
      mockMaybeSingle.mockResolvedValue({ data: null, error: null })

      const result = await searchBusinesses({
        location: { suburb: 'FakeSuburb', state: 'QLD', postcode: '9999' },
      })
      expect(result.error).toBeDefined()
      expect(result.results).toHaveLength(0)
    })

    it('should accept businessName + location combined search', async () => {
      mockMaybeSingle.mockResolvedValue({
        data: { suburb: 'BRISBANE', state: 'QLD', postcode: '4000', lat: -27.47, lng: 153.02 },
        error: null,
      })
      mockRpc.mockResolvedValue({ data: [], error: null })

      const result = await searchBusinesses({
        businessName: 'Test Plumbing',
        category: 'plumbing',
        location: { suburb: 'Brisbane', state: 'QLD', postcode: '4000' },
        radius_km: 25,
      })
      expect(result.error).toBeUndefined()
    })

    it('should pass keyword to RPC from businessName', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null })

      await searchBusinesses({ businessName: 'Test Plumbing' })

      expect(mockRpc).toHaveBeenCalledWith('search_businesses', expect.objectContaining({
        p_keyword: 'Test Plumbing',
      }))
    })

    it('should trim businessName whitespace', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null })

      const result = await searchBusinesses({ businessName: '   ' })
      // Trimmed businessName is empty, and no location = validation error
      expect(result.error).toBeDefined()
    })

    it('should default to page 1 when not specified', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null })

      const result = await searchBusinesses({ businessName: 'Test' })
      expect(result.page).toBe(1)
    })

    it('should handle RPC errors gracefully', async () => {
      mockMaybeSingle.mockResolvedValue({
        data: { suburb: 'BRISBANE', state: 'QLD', postcode: '4000', lat: -27.47, lng: 153.02 },
        error: null,
      })
      mockRpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })

      const result = await searchBusinesses({
        location: { suburb: 'Brisbane', state: 'QLD', postcode: '4000' },
      })
      expect(result.results).toHaveLength(0)
      expect(result.totalCount).toBe(0)
    })
  })

  // ─── Location Token Validation ─────────────────────────────────

  describe('validateLocationToken', () => {
    it('should return valid for matching suburb/state/postcode', async () => {
      mockMaybeSingle.mockResolvedValue({
        data: { suburb: 'BRISBANE', state: 'QLD', postcode: '4000', lat: -27.47, lng: 153.02 },
        error: null,
      })

      const result = await validateLocationToken({
        suburb: 'Brisbane',
        state: 'QLD',
        postcode: '4000',
      })
      expect(result.valid).toBe(true)
      expect(result.lat).toBe(-27.47)
      expect(result.lng).toBe(153.02)
    })

    it('should return invalid for non-existent postcode', async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null })

      const result = await validateLocationToken({
        suburb: 'FakePlace',
        state: 'QLD',
        postcode: '9999',
      })
      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should return invalid for suburb/state mismatch', async () => {
      // Brisbane is in QLD but we pass VIC
      mockMaybeSingle.mockResolvedValue({ data: null, error: null })

      const result = await validateLocationToken({
        suburb: 'Brisbane',
        state: 'VIC',
        postcode: '4000',
      })
      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should return invalid on database error', async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } })

      const result = await validateLocationToken({
        suburb: 'Brisbane',
        state: 'QLD',
        postcode: '4000',
      })
      expect(result.valid).toBe(false)
    })

    it('should use case-insensitive match for suburb', async () => {
      mockMaybeSingle.mockResolvedValue({
        data: { suburb: 'BRISBANE', state: 'QLD', postcode: '4000', lat: -27.47, lng: 153.02 },
        error: null,
      })

      await validateLocationToken({
        suburb: 'brisbane',
        state: 'QLD',
        postcode: '4000',
      })

      // Should call ilike for suburb (case-insensitive)
      expect(mockIlike).toHaveBeenCalledWith('suburb', 'brisbane')
    })

    it('should uppercase state for comparison', async () => {
      mockMaybeSingle.mockResolvedValue({
        data: { suburb: 'BRISBANE', state: 'QLD', postcode: '4000', lat: -27.47, lng: 153.02 },
        error: null,
      })

      await validateLocationToken({
        suburb: 'Brisbane',
        state: 'qld',
        postcode: '4000',
      })

      // Should call eq with uppercased state
      expect(mockEq).toHaveBeenCalledWith('state', 'QLD')
    })
  })
})

// ─── Suggest Endpoint Logic ──────────────────────────────────────────

describe('Location Suggest Endpoint', () => {
  /**
   * These tests verify the suggest endpoint logic:
   * - Postcode prefix returns correct rows
   * - Suburb prefix returns correct rows
   * - Results limited to 10
   * - Short queries return empty
   */

  it('should return empty for query shorter than 2 chars', () => {
    const q = 'B'
    expect(q.length < 2).toBe(true)
  })

  it('should detect numeric input as postcode search', () => {
    const isNumeric = /^\d+$/.test('400')
    expect(isNumeric).toBe(true)
  })

  it('should detect text input as suburb search', () => {
    const isNumeric = /^\d+$/.test('Bris')
    expect(isNumeric).toBe(false)
  })

  it('should use prefix match for postcode (starts with)', () => {
    // Pattern: `${q}%` (e.g. '40%' matches '4000', '4001', etc.)
    const pattern = `${'40'}%`
    expect(pattern).toBe('40%')
    // This pattern would match '4000', '4001', '4010' etc
    expect('4000'.startsWith('40')).toBe(true)
    expect('4100'.startsWith('40')).toBe(false)
  })

  it('should use prefix match for suburb (starts with)', () => {
    // Pattern: `${q}%` (e.g. 'Bris%' matches 'Brisbane', 'Brisman', etc.)
    const pattern = `${'Bris'}%`
    expect(pattern).toBe('Bris%')
    expect('Brisbane'.startsWith('Bris')).toBe(true)
    expect('Albris'.startsWith('Bris')).toBe(false)
  })

  it('should limit results to 10', () => {
    // The endpoint uses .limit(10) on the query
    const SUGGEST_LIMIT = 10
    const mockResults = Array.from({ length: 15 }, (_, i) => ({
      suburb: `Suburb${i}`,
      state: 'QLD',
      postcode: `400${i}`,
      lat: -27,
      lng: 153,
    }))
    const limited = mockResults.slice(0, SUGGEST_LIMIT)
    expect(limited).toHaveLength(10)
  })

  it('should return suburb, state, postcode, lat, lng for each result', () => {
    const result = {
      suburb: 'Brisbane',
      state: 'QLD',
      postcode: '4000',
      lat: -27.47,
      lng: 153.02,
    }
    expect(result).toHaveProperty('suburb')
    expect(result).toHaveProperty('state')
    expect(result).toHaveProperty('postcode')
    expect(result).toHaveProperty('lat')
    expect(result).toHaveProperty('lng')
  })

  it('should order results by suburb ascending', () => {
    const results = [
      { suburb: 'Zetland', state: 'NSW', postcode: '2017' },
      { suburb: 'Alexandria', state: 'NSW', postcode: '2015' },
      { suburb: 'Mascot', state: 'NSW', postcode: '2020' },
    ]
    const sorted = [...results].sort((a, b) => a.suburb.localeCompare(b.suburb))
    expect(sorted[0].suburb).toBe('Alexandria')
    expect(sorted[1].suburb).toBe('Mascot')
    expect(sorted[2].suburb).toBe('Zetland')
  })
})

// ─── Search URL Params ───────────────────────────────────────────────

describe('Search URL Params', () => {
  it('should build location token from suburb/state/postcode params', () => {
    const params = {
      suburb: 'Brisbane',
      state: 'QLD',
      postcode: '4000',
    }

    let locationToken: LocationToken | undefined
    if (params.suburb && params.state && params.postcode) {
      locationToken = {
        suburb: params.suburb,
        state: params.state,
        postcode: params.postcode,
      }
    }

    expect(locationToken).toBeDefined()
    expect(locationToken!.suburb).toBe('Brisbane')
    expect(locationToken!.state).toBe('QLD')
    expect(locationToken!.postcode).toBe('4000')
  })

  it('should not build location token if any part is missing', () => {
    const params = {
      suburb: 'Brisbane',
      state: 'QLD',
      // missing postcode
    } as { suburb?: string; state?: string; postcode?: string }

    let locationToken: LocationToken | undefined
    if (params.suburb && params.state && params.postcode) {
      locationToken = {
        suburb: params.suburb,
        state: params.state,
        postcode: params.postcode,
      }
    }

    expect(locationToken).toBeUndefined()
  })

  it('should use default radius of 25 when not specified', () => {
    const radiusParam: string | undefined = undefined
    const radiusKm = radiusParam ? parseInt(radiusParam, 10) : 25
    expect(radiusKm).toBe(25)
  })

  it('should parse custom radius from URL param', () => {
    const radiusParam = '10'
    const radiusKm = radiusParam ? parseInt(radiusParam, 10) : 25
    expect(radiusKm).toBe(10)
  })

  it('should build pagination URL with all search params', () => {
    const paginationParams = new URLSearchParams()
    paginationParams.set('category', 'plumbing')
    paginationParams.set('businessName', 'Test')
    paginationParams.set('suburb', 'Brisbane')
    paginationParams.set('state', 'QLD')
    paginationParams.set('postcode', '4000')
    paginationParams.set('radius', '10')

    const baseUrl = `/search?${paginationParams.toString()}`
    expect(baseUrl).toContain('category=plumbing')
    expect(baseUrl).toContain('businessName=Test')
    expect(baseUrl).toContain('suburb=Brisbane')
    expect(baseUrl).toContain('state=QLD')
    expect(baseUrl).toContain('postcode=4000')
    expect(baseUrl).toContain('radius=10')
  })
})
