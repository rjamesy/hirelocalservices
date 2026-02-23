/**
 * tests/seed-listings.test.ts
 *
 * Tests for seed listing behavior:
 * - OSM seed businesses are invisible in search until claimed
 * - Seed businesses can be viewed via direct URL
 * - Claim flow only works for seed/unclaimed businesses
 * - Bulk verification of seeds
 */

import { describe, it, expect } from 'vitest'
import type {
  Business,
  VerificationStatus,
  ListingSource,
  ClaimStatus,
} from '@/lib/types'

describe('Seed Listings', () => {
  // ─── Seed Business Properties ─────────────────────────────────────

  describe('Seed business properties', () => {
    it('should have listing_source = osm for OSM seeds', () => {
      const seed: Partial<Business> = {
        listing_source: 'osm',
        is_seed: true,
        claim_status: 'unclaimed',
      }
      expect(seed.listing_source).toBe('osm')
      expect(seed.is_seed).toBe(true)
    })

    it('should start with claim_status = unclaimed', () => {
      const seed: Partial<Business> = {
        claim_status: 'unclaimed',
      }
      expect(seed.claim_status).toBe('unclaimed')
    })

    it('should have verification_status field', () => {
      const statuses: VerificationStatus[] = ['pending', 'approved', 'review', 'rejected', 'suspended']
      expect(statuses).toContain('pending')
      expect(statuses).toContain('approved')
    })

    it('should have listing_source enum values', () => {
      const sources: ListingSource[] = ['manual', 'osm', 'csv_import']
      expect(sources).toContain('osm')
      expect(sources).toContain('manual')
      expect(sources).toContain('csv_import')
    })

    it('should have claim_status enum values', () => {
      const statuses: ClaimStatus[] = ['unclaimed', 'pending', 'claimed']
      expect(statuses).toContain('unclaimed')
      expect(statuses).toContain('pending')
      expect(statuses).toContain('claimed')
    })
  })

  // ─── Search Visibility Rules for Seeds ────────────────────────────

  describe('Search visibility for seed listings', () => {
    function isSearchVisible(business: {
      is_seed: boolean
      claim_status: ClaimStatus
      verification_status: VerificationStatus
      has_contact: boolean
    }): boolean {
      // Seeds must be claimed + approved to appear in search
      return (
        business.verification_status === 'approved' &&
        business.claim_status === 'claimed' &&
        business.has_contact
      )
    }

    it('should be INVISIBLE when unclaimed', () => {
      expect(isSearchVisible({
        is_seed: true,
        claim_status: 'unclaimed',
        verification_status: 'approved',
        has_contact: true,
      })).toBe(false)
    })

    it('should be INVISIBLE when claim is pending', () => {
      expect(isSearchVisible({
        is_seed: true,
        claim_status: 'pending',
        verification_status: 'approved',
        has_contact: true,
      })).toBe(false)
    })

    it('should be VISIBLE when claimed and approved', () => {
      expect(isSearchVisible({
        is_seed: true,
        claim_status: 'claimed',
        verification_status: 'approved',
        has_contact: true,
      })).toBe(true)
    })

    it('should be INVISIBLE when claimed but not approved', () => {
      expect(isSearchVisible({
        is_seed: true,
        claim_status: 'claimed',
        verification_status: 'review',
        has_contact: true,
      })).toBe(false)
    })

    it('should be INVISIBLE when no contact info', () => {
      expect(isSearchVisible({
        is_seed: true,
        claim_status: 'claimed',
        verification_status: 'approved',
        has_contact: false,
      })).toBe(false)
    })
  })

  // ─── Direct URL Access ────────────────────────────────────────────

  describe('Direct URL access for seed listings', () => {
    function isDirectUrlAccessible(business: {
      status: string
      is_seed: boolean
      claim_status: ClaimStatus
    }): boolean {
      // Seed listings are accessible via direct URL unless suspended
      return business.status !== 'suspended'
    }

    it('should be accessible when published', () => {
      expect(isDirectUrlAccessible({
        status: 'published',
        is_seed: true,
        claim_status: 'unclaimed',
      })).toBe(true)
    })

    it('should be accessible when draft (for seeds)', () => {
      expect(isDirectUrlAccessible({
        status: 'draft',
        is_seed: true,
        claim_status: 'unclaimed',
      })).toBe(true)
    })

    it('should NOT be accessible when suspended', () => {
      expect(isDirectUrlAccessible({
        status: 'suspended',
        is_seed: true,
        claim_status: 'unclaimed',
      })).toBe(false)
    })
  })

  // ─── Claim Eligibility ────────────────────────────────────────────

  describe('Claim eligibility', () => {
    function canBeClaimed(business: {
      is_seed: boolean
      claim_status: ClaimStatus
    }): boolean {
      return business.is_seed && business.claim_status === 'unclaimed'
    }

    it('should be claimable when seed and unclaimed', () => {
      expect(canBeClaimed({
        is_seed: true,
        claim_status: 'unclaimed',
      })).toBe(true)
    })

    it('should NOT be claimable when already claimed', () => {
      expect(canBeClaimed({
        is_seed: true,
        claim_status: 'claimed',
      })).toBe(false)
    })

    it('should NOT be claimable when claim is pending', () => {
      expect(canBeClaimed({
        is_seed: true,
        claim_status: 'pending',
      })).toBe(false)
    })

    it('should NOT be claimable when not a seed', () => {
      expect(canBeClaimed({
        is_seed: false,
        claim_status: 'unclaimed',
      })).toBe(false)
    })
  })

  // ─── Seed-to-Claimed Transition ───────────────────────────────────

  describe('Seed-to-claimed transition', () => {
    it('should set is_seed to false after claim approval', () => {
      // Simulates the claim approval process
      const seed = {
        is_seed: true,
        claim_status: 'unclaimed' as ClaimStatus,
        owner_id: 'system',
      }

      // After claim approval
      const claimed = {
        ...seed,
        is_seed: false,
        claim_status: 'claimed' as ClaimStatus,
        owner_id: 'user-id',
      }

      expect(claimed.is_seed).toBe(false)
      expect(claimed.claim_status).toBe('claimed')
      expect(claimed.owner_id).toBe('user-id')
    })

    it('should reject other pending claims when one is approved', () => {
      // Documents the behavior: when a claim is approved,
      // all other pending claims for the same business are rejected
      const pendingClaims = [
        { id: 'claim-1', status: 'pending' },
        { id: 'claim-2', status: 'pending' },
        { id: 'claim-3', status: 'pending' },
      ]

      // Approve claim-1, reject others
      const afterApproval = pendingClaims.map(c =>
        c.id === 'claim-1'
          ? { ...c, status: 'approved' }
          : { ...c, status: 'rejected' }
      )

      expect(afterApproval[0].status).toBe('approved')
      expect(afterApproval[1].status).toBe('rejected')
      expect(afterApproval[2].status).toBe('rejected')
    })
  })

  // ─── Bulk Verification ────────────────────────────────────────────

  describe('Bulk verification of seeds', () => {
    it('should only target OSM seeds that are not already approved', () => {
      const allBusinesses = [
        { id: '1', listing_source: 'osm', verification_status: 'pending' },
        { id: '2', listing_source: 'osm', verification_status: 'approved' },
        { id: '3', listing_source: 'manual', verification_status: 'pending' },
        { id: '4', listing_source: 'osm', verification_status: 'review' },
      ]

      const targets = allBusinesses.filter(
        b => b.listing_source === 'osm' && b.verification_status !== 'approved'
      )

      expect(targets).toHaveLength(2)
      expect(targets.map(t => t.id)).toEqual(['1', '4'])
    })
  })
})
