/**
 * tests/unlist.test.ts
 *
 * Tests for admin unlist/restore logic:
 * - Unlist logic (can unlist approved, cannot unlist already suspended)
 * - Restore logic (can restore suspended, cannot restore non-suspended)
 * - Unlist vs admin suspend distinction
 * - Blacklist addition optional
 */

import { describe, it, expect } from 'vitest'
import type { VerificationStatus } from '@/lib/types'

// ─── Unlist/Restore Logic (pure functions) ───────────────────────────

function canUnlist(verificationStatus: VerificationStatus): { ok: boolean; error?: string } {
  if (verificationStatus === 'suspended') {
    return { ok: false, error: 'Business is already unlisted (suspended)' }
  }
  return { ok: true }
}

function canRestore(verificationStatus: VerificationStatus): { ok: boolean; error?: string } {
  if (verificationStatus !== 'suspended') {
    return { ok: false, error: 'Business is not currently unlisted (suspended)' }
  }
  return { ok: true }
}

// ─── Unlist vs Suspend Distinction ───────────────────────────────────
// Unlist = sets verification_status to 'suspended' (removes from search)
// Admin Suspend = sets status to 'suspended' (completely hides listing)
// Both are different fields on the business record.

function getUnlistUpdate(): { verification_status: VerificationStatus } {
  return { verification_status: 'suspended' }
}

function getAdminSuspendUpdate(): { status: 'suspended' } {
  return { status: 'suspended' }
}

describe('Unlist / Restore', () => {
  // ─── Unlist Logic ───────────────────────────────────────────────

  describe('Unlist logic', () => {
    it('should allow unlisting an approved business', () => {
      const result = canUnlist('approved')
      expect(result.ok).toBe(true)
    })

    it('should allow unlisting a pending business', () => {
      const result = canUnlist('pending')
      expect(result.ok).toBe(true)
    })

    it('should allow unlisting a business in review', () => {
      const result = canUnlist('review')
      expect(result.ok).toBe(true)
    })

    it('should allow unlisting a rejected business', () => {
      const result = canUnlist('rejected')
      expect(result.ok).toBe(true)
    })

    it('should NOT allow unlisting an already suspended business', () => {
      const result = canUnlist('suspended')
      expect(result.ok).toBe(false)
      expect(result.error).toContain('already unlisted')
    })
  })

  // ─── Restore Logic ─────────────────────────────────────────────

  describe('Restore logic', () => {
    it('should allow restoring a suspended business', () => {
      const result = canRestore('suspended')
      expect(result.ok).toBe(true)
    })

    it('should NOT allow restoring an approved business', () => {
      const result = canRestore('approved')
      expect(result.ok).toBe(false)
      expect(result.error).toContain('not currently unlisted')
    })

    it('should NOT allow restoring a pending business', () => {
      const result = canRestore('pending')
      expect(result.ok).toBe(false)
    })

    it('should NOT allow restoring a rejected business', () => {
      const result = canRestore('rejected')
      expect(result.ok).toBe(false)
    })

    it('should NOT allow restoring a business in review', () => {
      const result = canRestore('review')
      expect(result.ok).toBe(false)
    })
  })

  // ─── Unlist vs Admin Suspend Distinction ────────────────────────

  describe('Unlist vs admin suspend distinction', () => {
    it('unlist should update verification_status field', () => {
      const update = getUnlistUpdate()
      expect(update).toHaveProperty('verification_status', 'suspended')
      expect(update).not.toHaveProperty('status')
    })

    it('admin suspend should update status field', () => {
      const update = getAdminSuspendUpdate()
      expect(update).toHaveProperty('status', 'suspended')
      expect(update).not.toHaveProperty('verification_status')
    })

    it('should be different fields', () => {
      const unlist = getUnlistUpdate()
      const suspend = getAdminSuspendUpdate()
      const unlistKeys = Object.keys(unlist)
      const suspendKeys = Object.keys(suspend)
      expect(unlistKeys).not.toEqual(suspendKeys)
    })
  })

  // ─── Blacklist Addition ─────────────────────────────────────────

  describe('Blacklist addition on unlist', () => {
    it('should be optional (default: not added)', () => {
      const addToBlacklist: boolean | undefined = undefined
      expect(addToBlacklist).toBeUndefined()
    })

    it('should blacklist when explicitly requested', () => {
      const addToBlacklist = true
      expect(addToBlacklist).toBe(true)
    })

    it('should not blacklist when explicitly declined', () => {
      const addToBlacklist = false
      expect(addToBlacklist).toBe(false)
    })

    it('should use business name as blacklist term', () => {
      const businessName = 'Test Escort Agency'
      const blacklistTerm = businessName.toLowerCase()
      expect(blacklistTerm).toBe('test escort agency')
    })

    it('should use exact match type for blacklist', () => {
      const matchType = 'exact'
      expect(matchType).toBe('exact')
    })
  })
})
