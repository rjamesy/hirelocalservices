/**
 * tests/admin-ai-controls.test.ts
 *
 * Tests for admin AI verification controls:
 * - Strictness config levels (lenient/normal/strict threshold differences)
 * - AI disabled fallback (deterministic-only approval/review)
 * - Uses makeVerificationDecision from verification module
 */

import { describe, it, expect } from 'vitest'
import { makeVerificationDecision } from '@/lib/verification'
import type { DeterministicResults, AIReviewResults } from '@/lib/types'

// ─── Strictness Thresholds ───────────────────────────────────────────

type StrictnessLevel = 'lenient' | 'normal' | 'strict'

const STRICTNESS_THRESHOLDS: Record<StrictnessLevel, {
  spam_threshold: number
  toxicity_threshold: number
  real_business_min: number
}> = {
  lenient: {
    spam_threshold: 0.8,
    toxicity_threshold: 0.6,
    real_business_min: 0.2,
  },
  normal: {
    spam_threshold: 0.7,
    toxicity_threshold: 0.5,
    real_business_min: 0.3,
  },
  strict: {
    spam_threshold: 0.5,
    toxicity_threshold: 0.3,
    real_business_min: 0.5,
  },
}

function shouldRejectByStrictness(
  aiResult: AIReviewResults,
  strictness: StrictnessLevel
): boolean {
  const thresholds = STRICTNESS_THRESHOLDS[strictness]
  if (aiResult.is_blocked_category) return true
  if (aiResult.spam_likelihood >= thresholds.spam_threshold) return true
  if (aiResult.toxicity >= thresholds.toxicity_threshold) return true
  if (aiResult.real_business < thresholds.real_business_min) return true
  return false
}

describe('Admin AI Controls', () => {
  // ─── Strictness Config Levels ───────────────────────────────────

  describe('Strictness config levels', () => {
    it('lenient should have higher spam threshold than normal', () => {
      expect(STRICTNESS_THRESHOLDS.lenient.spam_threshold)
        .toBeGreaterThan(STRICTNESS_THRESHOLDS.normal.spam_threshold)
    })

    it('strict should have lower spam threshold than normal', () => {
      expect(STRICTNESS_THRESHOLDS.strict.spam_threshold)
        .toBeLessThan(STRICTNESS_THRESHOLDS.normal.spam_threshold)
    })

    it('lenient should have higher toxicity threshold than normal', () => {
      expect(STRICTNESS_THRESHOLDS.lenient.toxicity_threshold)
        .toBeGreaterThan(STRICTNESS_THRESHOLDS.normal.toxicity_threshold)
    })

    it('strict should have lower real_business_min than lenient', () => {
      expect(STRICTNESS_THRESHOLDS.lenient.real_business_min)
        .toBeLessThan(STRICTNESS_THRESHOLDS.strict.real_business_min)
    })

    it('lenient should allow borderline spam (0.75)', () => {
      const ai: AIReviewResults = {
        spam_likelihood: 0.75,
        toxicity: 0.1,
        real_business: 0.6,
        is_blocked_category: false,
        blocked_reason: null,
        summary: 'Test',
      }
      expect(shouldRejectByStrictness(ai, 'lenient')).toBe(false)
    })

    it('normal should reject borderline spam (0.75)', () => {
      const ai: AIReviewResults = {
        spam_likelihood: 0.75,
        toxicity: 0.1,
        real_business: 0.6,
        is_blocked_category: false,
        blocked_reason: null,
        summary: 'Test',
      }
      expect(shouldRejectByStrictness(ai, 'normal')).toBe(true)
    })

    it('strict should reject moderate spam (0.55)', () => {
      const ai: AIReviewResults = {
        spam_likelihood: 0.55,
        toxicity: 0.1,
        real_business: 0.6,
        is_blocked_category: false,
        blocked_reason: null,
        summary: 'Test',
      }
      expect(shouldRejectByStrictness(ai, 'strict')).toBe(true)
    })

    it('strict should reject low real_business score (0.4)', () => {
      const ai: AIReviewResults = {
        spam_likelihood: 0.1,
        toxicity: 0.1,
        real_business: 0.4,
        is_blocked_category: false,
        blocked_reason: null,
        summary: 'Test',
      }
      expect(shouldRejectByStrictness(ai, 'strict')).toBe(true)
    })

    it('lenient should allow low real_business score (0.25)', () => {
      const ai: AIReviewResults = {
        spam_likelihood: 0.1,
        toxicity: 0.1,
        real_business: 0.25,
        is_blocked_category: false,
        blocked_reason: null,
        summary: 'Test',
      }
      expect(shouldRejectByStrictness(ai, 'lenient')).toBe(false)
    })

    it('all levels should reject blocked categories', () => {
      const ai: AIReviewResults = {
        spam_likelihood: 0.0,
        toxicity: 0.0,
        real_business: 0.9,
        is_blocked_category: true,
        blocked_reason: 'Adult services',
        summary: 'Blocked',
      }
      expect(shouldRejectByStrictness(ai, 'lenient')).toBe(true)
      expect(shouldRejectByStrictness(ai, 'normal')).toBe(true)
      expect(shouldRejectByStrictness(ai, 'strict')).toBe(true)
    })
  })

  // ─── AI Disabled Fallback ───────────────────────────────────────

  describe('AI disabled fallback (deterministic-only)', () => {
    it('should approve when deterministic passes and AI is null', () => {
      const det: DeterministicResults = {
        spam_score: 0.1,
        duplicate_score: 0.1,
        phone_valid: true,
        email_valid: true,
        pass: true,
      }
      const result = makeVerificationDecision(det, null)
      expect(result).toBe('approved')
    })

    it('should send to review when deterministic fails and AI is null', () => {
      const det: DeterministicResults = {
        spam_score: 0.6,
        duplicate_score: 0.6,
        phone_valid: false,
        email_valid: true,
        pass: false,
      }
      const result = makeVerificationDecision(det, null)
      expect(result).toBe('pending')
    })

    it('should reject high spam even without AI', () => {
      const det: DeterministicResults = {
        spam_score: 0.8,
        duplicate_score: 0.1,
        phone_valid: true,
        email_valid: true,
        pass: false,
      }
      const result = makeVerificationDecision(det, null)
      expect(result).toBe('rejected')
    })

    it('should reject near-exact duplicate even without AI', () => {
      const det: DeterministicResults = {
        spam_score: 0.1,
        duplicate_score: 0.95,
        phone_valid: true,
        email_valid: true,
        pass: false,
      }
      const result = makeVerificationDecision(det, null)
      expect(result).toBe('rejected')
    })

    it('should reject blocked category by name even without AI', () => {
      const det: DeterministicResults = {
        spam_score: 0.0,
        duplicate_score: 0.0,
        phone_valid: true,
        email_valid: true,
        pass: true,
      }
      const result = makeVerificationDecision(det, null, 'Sydney Escort Agency')
      expect(result).toBe('rejected')
    })
  })

  // ─── AI-Informed Decisions ──────────────────────────────────────

  describe('AI-informed decisions', () => {
    const cleanDeterministic: DeterministicResults = {
      spam_score: 0.1,
      duplicate_score: 0.1,
      phone_valid: true,
      email_valid: true,
      pass: true,
    }

    it('should approve with good AI scores', () => {
      const ai: AIReviewResults = {
        spam_likelihood: 0.1,
        toxicity: 0.1,
        real_business: 0.9,
        is_blocked_category: false,
        blocked_reason: null,
        summary: 'Legitimate plumber',
      }
      const result = makeVerificationDecision(cleanDeterministic, ai)
      expect(result).toBe('approved')
    })

    it('should reject when AI says blocked category', () => {
      const ai: AIReviewResults = {
        spam_likelihood: 0.0,
        toxicity: 0.0,
        real_business: 0.8,
        is_blocked_category: true,
        blocked_reason: 'Adult services',
        summary: 'Not a service business',
      }
      const result = makeVerificationDecision(cleanDeterministic, ai)
      expect(result).toBe('rejected')
    })

    it('should reject when AI detects high spam', () => {
      const ai: AIReviewResults = {
        spam_likelihood: 0.8,
        toxicity: 0.1,
        real_business: 0.5,
        is_blocked_category: false,
        blocked_reason: null,
        summary: 'Likely spam',
      }
      const result = makeVerificationDecision(cleanDeterministic, ai)
      expect(result).toBe('rejected')
    })
  })
})
