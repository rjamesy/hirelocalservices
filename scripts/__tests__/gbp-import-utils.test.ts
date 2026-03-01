import { describe, it, expect } from 'vitest'
import {
  slugify,
  resolveCategory,
  validateMapping,
  type GbpGroupMapping,
  type ExistingCategory,
} from '../lib/gbp-import-utils'

// ─── slugify ────────────────────────────────────────────────────────────────

describe('slugify', () => {
  it('converts simple name to lowercase hyphenated slug', () => {
    expect(slugify('House cleaning service')).toBe('house-cleaning-service')
  })

  it('converts ampersand to "and"', () => {
    expect(slugify('IT & Tech')).toBe('it-and-tech')
  })

  it('removes apostrophes', () => {
    expect(slugify("O'Brien's Plumbing")).toBe('obriens-plumbing')
  })

  it('collapses consecutive hyphens', () => {
    expect(slugify('Auto -- repair')).toBe('auto-repair')
  })

  it('trims leading and trailing hyphens', () => {
    expect(slugify('--plumber--')).toBe('plumber')
  })

  it('handles single word', () => {
    expect(slugify('Plumber')).toBe('plumber')
  })

  it('handles curly apostrophes', () => {
    expect(slugify('Bob\u2019s Service')).toBe('bobs-service')
  })

  it('removes special characters', () => {
    expect(slugify('HVAC (Heating/Cooling)')).toBe('hvac-heating-cooling')
  })
})

// ─── resolveCategory ────────────────────────────────────────────────────────

describe('resolveCategory', () => {
  const mapping: GbpGroupMapping = {
    meta: { version: '1.0', description: 'test', last_updated: '2026-01-01' },
    groups: [{ slug: 'home-maintenance', name: 'Home Maintenance', sort_order: 1 }],
    active_categories: ['Plumber', 'New Service'],
    mapping: {
      'Plumber': 'home-maintenance',
      'New Service': 'home-maintenance',
      'Inactive Service': 'home-maintenance',
    },
    manual_dedup: {
      'Plumber': 'plumbing',
    },
  }

  it('returns merge when GBP name is in manual_dedup and target exists', () => {
    const existing = new Map<string, ExistingCategory>([
      ['plumbing', { id: '1', slug: 'plumbing', name: 'Plumbing', source: 'manual', synonyms: [] }],
    ])
    const result = resolveCategory('Plumber', mapping, existing)
    expect(result).toEqual({ action: 'merge', existingSlug: 'plumbing', gbpName: 'Plumber' })
  })

  it('returns insert for new category with no slug collision', () => {
    const existing = new Map<string, ExistingCategory>()
    const result = resolveCategory('New Service', mapping, existing)
    expect(result).toEqual({
      action: 'insert',
      slug: 'new-service',
      parentSlug: 'home-maintenance',
      isActive: true,
      sourceRef: 'New Service',
    })
  })

  it('returns insert with isActive=false for non-active categories', () => {
    const existing = new Map<string, ExistingCategory>()
    const result = resolveCategory('Inactive Service', mapping, existing)
    expect(result.action).toBe('insert')
    if (result.action === 'insert') {
      expect(result.isActive).toBe(false)
    }
  })

  it('returns update when slug exists with source=gbp', () => {
    const existing = new Map<string, ExistingCategory>([
      ['new-service', { id: '2', slug: 'new-service', name: 'New Service', source: 'gbp', synonyms: [] }],
    ])
    const result = resolveCategory('New Service', mapping, existing)
    expect(result).toEqual({
      action: 'update',
      slug: 'new-service',
      parentSlug: 'home-maintenance',
      isActive: true,
      sourceRef: 'New Service',
    })
  })

  it('returns merge when slug exists with source=manual', () => {
    const existing = new Map<string, ExistingCategory>([
      ['new-service', { id: '3', slug: 'new-service', name: 'New Service', source: 'manual', synonyms: [] }],
    ])
    const result = resolveCategory('New Service', mapping, existing)
    expect(result).toEqual({ action: 'merge', existingSlug: 'new-service', gbpName: 'New Service' })
  })

  it('returns skip when category has no mapping', () => {
    const existing = new Map<string, ExistingCategory>()
    const result = resolveCategory('Unknown Category', mapping, existing)
    expect(result).toEqual({ action: 'skip', reason: 'No mapping for "Unknown Category"' })
  })
})

// ─── validateMapping ────────────────────────────────────────────────────────

describe('validateMapping', () => {
  it('returns error for mapping referencing unknown group', () => {
    const mapping: GbpGroupMapping = {
      meta: { version: '1.0', description: '', last_updated: '' },
      groups: [{ slug: 'cleaning', name: 'Cleaning', sort_order: 1 }],
      active_categories: [],
      mapping: { 'Plumber': 'nonexistent-group' },
      manual_dedup: {},
    }
    const result = validateMapping([], mapping)
    expect(result.errors).toContain('Mapping "Plumber" references unknown group "nonexistent-group"')
  })

  it('warns when a category has no mapping', () => {
    const mapping: GbpGroupMapping = {
      meta: { version: '1.0', description: '', last_updated: '' },
      groups: [],
      active_categories: [],
      mapping: {},
      manual_dedup: {},
    }
    const result = validateMapping([{ gcid: 'gcid:test', name: 'Test' }], mapping)
    expect(result.warnings).toContain('Category "Test" has no mapping — will be skipped')
  })

  it('warns when active category not in data file', () => {
    const mapping: GbpGroupMapping = {
      meta: { version: '1.0', description: '', last_updated: '' },
      groups: [],
      active_categories: ['Missing Category'],
      mapping: {},
      manual_dedup: {},
    }
    const result = validateMapping([], mapping)
    expect(result.warnings).toContain('Active category "Missing Category" not found in category data file')
  })

  it('returns no errors for valid mapping', () => {
    const mapping: GbpGroupMapping = {
      meta: { version: '1.0', description: '', last_updated: '' },
      groups: [{ slug: 'cleaning', name: 'Cleaning', sort_order: 1 }],
      active_categories: ['House cleaning service'],
      mapping: { 'House cleaning service': 'cleaning' },
      manual_dedup: {},
    }
    const result = validateMapping(
      [{ gcid: 'gcid:house_cleaning_service', name: 'House cleaning service' }],
      mapping
    )
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })
})
