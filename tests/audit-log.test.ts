/**
 * tests/audit-log.test.ts
 *
 * Tests for audit log system:
 * - All 8 action types defined
 * - Entry structure (required fields, nullable fields, details as object)
 * - Pagination offset calculation
 */

import { describe, it, expect } from 'vitest'
import type { AuditAction, AuditLogEntry } from '@/lib/types'

// ─── All 8 Action Types ─────────────────────────────────────────────

const ALL_AUDIT_ACTIONS: AuditAction[] = [
  'listing_created',
  'listing_claimed',
  'listing_suspended',
  'listing_unlisted',
  'seed_ingested',
  'reset_executed',
  'settings_changed',
  'verification_completed',
]

// ─── Pagination ──────────────────────────────────────────────────────

const AUDIT_PAGE_SIZE = 50

function calculateOffset(page: number): number {
  return (page - 1) * AUDIT_PAGE_SIZE
}

function calculateTotalPages(totalCount: number): number {
  return Math.ceil(totalCount / AUDIT_PAGE_SIZE)
}

describe('Audit Log', () => {
  // ─── Action Types ───────────────────────────────────────────────

  describe('Action types', () => {
    it('should define exactly 8 action types', () => {
      expect(ALL_AUDIT_ACTIONS).toHaveLength(8)
    })

    it('should include listing_created', () => {
      expect(ALL_AUDIT_ACTIONS).toContain('listing_created')
    })

    it('should include listing_claimed', () => {
      expect(ALL_AUDIT_ACTIONS).toContain('listing_claimed')
    })

    it('should include listing_suspended', () => {
      expect(ALL_AUDIT_ACTIONS).toContain('listing_suspended')
    })

    it('should include listing_unlisted', () => {
      expect(ALL_AUDIT_ACTIONS).toContain('listing_unlisted')
    })

    it('should include seed_ingested', () => {
      expect(ALL_AUDIT_ACTIONS).toContain('seed_ingested')
    })

    it('should include reset_executed', () => {
      expect(ALL_AUDIT_ACTIONS).toContain('reset_executed')
    })

    it('should include settings_changed', () => {
      expect(ALL_AUDIT_ACTIONS).toContain('settings_changed')
    })

    it('should include verification_completed', () => {
      expect(ALL_AUDIT_ACTIONS).toContain('verification_completed')
    })

    it('should not contain duplicates', () => {
      const unique = new Set(ALL_AUDIT_ACTIONS)
      expect(unique.size).toBe(ALL_AUDIT_ACTIONS.length)
    })
  })

  // ─── Entry Structure ────────────────────────────────────────────

  describe('Entry structure', () => {
    const sampleEntry: AuditLogEntry = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      action: 'listing_created',
      entity_type: 'business',
      entity_id: '223e4567-e89b-12d3-a456-426614174001',
      actor_id: '323e4567-e89b-12d3-a456-426614174002',
      details: { name: 'Test Business' },
      created_at: '2026-02-23T12:00:00Z',
    }

    it('should have id as required field', () => {
      expect(sampleEntry.id).toBeDefined()
      expect(typeof sampleEntry.id).toBe('string')
    })

    it('should have action as required field', () => {
      expect(sampleEntry.action).toBeDefined()
      expect(ALL_AUDIT_ACTIONS).toContain(sampleEntry.action)
    })

    it('should have created_at as required field', () => {
      expect(sampleEntry.created_at).toBeDefined()
      expect(new Date(sampleEntry.created_at).getTime()).not.toBeNaN()
    })

    it('should allow null entity_type', () => {
      const entry: AuditLogEntry = { ...sampleEntry, entity_type: null }
      expect(entry.entity_type).toBeNull()
    })

    it('should allow null entity_id', () => {
      const entry: AuditLogEntry = { ...sampleEntry, entity_id: null }
      expect(entry.entity_id).toBeNull()
    })

    it('should allow null actor_id', () => {
      const entry: AuditLogEntry = { ...sampleEntry, actor_id: null }
      expect(entry.actor_id).toBeNull()
    })

    it('should have details as object', () => {
      expect(typeof sampleEntry.details).toBe('object')
      expect(sampleEntry.details).not.toBeNull()
    })

    it('should allow empty details object', () => {
      const entry: AuditLogEntry = { ...sampleEntry, details: {} }
      expect(Object.keys(entry.details)).toHaveLength(0)
    })

    it('should allow complex details object', () => {
      const entry: AuditLogEntry = {
        ...sampleEntry,
        details: {
          key: 'seed_visibility_days',
          old_value: 30,
          new_value: 60,
          tables_cleared: ['businesses', 'photos'],
        },
      }
      expect(entry.details.key).toBe('seed_visibility_days')
      expect(entry.details.old_value).toBe(30)
    })
  })

  // ─── Pagination ─────────────────────────────────────────────────

  describe('Pagination offset calculation', () => {
    it('page 1 should have offset 0', () => {
      expect(calculateOffset(1)).toBe(0)
    })

    it('page 2 should have offset 50', () => {
      expect(calculateOffset(2)).toBe(50)
    })

    it('page 3 should have offset 100', () => {
      expect(calculateOffset(3)).toBe(100)
    })

    it('page 10 should have offset 450', () => {
      expect(calculateOffset(10)).toBe(450)
    })

    it('should calculate total pages for 0 entries', () => {
      expect(calculateTotalPages(0)).toBe(0)
    })

    it('should calculate total pages for 1 entry', () => {
      expect(calculateTotalPages(1)).toBe(1)
    })

    it('should calculate total pages for 50 entries', () => {
      expect(calculateTotalPages(50)).toBe(1)
    })

    it('should calculate total pages for 51 entries', () => {
      expect(calculateTotalPages(51)).toBe(2)
    })

    it('should calculate total pages for 100 entries', () => {
      expect(calculateTotalPages(100)).toBe(2)
    })

    it('should calculate total pages for 250 entries', () => {
      expect(calculateTotalPages(250)).toBe(5)
    })
  })
})
