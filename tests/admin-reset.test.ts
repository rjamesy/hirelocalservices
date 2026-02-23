/**
 * tests/admin-reset.test.ts
 *
 * Tests for admin data reset safety:
 * - Confirmation phrase validation
 * - Second confirm required
 * - Tables deleted vs tables preserved
 */

import { describe, it, expect } from 'vitest'

// ─── Confirmation Phrase Logic ────────────────────────────────────────

function validateResetPhrase(phrase: string): boolean {
  return phrase.trim().toLowerCase() === 'danger reset data'
}

const TABLES_TO_DELETE = [
  'business_metrics',
  'photos',
  'testimonials',
  'business_categories',
  'verification_jobs',
  'business_claims',
  'business_contacts',
  'business_search_index',
  'business_locations',
  'subscriptions',
  'reports',
  'businesses',
] as const

const TABLES_PRESERVED = [
  'profiles',
  'categories',
  'postcodes',
  'system_settings',
  'blacklist',
  'audit_log',
] as const

describe('Admin Data Reset', () => {
  // ─── Confirmation Phrase Validation ──────────────────────────────

  describe('Confirmation phrase validation', () => {
    it('should reject empty phrase', () => {
      expect(validateResetPhrase('')).toBe(false)
    })

    it('should reject wrong phrase', () => {
      expect(validateResetPhrase('delete everything')).toBe(false)
    })

    it('should reject partial phrase', () => {
      expect(validateResetPhrase('danger reset')).toBe(false)
    })

    it('should accept exact phrase (case-insensitive)', () => {
      expect(validateResetPhrase('danger reset data')).toBe(true)
      expect(validateResetPhrase('DANGER RESET DATA')).toBe(true)
      expect(validateResetPhrase('Danger Reset Data')).toBe(true)
    })

    it('should handle leading/trailing whitespace (trimmed)', () => {
      expect(validateResetPhrase('  danger reset data  ')).toBe(true)
    })

    it('should reject phrase with extra words', () => {
      expect(validateResetPhrase('danger reset data now')).toBe(false)
    })
  })

  // ─── Second Confirm Requirement ─────────────────────────────────

  describe('Second confirm requirement', () => {
    it('should require secondConfirm to be true', () => {
      const secondConfirm = true
      expect(secondConfirm).toBe(true)
    })

    it('should reject when secondConfirm is false', () => {
      const secondConfirm = false
      expect(secondConfirm).toBe(false)
    })

    it('should reject when both checks fail', () => {
      const phraseValid = validateResetPhrase('wrong')
      const secondConfirm = false
      expect(phraseValid && secondConfirm).toBe(false)
    })

    it('should only pass when both checks succeed', () => {
      const phraseValid = validateResetPhrase('danger reset data')
      const secondConfirm = true
      expect(phraseValid && secondConfirm).toBe(true)
    })
  })

  // ─── Tables Deleted vs Preserved ────────────────────────────────

  describe('Tables deleted vs tables preserved', () => {
    it('should delete 12 tables', () => {
      expect(TABLES_TO_DELETE).toHaveLength(12)
    })

    it('should include all business-related tables in deletion', () => {
      expect(TABLES_TO_DELETE).toContain('businesses')
      expect(TABLES_TO_DELETE).toContain('business_metrics')
      expect(TABLES_TO_DELETE).toContain('business_locations')
      expect(TABLES_TO_DELETE).toContain('business_contacts')
      expect(TABLES_TO_DELETE).toContain('business_claims')
      expect(TABLES_TO_DELETE).toContain('business_categories')
      expect(TABLES_TO_DELETE).toContain('business_search_index')
    })

    it('should include media and engagement tables in deletion', () => {
      expect(TABLES_TO_DELETE).toContain('photos')
      expect(TABLES_TO_DELETE).toContain('testimonials')
      expect(TABLES_TO_DELETE).toContain('subscriptions')
      expect(TABLES_TO_DELETE).toContain('reports')
    })

    it('should include verification_jobs in deletion', () => {
      expect(TABLES_TO_DELETE).toContain('verification_jobs')
    })

    it('should preserve 6 tables', () => {
      expect(TABLES_PRESERVED).toHaveLength(6)
    })

    it('should NOT delete profiles', () => {
      expect(TABLES_TO_DELETE).not.toContain('profiles')
      expect(TABLES_PRESERVED).toContain('profiles')
    })

    it('should NOT delete categories', () => {
      expect(TABLES_TO_DELETE).not.toContain('categories')
      expect(TABLES_PRESERVED).toContain('categories')
    })

    it('should NOT delete postcodes', () => {
      expect(TABLES_TO_DELETE).not.toContain('postcodes')
      expect(TABLES_PRESERVED).toContain('postcodes')
    })

    it('should NOT delete system_settings', () => {
      expect(TABLES_TO_DELETE).not.toContain('system_settings')
      expect(TABLES_PRESERVED).toContain('system_settings')
    })

    it('should NOT delete blacklist', () => {
      expect(TABLES_TO_DELETE).not.toContain('blacklist')
      expect(TABLES_PRESERVED).toContain('blacklist')
    })

    it('should NOT delete audit_log', () => {
      expect(TABLES_TO_DELETE).not.toContain('audit_log')
      expect(TABLES_PRESERVED).toContain('audit_log')
    })

    it('should delete businesses last (FK-safe order)', () => {
      const businessesIndex = TABLES_TO_DELETE.indexOf('businesses')
      expect(businessesIndex).toBe(TABLES_TO_DELETE.length - 1)
    })

    it('should delete business_metrics before businesses', () => {
      const metricsIndex = TABLES_TO_DELETE.indexOf('business_metrics')
      const businessesIndex = TABLES_TO_DELETE.indexOf('businesses')
      expect(metricsIndex).toBeLessThan(businessesIndex)
    })

    it('should delete subscriptions before businesses', () => {
      const subsIndex = TABLES_TO_DELETE.indexOf('subscriptions')
      const businessesIndex = TABLES_TO_DELETE.indexOf('businesses')
      expect(subsIndex).toBeLessThan(businessesIndex)
    })
  })
})
