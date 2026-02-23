/**
 * tests/ai-verification.test.ts
 *
 * Tests for AI verification pipeline: deterministic + AI content review.
 * Verifies that blocked categories (adult, escort, retail) are properly rejected.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  calculateSpamScore,
  runDeterministicChecks,
  runAIContentReview,
  makeVerificationDecision,
  checkBlockedCategory,
  BLOCKED_CATEGORIES,
  validatePhoneFormat,
  validateEmailFormat,
} from '@/lib/verification'
import type { DeterministicResults, AIReviewResults } from '@/lib/types'

describe('AI Verification Pipeline', () => {
  // ─── Blocked Categories ────────────────────────────────────────────

  describe('checkBlockedCategory', () => {
    it('should detect escort services', () => {
      expect(checkBlockedCategory('Sydney Escorts', null)).toBe('escort')
    })

    it('should detect escort in description', () => {
      expect(checkBlockedCategory('Premium Services', 'We offer escort services')).toBe('escort')
    })

    it('should detect brothel', () => {
      expect(checkBlockedCategory('Luxury Brothel', null)).toBe('brothel')
    })

    it('should detect strip club', () => {
      expect(checkBlockedCategory('The Strip Club', null)).toBe('strip club')
    })

    it('should detect adult entertainment', () => {
      expect(checkBlockedCategory('Adult Entertainment Co', null)).toBe('adult entertainment')
    })

    it('should detect retail stores', () => {
      expect(checkBlockedCategory('Big Supermarket', 'grocery store and supermarket')).toBe('supermarket')
    })

    it('should detect liquor stores', () => {
      expect(checkBlockedCategory('Corner Bottle Shop', null)).toBe('bottle shop')
    })

    it('should detect petrol stations', () => {
      expect(checkBlockedCategory('BP Petrol Station', null)).toBe('petrol station')
    })

    it('should detect vape shops', () => {
      expect(checkBlockedCategory('Cloud 9 Vape Shop', null)).toBe('vape shop')
    })

    it('should allow legitimate service businesses', () => {
      expect(checkBlockedCategory('Smiths Plumbing', 'Professional plumbing services')).toBeNull()
    })

    it('should allow electricians', () => {
      expect(checkBlockedCategory('ABC Electrical', 'Licensed electrician in Sydney')).toBeNull()
    })

    it('should allow cleaners', () => {
      expect(checkBlockedCategory('Sparkle Cleaning Services', 'House and office cleaning')).toBeNull()
    })

    it('should allow builders', () => {
      expect(checkBlockedCategory('Custom Home Builders', 'New home construction and renovations')).toBeNull()
    })

    it('should be case insensitive', () => {
      expect(checkBlockedCategory('SYDNEY ESCORTS', null)).toBe('escort')
      expect(checkBlockedCategory('sydney ESCORT services', null)).toBe('escort')
    })

    it('should detect erotic massage', () => {
      expect(checkBlockedCategory('Body Massage Parlour', null)).toBe('massage parlour')
    })

    it('should detect xxx content', () => {
      expect(checkBlockedCategory('XXX Services', null)).toBe('xxx')
    })
  })

  describe('BLOCKED_CATEGORIES constant', () => {
    it('should contain adult-related terms', () => {
      expect(BLOCKED_CATEGORIES).toContain('escort')
      expect(BLOCKED_CATEGORIES).toContain('brothel')
      expect(BLOCKED_CATEGORIES).toContain('strip club')
      expect(BLOCKED_CATEGORIES).toContain('adult entertainment')
    })

    it('should contain retail-related terms', () => {
      expect(BLOCKED_CATEGORIES).toContain('supermarket')
      expect(BLOCKED_CATEGORIES).toContain('department store')
      expect(BLOCKED_CATEGORIES).toContain('petrol station')
    })

    it('should contain all expected terms', () => {
      expect(BLOCKED_CATEGORIES.length).toBeGreaterThanOrEqual(20)
    })
  })

  // ─── AI Content Review (mocked) ───────────────────────────────────

  describe('runAIContentReview', () => {
    const originalEnv = process.env

    beforeEach(() => {
      vi.restoreAllMocks()
      process.env = { ...originalEnv }
    })

    it('should return null when no OPENAI_API_KEY', async () => {
      delete process.env.OPENAI_API_KEY
      const result = await runAIContentReview({
        name: 'Test Business',
        description: 'A test business',
        phone: null,
        email: null,
        lat: null,
        lng: null,
      })
      expect(result).toBeNull()
    })

    it('should return null when API call fails', async () => {
      process.env.OPENAI_API_KEY = 'test-key'
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

      const result = await runAIContentReview({
        name: 'Test Business',
        description: 'A test business',
        phone: null,
        email: null,
        lat: null,
        lng: null,
      })
      expect(result).toBeNull()
    })

    it('should return null when API returns non-200', async () => {
      process.env.OPENAI_API_KEY = 'test-key'
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, { status: 500 })
      )

      const result = await runAIContentReview({
        name: 'Test Business',
        description: 'A test business',
        phone: null,
        email: null,
        lat: null,
        lng: null,
      })
      expect(result).toBeNull()
    })

    it('should parse valid AI response', async () => {
      process.env.OPENAI_API_KEY = 'test-key'
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              spam_likelihood: 0.1,
              toxicity: 0.05,
              real_business: 0.95,
              is_blocked_category: false,
              blocked_reason: null,
              summary: 'Legitimate plumbing business',
            }),
          },
        }],
      }

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      const result = await runAIContentReview({
        name: 'Smiths Plumbing',
        description: 'Professional plumbing services in Sydney',
        phone: '0412345678',
        email: 'info@smiths.com.au',
        lat: -33.8688,
        lng: 151.2093,
      })

      expect(result).not.toBeNull()
      expect(result!.spam_likelihood).toBe(0.1)
      expect(result!.real_business).toBe(0.95)
      expect(result!.is_blocked_category).toBe(false)
    })

    it('should detect blocked categories in AI response', async () => {
      process.env.OPENAI_API_KEY = 'test-key'
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              spam_likelihood: 0.1,
              toxicity: 0.1,
              real_business: 0.8,
              is_blocked_category: true,
              blocked_reason: 'Adult services - escort agency',
              summary: 'This appears to be an escort service',
            }),
          },
        }],
      }

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      const result = await runAIContentReview({
        name: 'Premium Companions',
        description: 'High-class companionship services',
        phone: null,
        email: null,
        lat: null,
        lng: null,
      })

      expect(result).not.toBeNull()
      expect(result!.is_blocked_category).toBe(true)
      expect(result!.blocked_reason).toContain('escort')
    })
  })

  // ─── Decision Engine with Blocked Categories ──────────────────────

  describe('makeVerificationDecision with blocked categories', () => {
    const cleanDeterministic: DeterministicResults = {
      spam_score: 0.1,
      duplicate_score: 0.1,
      phone_valid: true,
      email_valid: true,
      pass: true,
    }

    const cleanAI: AIReviewResults = {
      spam_likelihood: 0.1,
      toxicity: 0.1,
      real_business: 0.9,
      is_blocked_category: false,
      blocked_reason: null,
      summary: 'Legitimate business',
    }

    it('should reject escort service by name even with clean scores', () => {
      const result = makeVerificationDecision(
        cleanDeterministic,
        cleanAI,
        'Sydney Escort Agency',
        'Premium escort services'
      )
      expect(result).toBe('rejected')
    })

    it('should reject retail by name even with clean scores', () => {
      const result = makeVerificationDecision(
        cleanDeterministic,
        cleanAI,
        'Woolworths Supermarket',
        'Grocery shopping'
      )
      expect(result).toBe('rejected')
    })

    it('should reject when AI flags blocked category', () => {
      const blockedAI: AIReviewResults = {
        ...cleanAI,
        is_blocked_category: true,
        blocked_reason: 'Adult services',
      }
      const result = makeVerificationDecision(cleanDeterministic, blockedAI)
      expect(result).toBe('rejected')
    })

    it('should approve legitimate business with clean name', () => {
      const result = makeVerificationDecision(
        cleanDeterministic,
        cleanAI,
        'ABC Plumbing',
        'Licensed plumber in Sydney'
      )
      expect(result).toBe('approved')
    })
  })

  // ─── Phone & Email Validation ─────────────────────────────────────

  describe('validatePhoneFormat', () => {
    it('should validate standard Australian mobile', () => {
      expect(validatePhoneFormat('0412345678')).toBe(true)
    })

    it('should validate with +61 prefix', () => {
      expect(validatePhoneFormat('+61412345678')).toBe(true)
    })

    it('should validate landline', () => {
      expect(validatePhoneFormat('0298765432')).toBe(true)
    })

    it('should reject invalid phone', () => {
      expect(validatePhoneFormat('123')).toBe(false)
    })

    it('should return null for empty', () => {
      expect(validatePhoneFormat(null)).toBeNull()
      expect(validatePhoneFormat('')).toBeNull()
    })
  })

  describe('validateEmailFormat', () => {
    it('should validate standard email', () => {
      expect(validateEmailFormat('test@example.com')).toBe(true)
    })

    it('should reject invalid email', () => {
      expect(validateEmailFormat('not-an-email')).toBe(false)
    })

    it('should return null for empty', () => {
      expect(validateEmailFormat(null)).toBeNull()
      expect(validateEmailFormat('')).toBeNull()
    })
  })
})
