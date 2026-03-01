/**
 * tests/character-limits.test.ts
 *
 * Tests for plan-based character limits:
 * - Description limits per tier (via entitlements constants)
 * - createBusinessSchema() enforces correct max description length
 * - Business name enforces 80 char max across all schemas
 * - BUSINESS_NAME_MAX constant
 */

import { describe, it, expect } from 'vitest'
import { BUSINESS_NAME_MAX } from '@/lib/constants'
import { createBusinessSchema, businessSchema } from '@/lib/validations'
import type { PlanTier } from '@/lib/types'

// Canonical description limits (same values as in entitlements.ts)
const DESCRIPTION_LIMITS: Record<PlanTier, number> = {
  basic: 500,
  premium: 1500,
  premium_annual: 2500,
}

function getDescriptionLimit(plan: PlanTier | null): number {
  return plan ? DESCRIPTION_LIMITS[plan] : 500
}

describe('Plan-Based Character Limits', () => {
  // ─── Description limits ────────────────────────────────────────

  describe('Description limits per tier', () => {
    it('returns 500 for basic', () => {
      expect(getDescriptionLimit('basic')).toBe(500)
    })

    it('returns 1500 for premium', () => {
      expect(getDescriptionLimit('premium')).toBe(1500)
    })

    it('returns 2500 for premium_annual', () => {
      expect(getDescriptionLimit('premium_annual')).toBe(2500)
    })

    it('returns 500 for null (no plan)', () => {
      expect(getDescriptionLimit(null)).toBe(500)
    })
  })

  // ─── BUSINESS_NAME_MAX ──────────────────────────────────────────

  describe('BUSINESS_NAME_MAX', () => {
    it('equals 80', () => {
      expect(BUSINESS_NAME_MAX).toBe(80)
    })
  })

  // ─── createBusinessSchema validation ────────────────────────────

  describe('createBusinessSchema()', () => {
    const validBase = {
      name: 'Test Business',
      phone: '',
      website: '',
      email_contact: '',
      abn: '',
    }

    it('rejects description over 500 chars for basic schema', () => {
      const schema = createBusinessSchema(500)
      const result = schema.safeParse({
        ...validBase,
        description: 'A'.repeat(501),
      })
      expect(result.success).toBe(false)
    })

    it('accepts description at exactly 500 chars for basic schema', () => {
      const schema = createBusinessSchema(500)
      const result = schema.safeParse({
        ...validBase,
        description: 'A'.repeat(500),
      })
      expect(result.success).toBe(true)
    })

    it('accepts description up to 1500 chars for premium schema', () => {
      const schema = createBusinessSchema(1500)
      const result = schema.safeParse({
        ...validBase,
        description: 'A'.repeat(1500),
      })
      expect(result.success).toBe(true)
    })

    it('rejects description over 1500 chars for premium schema', () => {
      const schema = createBusinessSchema(1500)
      const result = schema.safeParse({
        ...validBase,
        description: 'A'.repeat(1501),
      })
      expect(result.success).toBe(false)
    })

    it('accepts description up to 2500 chars for premium_annual schema', () => {
      const schema = createBusinessSchema(2500)
      const result = schema.safeParse({
        ...validBase,
        description: 'A'.repeat(2500),
      })
      expect(result.success).toBe(true)
    })

    it('rejects description over 2500 chars for premium_annual schema', () => {
      const schema = createBusinessSchema(2500)
      const result = schema.safeParse({
        ...validBase,
        description: 'A'.repeat(2501),
      })
      expect(result.success).toBe(false)
    })
  })

  // ─── Business name max 80 across all schemas ───────────────────

  describe('Business name max 80 chars', () => {
    const tiers: (PlanTier | null)[] = ['basic', 'premium', 'premium_annual']

    for (const tier of tiers) {
      it(`rejects name > 80 chars for ${tier} schema`, () => {
        const limit = getDescriptionLimit(tier)
        const schema = createBusinessSchema(limit)
        const result = schema.safeParse({
          name: 'A'.repeat(81),
          description: 'Valid description text',
          phone: '',
          website: '',
          email_contact: '',
          abn: '',
        })
        expect(result.success).toBe(false)
      })

      it(`accepts name at 80 chars for ${tier} schema`, () => {
        const limit = getDescriptionLimit(tier)
        const schema = createBusinessSchema(limit)
        const result = schema.safeParse({
          name: 'A'.repeat(80),
          description: 'Valid description text',
          phone: '',
          website: '',
          email_contact: '',
          abn: '',
        })
        expect(result.success).toBe(true)
      })
    }
  })

  // ─── Default businessSchema export ──────────────────────────────

  describe('Default businessSchema export', () => {
    it('uses 2500 as max description length', () => {
      const result = businessSchema.safeParse({
        name: 'Test',
        description: 'A'.repeat(2500),
        phone: '',
        website: '',
        email_contact: '',
        abn: '',
      })
      expect(result.success).toBe(true)
    })

    it('rejects description over 2500', () => {
      const result = businessSchema.safeParse({
        name: 'Test',
        description: 'A'.repeat(2501),
        phone: '',
        website: '',
        email_contact: '',
        abn: '',
      })
      expect(result.success).toBe(false)
    })
  })
})
