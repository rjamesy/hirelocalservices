import { describe, it, expect } from 'vitest'
import { mapGoogleTypes, hasRelevantGoogleType } from '../google-type-mapper'

describe('mapGoogleTypes', () => {
  it('maps plumber to plumbing', () => {
    expect(mapGoogleTypes(['plumber'])).toEqual(['plumbing'])
  })

  it('maps electrician to electrical', () => {
    expect(mapGoogleTypes(['electrician'])).toEqual(['electrical'])
  })

  it('maps car_wash to car-detailing', () => {
    expect(mapGoogleTypes(['car_wash'])).toEqual(['car-detailing'])
  })

  it('includes source_category when provided', () => {
    const result = mapGoogleTypes(['plumber'], 'house-cleaning')
    expect(result).toContain('house-cleaning')
    expect(result).toContain('plumbing')
  })

  it('deduplicates slugs', () => {
    const result = mapGoogleTypes(['plumber'], 'plumbing')
    expect(result).toEqual(['plumbing'])
  })

  it('returns only source_category for unmapped types', () => {
    const result = mapGoogleTypes(['restaurant', 'food'], 'plumbing')
    expect(result).toEqual(['plumbing'])
  })

  it('returns empty array for no matches and no source', () => {
    expect(mapGoogleTypes(['restaurant'])).toEqual([])
  })

  it('maps electronics_store to multiple categories', () => {
    const result = mapGoogleTypes(['electronics_store'])
    expect(result).toContain('computer-repair')
    expect(result).toContain('phone-repair')
  })
})

describe('hasRelevantGoogleType', () => {
  it('returns true for mapped types', () => {
    expect(hasRelevantGoogleType(['plumber', 'point_of_interest'])).toBe(true)
  })

  it('returns false for unmapped types', () => {
    expect(hasRelevantGoogleType(['restaurant', 'food'])).toBe(false)
  })

  it('returns false for empty array', () => {
    expect(hasRelevantGoogleType([])).toBe(false)
  })
})
