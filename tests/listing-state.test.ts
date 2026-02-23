/**
 * tests/listing-state.test.ts
 *
 * Tests for listing state machine: draft → pending → approved → suspended → rejected
 * Verifies that business verification_status transitions work correctly.
 */

import { describe, it, expect } from 'vitest'
import {
  calculateSpamScore,
  calculateDuplicateScore,
  runDeterministicChecks,
  makeVerificationDecision,
  checkBlockedCategory,
} from '@/lib/verification'
import type { DeterministicResults, AIReviewResults } from '@/lib/types'

describe('Listing State Machine', () => {
  // ─── Verification Status Transitions ───────────────────────────────

  describe('makeVerificationDecision', () => {
    const cleanDeterministic: DeterministicResults = {
      spam_score: 0.1,
      duplicate_score: 0.1,
      phone_valid: true,
      email_valid: true,
      pass: true,
    }

    const failDeterministic: DeterministicResults = {
      spam_score: 0.6,
      duplicate_score: 0.5,
      phone_valid: false,
      email_valid: false,
      pass: false,
    }

    const highSpamDeterministic: DeterministicResults = {
      spam_score: 0.8,
      duplicate_score: 0.1,
      phone_valid: true,
      email_valid: true,
      pass: false,
    }

    const highDupDeterministic: DeterministicResults = {
      spam_score: 0.1,
      duplicate_score: 0.95,
      phone_valid: true,
      email_valid: true,
      pass: false,
    }

    const cleanAI: AIReviewResults = {
      spam_likelihood: 0.1,
      toxicity: 0.1,
      real_business: 0.9,
      is_blocked_category: false,
      blocked_reason: null,
      summary: 'Legitimate business',
    }

    const spamAI: AIReviewResults = {
      spam_likelihood: 0.8,
      toxicity: 0.1,
      real_business: 0.5,
      is_blocked_category: false,
      blocked_reason: null,
      summary: 'Likely spam',
    }

    const toxicAI: AIReviewResults = {
      spam_likelihood: 0.1,
      toxicity: 0.6,
      real_business: 0.7,
      is_blocked_category: false,
      blocked_reason: null,
      summary: 'Contains inappropriate content',
    }

    const fakeAI: AIReviewResults = {
      spam_likelihood: 0.2,
      toxicity: 0.1,
      real_business: 0.2,
      is_blocked_category: false,
      blocked_reason: null,
      summary: 'Unlikely to be a real business',
    }

    const blockedCategoryAI: AIReviewResults = {
      spam_likelihood: 0.1,
      toxicity: 0.1,
      real_business: 0.8,
      is_blocked_category: true,
      blocked_reason: 'Adult services',
      summary: 'Not a permitted business type',
    }

    it('should approve clean business with clean AI result', () => {
      const result = makeVerificationDecision(cleanDeterministic, cleanAI)
      expect(result).toBe('approved')
    })

    it('should approve clean business without AI (graceful degradation)', () => {
      const result = makeVerificationDecision(cleanDeterministic, null)
      expect(result).toBe('approved')
    })

    it('should send to review when deterministic fails and no AI', () => {
      const result = makeVerificationDecision(failDeterministic, null)
      expect(result).toBe('review')
    })

    it('should reject when spam score >= 0.7', () => {
      const result = makeVerificationDecision(highSpamDeterministic, null)
      expect(result).toBe('rejected')
    })

    it('should reject when duplicate score >= 0.9', () => {
      const result = makeVerificationDecision(highDupDeterministic, null)
      expect(result).toBe('rejected')
    })

    it('should reject when AI spam_likelihood >= 0.7', () => {
      const result = makeVerificationDecision(cleanDeterministic, spamAI)
      expect(result).toBe('rejected')
    })

    it('should reject when AI toxicity >= 0.5', () => {
      const result = makeVerificationDecision(cleanDeterministic, toxicAI)
      expect(result).toBe('rejected')
    })

    it('should reject when AI real_business < 0.3', () => {
      const result = makeVerificationDecision(cleanDeterministic, fakeAI)
      expect(result).toBe('rejected')
    })

    it('should reject when AI detects blocked category', () => {
      const result = makeVerificationDecision(cleanDeterministic, blockedCategoryAI)
      expect(result).toBe('rejected')
    })

    it('should reject when business name matches blocked category', () => {
      const result = makeVerificationDecision(
        cleanDeterministic,
        cleanAI,
        'Sydney Escort Services',
        'Premium escort agency'
      )
      expect(result).toBe('rejected')
    })

    it('should send to review for edge cases (medium spam + medium real_business)', () => {
      const edgeCaseAI: AIReviewResults = {
        spam_likelihood: 0.4,
        toxicity: 0.1,
        real_business: 0.5,
        is_blocked_category: false,
        blocked_reason: null,
        summary: 'Uncertain',
      }
      const result = makeVerificationDecision(cleanDeterministic, edgeCaseAI)
      expect(result).toBe('review')
    })
  })

  // ─── Deterministic Checks ──────────────────────────────────────────

  describe('runDeterministicChecks', () => {
    it('should pass for clean business', () => {
      const result = runDeterministicChecks(
        {
          name: 'Smiths Plumbing',
          description: 'Professional plumbing services in Sydney. Licensed and insured.',
          phone: '0412345678',
          email: 'info@smithsplumbing.com.au',
          lat: -33.8688,
          lng: 151.2093,
        },
        []
      )
      expect(result.pass).toBe(true)
      expect(result.spam_score).toBeLessThan(0.5)
      expect(result.duplicate_score).toBeLessThan(0.8)
    })

    it('should fail for spammy business', () => {
      const result = runDeterministicChecks(
        {
          name: 'BUY NOW CLICK HERE',
          description: 'Free money! Limited time offer! Act now! Click here!',
          phone: null,
          email: null,
          lat: null,
          lng: null,
        },
        []
      )
      expect(result.pass).toBe(false)
      expect(result.spam_score).toBeGreaterThanOrEqual(0.5)
    })

    it('should detect duplicate businesses', () => {
      const result = runDeterministicChecks(
        {
          name: 'Smiths Plumbing',
          description: 'Plumbing services',
          phone: null,
          email: null,
          lat: -33.8688,
          lng: 151.2093,
        },
        [
          { name: 'Smiths Plumbing', lat: -33.8688, lng: 151.2093 },
        ]
      )
      expect(result.duplicate_score).toBeGreaterThan(0.5)
    })

    it('should validate phone format', () => {
      const result = runDeterministicChecks(
        {
          name: 'Test Business',
          description: 'A test business for testing purposes',
          phone: '0412345678',
          email: 'test@test.com',
          lat: null,
          lng: null,
        },
        []
      )
      expect(result.phone_valid).toBe(true)
      expect(result.email_valid).toBe(true)
    })

    it('should detect invalid phone format', () => {
      const result = runDeterministicChecks(
        {
          name: 'Test Business',
          description: 'A test business for testing purposes',
          phone: '123',
          email: 'not-an-email',
          lat: null,
          lng: null,
        },
        []
      )
      expect(result.phone_valid).toBe(false)
      expect(result.email_valid).toBe(false)
    })

    it('should return null for missing phone/email', () => {
      const result = runDeterministicChecks(
        {
          name: 'Test Business',
          description: 'A test business for testing purposes',
          phone: null,
          email: null,
          lat: null,
          lng: null,
        },
        []
      )
      expect(result.phone_valid).toBeNull()
      expect(result.email_valid).toBeNull()
    })
  })

  // ─── Spam Score ────────────────────────────────────────────────────

  describe('calculateSpamScore', () => {
    it('should return 0 for clean content', () => {
      const score = calculateSpamScore(
        'Smiths Plumbing',
        'Professional plumbing services in Sydney. Licensed and insured with over 20 years experience.'
      )
      expect(score).toBe(0)
    })

    it('should increase score for spam words', () => {
      const score = calculateSpamScore(
        'Buy Now Services',
        'Click here for free money! Act now for limited time offer.'
      )
      expect(score).toBeGreaterThan(0.3)
    })

    it('should increase score for excessive URLs', () => {
      const score = calculateSpamScore(
        'Test Business',
        'Visit https://spam1.com and https://spam2.com and https://spam3.com'
      )
      expect(score).toBeGreaterThan(0)
    })

    it('should increase score for short descriptions', () => {
      const score = calculateSpamScore('Test', 'Short desc')
      expect(score).toBeGreaterThan(0)
    })

    it('should increase score for ALL CAPS names', () => {
      const score = calculateSpamScore('ALL CAPS NAME', 'Normal description here for testing')
      expect(score).toBeGreaterThan(0)
    })

    it('should cap at 1.0', () => {
      const score = calculateSpamScore(
        'BUY NOW CLICK HERE FREE MONEY',
        'Act now! Limited time! Winner! Congratulations! Earn extra cash! Work from home! Casino! Viagra!'
      )
      expect(score).toBeLessThanOrEqual(1.0)
    })
  })

  // ─── Duplicate Score ──────────────────────────────────────────────

  describe('calculateDuplicateScore', () => {
    it('should return 0 for no existing businesses', () => {
      const score = calculateDuplicateScore('Test Business', -33.86, 151.2, [])
      expect(score).toBe(0)
    })

    it('should detect exact name match with close proximity', () => {
      const score = calculateDuplicateScore(
        'Smiths Plumbing',
        -33.8688,
        151.2093,
        [{ name: 'Smiths Plumbing', lat: -33.8688, lng: 151.2093 }]
      )
      expect(score).toBeGreaterThan(0.7)
    })

    it('should have lower score for same name but far location', () => {
      const score = calculateDuplicateScore(
        'Smiths Plumbing',
        -33.8688,
        151.2093,
        [{ name: 'Smiths Plumbing', lat: -37.8136, lng: 144.9631 }] // Melbourne
      )
      const closeScore = calculateDuplicateScore(
        'Smiths Plumbing',
        -33.8688,
        151.2093,
        [{ name: 'Smiths Plumbing', lat: -33.8688, lng: 151.2093 }]
      )
      expect(score).toBeLessThan(closeScore)
    })

    it('should have lower score for different names at same location', () => {
      const score = calculateDuplicateScore(
        'ABC Electrical',
        -33.8688,
        151.2093,
        [{ name: 'XYZ Plumbing', lat: -33.8688, lng: 151.2093 }]
      )
      // Different names but same location: proximity (0.4) inflates score
      // but it should still be below the 0.8 duplicate threshold
      expect(score).toBeLessThan(0.8)
    })
  })
})
