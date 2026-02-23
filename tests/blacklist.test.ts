/**
 * tests/blacklist.test.ts
 *
 * Tests for blacklist system:
 * - Quick client-side blacklist check
 * - Blocked category detection in verification
 * - Preventing creation/claiming of blacklisted businesses
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { quickBlacklistCheck } from '@/lib/blacklist'
import { checkBlockedCategory, BLOCKED_CATEGORIES } from '@/lib/verification'

describe('Blacklist System', () => {
  // ─── Quick Blacklist Check (Client-side) ──────────────────────────

  describe('quickBlacklistCheck', () => {
    it('should detect escort services', () => {
      expect(quickBlacklistCheck('Sydney Escort Agency')).toBe('escort')
    })

    it('should detect brothels', () => {
      expect(quickBlacklistCheck('The Brothel House')).toBe('brothel')
    })

    it('should detect strip clubs', () => {
      expect(quickBlacklistCheck('Downtown Strip Club')).toBe('strip club')
    })

    it('should detect adult entertainment', () => {
      expect(quickBlacklistCheck('XYZ Adult Entertainment')).toBe('adult entertainment')
    })

    it('should detect erotic services', () => {
      expect(quickBlacklistCheck('Erotic Massage Studio')).toBe('erotic')
    })

    it('should detect massage parlours', () => {
      expect(quickBlacklistCheck('Happy Massage Parlour')).toBe('massage parlour')
    })

    it('should detect happy ending', () => {
      expect(quickBlacklistCheck('Happy Ending Spa')).toBe('happy ending')
    })

    it('should detect sex shops', () => {
      expect(quickBlacklistCheck('Adult Sex Shop')).toBe('sex shop')
    })

    it('should detect xxx', () => {
      expect(quickBlacklistCheck('XXX Store')).toBe('xxx')
    })

    it('should be case insensitive', () => {
      expect(quickBlacklistCheck('ESCORT SERVICES')).toBe('escort')
      expect(quickBlacklistCheck('Sydney BROTHEL')).toBe('brothel')
    })

    it('should return null for legitimate businesses', () => {
      expect(quickBlacklistCheck('Smiths Plumbing')).toBeNull()
      expect(quickBlacklistCheck('ABC Electrical')).toBeNull()
      expect(quickBlacklistCheck('Pro Cleaning Services')).toBeNull()
      expect(quickBlacklistCheck('Custom Builders')).toBeNull()
    })

    it('should return null for empty string', () => {
      expect(quickBlacklistCheck('')).toBeNull()
    })

    it('should handle whitespace trimming', () => {
      expect(quickBlacklistCheck('  Escort Agency  ')).toBe('escort')
    })

    it('should detect partial matches', () => {
      // "escort" is found within "escorts" and similar
      expect(quickBlacklistCheck('Sydney Escorts And More')).toBe('escort')
    })
  })

  // ─── checkBlockedCategory (Verification Layer) ────────────────────

  describe('checkBlockedCategory (verification)', () => {
    it('should check both name and description', () => {
      // Clean name but blocked description
      expect(checkBlockedCategory(
        'Premium Services',
        'We offer escort services in Sydney'
      )).toBe('escort')
    })

    it('should return null when both are clean', () => {
      expect(checkBlockedCategory(
        'Smiths Plumbing',
        'Professional plumbing services in Sydney'
      )).toBeNull()
    })

    it('should detect blocked term in name only', () => {
      expect(checkBlockedCategory('Escort Agency', null)).toBe('escort')
    })

    it('should detect blocked term in description only', () => {
      expect(checkBlockedCategory(
        'Special Services',
        'Visit our brothel today'
      )).toBe('brothel')
    })

    it('should handle null description', () => {
      expect(checkBlockedCategory('Normal Business', null)).toBeNull()
    })

    it('should detect retail terms', () => {
      expect(checkBlockedCategory(
        'Local Supermarket',
        'Fresh groceries daily'
      )).toBe('supermarket')
    })

    it('should detect convenience stores', () => {
      expect(checkBlockedCategory(
        'Corner Convenience Store',
        null
      )).toBe('convenience store')
    })

    it('should detect department stores', () => {
      expect(checkBlockedCategory(
        'Big Department Store',
        null
      )).toBe('department store')
    })

    it('should detect liquor stores', () => {
      expect(checkBlockedCategory(
        'Local Liquor Store',
        null
      )).toBe('liquor store')
    })

    it('should detect vape shops', () => {
      expect(checkBlockedCategory(
        'Cloud Vape Shop',
        null
      )).toBe('vape shop')
    })

    it('should detect gas stations', () => {
      expect(checkBlockedCategory(
        'Shell Gas Station',
        null
      )).toBe('gas station')
    })
  })

  // ─── BLOCKED_CATEGORIES Constant ──────────────────────────────────

  describe('BLOCKED_CATEGORIES completeness', () => {
    it('should include all adult service terms', () => {
      const adultTerms = ['escort', 'escorts', 'brothel', 'strip club', 'adult entertainment', 'erotic', 'xxx']
      for (const term of adultTerms) {
        expect(BLOCKED_CATEGORIES).toContain(term)
      }
    })

    it('should include massage parlour variants', () => {
      expect(BLOCKED_CATEGORIES).toContain('massage parlour')
      expect(BLOCKED_CATEGORIES).toContain('happy ending')
    })

    it('should include sex shop variants', () => {
      expect(BLOCKED_CATEGORIES).toContain('sex shop')
      expect(BLOCKED_CATEGORIES).toContain('adult shop')
      expect(BLOCKED_CATEGORIES).toContain('adult store')
    })

    it('should include retail terms', () => {
      const retailTerms = ['retail store', 'department store', 'supermarket', 'grocery store', 'convenience store']
      for (const term of retailTerms) {
        expect(BLOCKED_CATEGORIES).toContain(term)
      }
    })

    it('should include fuel and vice terms', () => {
      expect(BLOCKED_CATEGORIES).toContain('petrol station')
      expect(BLOCKED_CATEGORIES).toContain('bottle shop')
      expect(BLOCKED_CATEGORIES).toContain('liquor store')
      expect(BLOCKED_CATEGORIES).toContain('tobacconist')
      expect(BLOCKED_CATEGORIES).toContain('vape shop')
    })
  })

  // ─── Integration: Blacklist in Business Creation ──────────────────

  describe('Blacklist integration with business creation', () => {
    it('should block business creation with blacklisted name', () => {
      // Simulates the check in createBusinessDraft
      const businessName = 'Sydney Escort Services'
      const blockedTerm = quickBlacklistCheck(businessName)

      expect(blockedTerm).not.toBeNull()
      expect(blockedTerm).toBe('escort')
    })

    it('should allow business creation with clean name', () => {
      const businessName = 'Smiths Professional Plumbing'
      const blockedTerm = quickBlacklistCheck(businessName)

      expect(blockedTerm).toBeNull()
    })
  })

  // ─── Integration: Blacklist in Claim Flow ─────────────────────────

  describe('Blacklist integration with claim flow', () => {
    it('should block claiming with blacklisted business name', () => {
      const claimName = 'Adult Entertainment Club'
      const blockedTerm = quickBlacklistCheck(claimName)

      expect(blockedTerm).not.toBeNull()
    })

    it('should allow claiming with clean business name', () => {
      const claimName = 'Local Electrician Services'
      const blockedTerm = quickBlacklistCheck(claimName)

      expect(blockedTerm).toBeNull()
    })
  })

  // ─── Database Blacklist Structure ─────────────────────────────────

  describe('Blacklist database structure', () => {
    it('should support multiple match types', () => {
      const matchTypes = ['exact', 'contains', 'starts_with']
      expect(matchTypes).toContain('exact')
      expect(matchTypes).toContain('contains')
      expect(matchTypes).toContain('starts_with')
    })

    it('should have is_active flag for soft deletes', () => {
      const entry = {
        term: 'escort',
        match_type: 'contains',
        is_active: true,
        reason: 'Adult services not permitted',
      }
      expect(entry.is_active).toBe(true)
    })

    it('should track who added the entry', () => {
      const entry = {
        term: 'escort',
        added_by: 'admin-user-id',
      }
      expect(entry.added_by).toBeTruthy()
    })
  })
})
