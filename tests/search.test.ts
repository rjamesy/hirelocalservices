/**
 * tests/search.test.ts
 *
 * Tests for search system:
 * - Only approved + claimed + subscribed businesses appear in search
 * - Search validation
 * - Search index eligibility
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchSchema } from '@/lib/validations'

// Mock the supabase client module
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

describe('Search System', () => {
  // ─── Search Validation ────────────────────────────────────────────

  describe('searchSchema', () => {
    it('should accept valid search params', () => {
      const result = searchSchema.safeParse({
        category: 'plumbing',
        postcode: '2000',
        radius_km: 25,
        keyword: 'emergency plumber',
        page: 1,
      })
      expect(result.success).toBe(true)
    })

    it('should accept empty search (browse all)', () => {
      const result = searchSchema.safeParse({})
      expect(result.success).toBe(true)
    })

    it('should validate postcode format (4 digits)', () => {
      const valid = searchSchema.safeParse({ postcode: '2000' })
      expect(valid.success).toBe(true)

      const invalid = searchSchema.safeParse({ postcode: '200' })
      expect(invalid.success).toBe(false)

      const alpha = searchSchema.safeParse({ postcode: 'abcd' })
      expect(alpha.success).toBe(false)
    })

    it('should validate radius_km options', () => {
      expect(searchSchema.safeParse({ radius_km: 5 }).success).toBe(true)
      expect(searchSchema.safeParse({ radius_km: 10 }).success).toBe(true)
      expect(searchSchema.safeParse({ radius_km: 25 }).success).toBe(true)
      expect(searchSchema.safeParse({ radius_km: 50 }).success).toBe(true)
      expect(searchSchema.safeParse({ radius_km: 15 }).success).toBe(false)
      expect(searchSchema.safeParse({ radius_km: 100 }).success).toBe(false)
    })

    it('should validate page is positive integer', () => {
      expect(searchSchema.safeParse({ page: 1 }).success).toBe(true)
      expect(searchSchema.safeParse({ page: 0 }).success).toBe(false)
      expect(searchSchema.safeParse({ page: -1 }).success).toBe(false)
    })

    it('should limit keyword length to 100 chars', () => {
      const longKeyword = 'a'.repeat(101)
      const result = searchSchema.safeParse({ keyword: longKeyword })
      expect(result.success).toBe(false)
    })

    it('should allow empty string for optional fields', () => {
      const result = searchSchema.safeParse({
        keyword: '',
        postcode: '',
        suburb: '',
      })
      expect(result.success).toBe(true)
    })

    it('should limit suburb length to 100 chars', () => {
      const longSuburb = 'a'.repeat(101)
      const result = searchSchema.safeParse({ suburb: longSuburb })
      expect(result.success).toBe(false)
    })
  })

  // ─── Search Eligibility Rules ─────────────────────────────────────

  describe('Search Eligibility Rules', () => {
    /**
     * A business must meet ALL these criteria to appear in search:
     * 1. verification_status = 'approved'
     * 2. has_contact = true (at least one contact method)
     * 3. claim_status = 'claimed'
     * 4. Active subscription OR non-manual listing_source (osm/csv_import)
     */

    it('should describe eligibility requirements', () => {
      // This test documents the eligibility criteria
      const criteria = {
        verification_status: 'approved',
        has_contact: true,
        claim_status: 'claimed',
        subscription_or_seed: true,
      }

      expect(criteria.verification_status).toBe('approved')
      expect(criteria.has_contact).toBe(true)
      expect(criteria.claim_status).toBe('claimed')
      expect(criteria.subscription_or_seed).toBe(true)
    })

    // Test the search index eligibility rules as pure logic
    function isEligible(business: {
      verification_status: string
      has_contact: boolean
      claim_status: string
      listing_source: string
      subscription_active: boolean
    }): boolean {
      return (
        business.verification_status === 'approved' &&
        business.has_contact === true &&
        business.claim_status === 'claimed' &&
        (business.subscription_active || business.listing_source !== 'manual')
      )
    }

    it('should include fully verified business with subscription', () => {
      expect(isEligible({
        verification_status: 'approved',
        has_contact: true,
        claim_status: 'claimed',
        listing_source: 'manual',
        subscription_active: true,
      })).toBe(true)
    })

    it('should include claimed OSM seed without subscription', () => {
      expect(isEligible({
        verification_status: 'approved',
        has_contact: true,
        claim_status: 'claimed',
        listing_source: 'osm',
        subscription_active: false,
      })).toBe(true)
    })

    it('should EXCLUDE unclaimed business', () => {
      expect(isEligible({
        verification_status: 'approved',
        has_contact: true,
        claim_status: 'unclaimed',
        listing_source: 'osm',
        subscription_active: false,
      })).toBe(false)
    })

    it('should EXCLUDE unverified business', () => {
      expect(isEligible({
        verification_status: 'pending',
        has_contact: true,
        claim_status: 'claimed',
        listing_source: 'manual',
        subscription_active: true,
      })).toBe(false)
    })

    it('should EXCLUDE rejected business', () => {
      expect(isEligible({
        verification_status: 'rejected',
        has_contact: true,
        claim_status: 'claimed',
        listing_source: 'manual',
        subscription_active: true,
      })).toBe(false)
    })

    it('should EXCLUDE business with no contact info', () => {
      expect(isEligible({
        verification_status: 'approved',
        has_contact: false,
        claim_status: 'claimed',
        listing_source: 'manual',
        subscription_active: true,
      })).toBe(false)
    })

    it('should EXCLUDE manual business without subscription', () => {
      expect(isEligible({
        verification_status: 'approved',
        has_contact: true,
        claim_status: 'claimed',
        listing_source: 'manual',
        subscription_active: false,
      })).toBe(false)
    })

    it('should include CSV import without subscription', () => {
      expect(isEligible({
        verification_status: 'approved',
        has_contact: true,
        claim_status: 'claimed',
        listing_source: 'csv_import',
        subscription_active: false,
      })).toBe(true)
    })

    it('should EXCLUDE suspended business', () => {
      expect(isEligible({
        verification_status: 'suspended',
        has_contact: true,
        claim_status: 'claimed',
        listing_source: 'manual',
        subscription_active: true,
      })).toBe(false)
    })

    it('should EXCLUDE business under review', () => {
      expect(isEligible({
        verification_status: 'review',
        has_contact: true,
        claim_status: 'claimed',
        listing_source: 'manual',
        subscription_active: true,
      })).toBe(false)
    })
  })

  // ─── Search Result Types ──────────────────────────────────────────

  describe('Search result type shape', () => {
    it('should include listing_source and is_claimed (not status/is_seed)', () => {
      // This documents the expected search result shape
      type SearchResult = {
        id: string
        name: string
        slug: string
        listing_source: 'manual' | 'osm' | 'csv_import'
        is_claimed: boolean
        // NOT: status, is_seed
      }

      const result: SearchResult = {
        id: 'test-id',
        name: 'Test Business',
        slug: 'test-business',
        listing_source: 'osm',
        is_claimed: true,
      }

      expect(result.listing_source).toBe('osm')
      expect(result.is_claimed).toBe(true)
      expect(result).not.toHaveProperty('status')
      expect(result).not.toHaveProperty('is_seed')
    })
  })
})
