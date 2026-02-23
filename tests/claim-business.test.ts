/**
 * tests/claim-business.test.ts
 *
 * Tests for the business claim flow:
 * - Match scoring (fuzzy name, phone, website, location)
 * - Auto-approve vs admin review vs rejection thresholds
 * - Claim validation
 */

import { describe, it, expect } from 'vitest'
import {
  fuzzyNameScore,
  phoneMatchScore,
  websiteDomainScore,
  locationProximityScore,
  calculateMatchScore,
  AUTO_APPROVE_THRESHOLD,
  ADMIN_REVIEW_THRESHOLD,
} from '@/lib/claim-scoring'
import { claimSchema } from '@/lib/validations'

describe('Claim Business Flow', () => {
  // ─── Fuzzy Name Matching ───────────────────────────────────────────

  describe('fuzzyNameScore', () => {
    it('should return 1.0 for exact match', () => {
      expect(fuzzyNameScore('Smiths Plumbing', 'Smiths Plumbing')).toBe(1.0)
    })

    it('should return 1.0 for case-insensitive match', () => {
      expect(fuzzyNameScore('smiths plumbing', 'SMITHS PLUMBING')).toBe(1.0)
    })

    it('should return high score for very similar names', () => {
      const score = fuzzyNameScore('Smiths Plumbing', 'Smith Plumbing')
      expect(score).toBeGreaterThan(0.8)
    })

    it('should return moderate score for partially matching names', () => {
      const score = fuzzyNameScore('Smiths Plumbing Services', 'Smiths Plumbing')
      expect(score).toBeGreaterThan(0.5)
    })

    it('should return low score for completely different names', () => {
      const score = fuzzyNameScore('ABC Electrical', 'XYZ Plumbing')
      expect(score).toBeLessThan(0.3)
    })

    it('should handle empty strings', () => {
      expect(fuzzyNameScore('', '')).toBe(1.0) // both empty = match
    })

    it('should handle whitespace trimming', () => {
      expect(fuzzyNameScore('  Smiths Plumbing  ', 'Smiths Plumbing')).toBe(1.0)
    })

    it('should use Jaccard when Levenshtein is poor (reordered words)', () => {
      const score = fuzzyNameScore('Plumbing by Smith', 'Smith Plumbing')
      expect(score).toBeGreaterThan(0.3) // Jaccard catches token overlap
    })
  })

  // ─── Phone Match ──────────────────────────────────────────────────

  describe('phoneMatchScore', () => {
    it('should return 1 for exact match', () => {
      expect(phoneMatchScore('0412345678', '0412345678')).toBe(1)
    })

    it('should normalize +61 prefix to 0', () => {
      expect(phoneMatchScore('+61412345678', '0412345678')).toBe(1)
    })

    it('should strip non-digit characters', () => {
      expect(phoneMatchScore('04 1234 5678', '0412345678')).toBe(1)
    })

    it('should return 0 for different numbers', () => {
      expect(phoneMatchScore('0412345678', '0498765432')).toBe(0)
    })

    it('should return 0 when claimed is null', () => {
      expect(phoneMatchScore(null, '0412345678')).toBe(0)
    })

    it('should return 0 when existing is null', () => {
      expect(phoneMatchScore('0412345678', null)).toBe(0)
    })

    it('should return 0 when both are null', () => {
      expect(phoneMatchScore(null, null)).toBe(0)
    })

    it('should handle +61 with 11 digits', () => {
      expect(phoneMatchScore('+61412345678', '+61412345678')).toBe(1)
    })
  })

  // ─── Website Domain Matching ──────────────────────────────────────

  describe('websiteDomainScore', () => {
    it('should return 1 for matching domains', () => {
      expect(websiteDomainScore('https://example.com', 'https://example.com')).toBe(1)
    })

    it('should strip www prefix', () => {
      expect(websiteDomainScore('https://www.example.com', 'https://example.com')).toBe(1)
    })

    it('should add https:// if missing', () => {
      expect(websiteDomainScore('example.com', 'https://example.com')).toBe(1)
    })

    it('should match regardless of path', () => {
      expect(websiteDomainScore('https://example.com/about', 'https://example.com')).toBe(1)
    })

    it('should return 0 for different domains', () => {
      expect(websiteDomainScore('https://a.com', 'https://b.com')).toBe(0)
    })

    it('should return 0 when claimed is null', () => {
      expect(websiteDomainScore(null, 'https://example.com')).toBe(0)
    })

    it('should return 0 when existing is null', () => {
      expect(websiteDomainScore('https://example.com', null)).toBe(0)
    })

    it('should be case insensitive', () => {
      expect(websiteDomainScore('HTTPS://EXAMPLE.COM', 'https://example.com')).toBe(1)
    })
  })

  // ─── Location Proximity ──────────────────────────────────────────

  describe('locationProximityScore', () => {
    it('should return 1.0 for same location', () => {
      expect(locationProximityScore(-33.8688, 151.2093, -33.8688, 151.2093)).toBe(1.0)
    })

    it('should return 1.0 for within 5km', () => {
      // ~2km apart in Sydney
      const score = locationProximityScore(-33.8688, 151.2093, -33.8500, 151.2100)
      expect(score).toBe(1.0)
    })

    it('should return between 0.5 and 1.0 for 5-25km', () => {
      // ~15km apart
      const score = locationProximityScore(-33.8688, 151.2093, -33.7500, 151.1000)
      expect(score).toBeGreaterThanOrEqual(0.5)
      expect(score).toBeLessThanOrEqual(1.0)
    })

    it('should return 0 for >100km', () => {
      // Sydney to Melbourne (~714km)
      const score = locationProximityScore(-33.8688, 151.2093, -37.8136, 144.9631)
      expect(score).toBe(0)
    })

    it('should return 0 when any coordinate is null', () => {
      expect(locationProximityScore(null, 151.2093, -33.8688, 151.2093)).toBe(0)
      expect(locationProximityScore(-33.8688, null, -33.8688, 151.2093)).toBe(0)
      expect(locationProximityScore(-33.8688, 151.2093, null, 151.2093)).toBe(0)
      expect(locationProximityScore(-33.8688, 151.2093, -33.8688, null)).toBe(0)
    })
  })

  // ─── Weighted Match Score ─────────────────────────────────────────

  describe('calculateMatchScore', () => {
    it('should calculate high score for perfect match', () => {
      const result = calculateMatchScore({
        claimedName: 'Smiths Plumbing',
        existingName: 'Smiths Plumbing',
        claimedPhone: '0412345678',
        existingPhone: '0412345678',
        claimedWebsite: 'https://smithsplumbing.com.au',
        existingWebsite: 'https://smithsplumbing.com.au',
        claimedLat: -33.8688,
        claimedLng: 151.2093,
        existingLat: -33.8688,
        existingLng: 151.2093,
      })

      expect(result.weighted_total).toBeGreaterThanOrEqual(AUTO_APPROVE_THRESHOLD)
      expect(result.name_score).toBe(1)
      expect(result.phone_score).toBe(1)
      expect(result.website_score).toBe(1)
      expect(result.location_score).toBe(1)
      expect(result.signals_used).toBe(4)
    })

    it('should auto-approve threshold for name-only exact match', () => {
      const result = calculateMatchScore({
        claimedName: 'Smiths Plumbing',
        existingName: 'Smiths Plumbing',
      })

      expect(result.name_score).toBe(1)
      expect(result.signals_used).toBe(1) // only name
      expect(result.weighted_total).toBe(1) // 100% weight on name
    })

    it('should use correct weights when all signals present', () => {
      const result = calculateMatchScore({
        claimedName: 'Smiths Plumbing',
        existingName: 'Smiths Plumbing',
        claimedPhone: '0412345678',
        existingPhone: '0412345678',
        claimedWebsite: 'https://smiths.com.au',
        existingWebsite: 'https://smiths.com.au',
        claimedLat: -33.8688,
        claimedLng: 151.2093,
        existingLat: -33.8688,
        existingLng: 151.2093,
      })

      expect(result.signals_used).toBe(4)
      expect(result.weighted_total).toBe(1.0) // all perfect = 1.0
    })

    it('should skip location signal when no coordinates', () => {
      const result = calculateMatchScore({
        claimedName: 'Smiths Plumbing',
        existingName: 'Smiths Plumbing',
        claimedPhone: '0412345678',
        existingPhone: '0412345678',
      })

      expect(result.signals_used).toBe(2) // name + phone
      expect(result.location_score).toBe(0)
    })

    it('should include phone signal when one party has phone', () => {
      const result = calculateMatchScore({
        claimedName: 'Smiths Plumbing',
        existingName: 'Smiths Plumbing',
        claimedPhone: '0412345678',
        existingPhone: null,
      })

      // Phone signal included because claimer provided phone
      expect(result.signals_used).toBe(2) // name + phone
    })

    it('should calculate low score for mismatched data', () => {
      const result = calculateMatchScore({
        claimedName: 'ABC Electrical',
        existingName: 'XYZ Plumbing',
        claimedPhone: '0400000000',
        existingPhone: '0499999999',
        claimedWebsite: 'https://abc.com',
        existingWebsite: 'https://xyz.com',
        claimedLat: -33.8688,
        claimedLng: 151.2093,
        existingLat: -37.8136,
        existingLng: 144.9631,
      })

      expect(result.weighted_total).toBeLessThan(ADMIN_REVIEW_THRESHOLD)
    })
  })

  // ─── Thresholds ───────────────────────────────────────────────────

  describe('Thresholds', () => {
    it('should have AUTO_APPROVE at 0.75', () => {
      expect(AUTO_APPROVE_THRESHOLD).toBe(0.75)
    })

    it('should have ADMIN_REVIEW at 0.40', () => {
      expect(ADMIN_REVIEW_THRESHOLD).toBe(0.40)
    })

    it('AUTO_APPROVE should be greater than ADMIN_REVIEW', () => {
      expect(AUTO_APPROVE_THRESHOLD).toBeGreaterThan(ADMIN_REVIEW_THRESHOLD)
    })
  })

  // ─── Claim Validation Schema ──────────────────────────────────────

  describe('claimSchema', () => {
    it('should validate valid claim data', () => {
      const result = claimSchema.safeParse({
        businessName: 'Smiths Plumbing',
        phone: '0412345678',
        website: 'https://example.com',
        postcode: '2000',
      })
      expect(result.success).toBe(true)
    })

    it('should require businessName', () => {
      const result = claimSchema.safeParse({
        businessName: '',
      })
      expect(result.success).toBe(false)
    })

    it('should allow optional fields as empty strings', () => {
      const result = claimSchema.safeParse({
        businessName: 'Test Business',
        phone: '',
        website: '',
        postcode: '',
      })
      expect(result.success).toBe(true)
    })

    it('should validate phone format', () => {
      const result = claimSchema.safeParse({
        businessName: 'Test Business',
        phone: 'invalid',
      })
      expect(result.success).toBe(false)
    })

    it('should validate website format', () => {
      const result = claimSchema.safeParse({
        businessName: 'Test Business',
        website: 'not-a-url',
      })
      expect(result.success).toBe(false)
    })

    it('should validate postcode format', () => {
      const result = claimSchema.safeParse({
        businessName: 'Test Business',
        postcode: '123',
      })
      expect(result.success).toBe(false)
    })

    it('should accept valid Australian phone number', () => {
      const result = claimSchema.safeParse({
        businessName: 'Test Business',
        phone: '0412345678',
      })
      expect(result.success).toBe(true)
    })
  })
})
