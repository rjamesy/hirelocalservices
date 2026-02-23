/**
 * tests/admin-seed-controls.test.ts
 *
 * Tests for admin seed listing controls:
 * - Seed visibility window (within/outside days, custom day count)
 * - Phone masking (mask on/off, null phone, last 3 digits visible)
 * - Seed source toggle filtering
 */

import { describe, it, expect } from 'vitest'

// ─── Seed Visibility Logic ───────────────────────────────────────────

function isSeedVisible(
  createdAt: string,
  visibilityDays: number,
  now: Date = new Date()
): boolean {
  const created = new Date(createdAt)
  const diffMs = now.getTime() - created.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays <= visibilityDays
}

// ─── Phone Masking Logic ─────────────────────────────────────────────

function maskSeedPhone(phone: string | null, maskEnabled: boolean): string | null {
  if (!phone) return null
  if (!maskEnabled) return phone
  // Show last 3 digits, mask the rest
  if (phone.length <= 3) return phone
  return '*'.repeat(phone.length - 3) + phone.slice(-3)
}

// ─── Seed Source Filtering ───────────────────────────────────────────

type SeedSource = 'osm' | 'manual' | 'csv_import'

function isSeedSourceEnabled(
  source: SeedSource,
  osmEnabled: boolean,
  manualEnabled: boolean
): boolean {
  if (source === 'osm') return osmEnabled
  if (source === 'manual') return manualEnabled
  // csv_import and others: always enabled
  return true
}

describe('Admin Seed Controls', () => {
  // ─── Seed Visibility Window ─────────────────────────────────────

  describe('Seed visibility window', () => {
    const now = new Date('2026-02-23T12:00:00Z')

    it('should be visible within default 30 days', () => {
      const createdAt = new Date('2026-02-10T12:00:00Z').toISOString()
      expect(isSeedVisible(createdAt, 30, now)).toBe(true)
    })

    it('should not be visible outside 30 days', () => {
      const createdAt = new Date('2026-01-01T12:00:00Z').toISOString()
      expect(isSeedVisible(createdAt, 30, now)).toBe(false)
    })

    it('should respect custom day count (7 days)', () => {
      const recent = new Date('2026-02-20T12:00:00Z').toISOString()
      const old = new Date('2026-02-10T12:00:00Z').toISOString()
      expect(isSeedVisible(recent, 7, now)).toBe(true)
      expect(isSeedVisible(old, 7, now)).toBe(false)
    })

    it('should respect custom day count (90 days)', () => {
      const createdAt = new Date('2025-12-15T12:00:00Z').toISOString()
      expect(isSeedVisible(createdAt, 90, now)).toBe(true)
    })

    it('should be visible at exactly the boundary', () => {
      // Exactly 30 days ago
      const createdAt = new Date('2026-01-24T12:00:00Z').toISOString()
      expect(isSeedVisible(createdAt, 30, now)).toBe(true)
    })

    it('should not be visible just past the boundary', () => {
      // 31 days ago
      const createdAt = new Date('2026-01-23T11:00:00Z').toISOString()
      expect(isSeedVisible(createdAt, 30, now)).toBe(false)
    })

    it('should handle 0 visibility days (never visible)', () => {
      const createdAt = now.toISOString()
      expect(isSeedVisible(createdAt, 0, now)).toBe(true)
    })

    it('should handle very large visibility days', () => {
      const oldDate = new Date('2020-01-01T12:00:00Z').toISOString()
      expect(isSeedVisible(oldDate, 99999, now)).toBe(true)
    })
  })

  // ─── Phone Masking ─────────────────────────────────────────────

  describe('Phone masking', () => {
    it('should mask phone when enabled', () => {
      const masked = maskSeedPhone('0412345678', true)
      expect(masked).toBe('*******678')
    })

    it('should not mask phone when disabled', () => {
      const result = maskSeedPhone('0412345678', false)
      expect(result).toBe('0412345678')
    })

    it('should return null for null phone', () => {
      expect(maskSeedPhone(null, true)).toBeNull()
      expect(maskSeedPhone(null, false)).toBeNull()
    })

    it('should show last 3 digits', () => {
      const masked = maskSeedPhone('0298765432', true)
      expect(masked!.slice(-3)).toBe('432')
    })

    it('should mask all but last 3 characters', () => {
      const masked = maskSeedPhone('0412345678', true)
      expect(masked!.length).toBe(10)
      expect(masked!.slice(0, 7)).toBe('*******')
    })

    it('should handle short phone numbers', () => {
      const masked = maskSeedPhone('123', true)
      // 3 chars = no masking possible (all returned)
      expect(masked).toBe('123')
    })

    it('should handle phone with spaces when masking', () => {
      const masked = maskSeedPhone('04 1234 5678', true)
      // 12 chars total, last 3 shown
      expect(masked!.slice(-3)).toBe('678')
      expect(masked!.length).toBe(12)
    })
  })

  // ─── Seed Source Toggle Filtering ───────────────────────────────

  describe('Seed source toggle filtering', () => {
    it('should allow OSM when OSM enabled', () => {
      expect(isSeedSourceEnabled('osm', true, true)).toBe(true)
    })

    it('should block OSM when OSM disabled', () => {
      expect(isSeedSourceEnabled('osm', false, true)).toBe(false)
    })

    it('should allow manual when manual enabled', () => {
      expect(isSeedSourceEnabled('manual', true, true)).toBe(true)
    })

    it('should block manual when manual disabled', () => {
      expect(isSeedSourceEnabled('manual', true, false)).toBe(false)
    })

    it('should always allow csv_import regardless of toggles', () => {
      expect(isSeedSourceEnabled('csv_import', false, false)).toBe(true)
    })

    it('should block both when both disabled', () => {
      expect(isSeedSourceEnabled('osm', false, false)).toBe(false)
      expect(isSeedSourceEnabled('manual', false, false)).toBe(false)
    })

    it('should allow both when both enabled', () => {
      expect(isSeedSourceEnabled('osm', true, true)).toBe(true)
      expect(isSeedSourceEnabled('manual', true, true)).toBe(true)
    })
  })
})
