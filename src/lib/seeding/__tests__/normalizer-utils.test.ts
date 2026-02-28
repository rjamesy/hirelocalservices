import { describe, it, expect } from 'vitest'
import { normalizePhone, normalizeWebsite, parseAddress } from '../normalizer'
import type { PlaceResult } from '../types'

describe('normalizePhone', () => {
  it('normalizes 04 mobile numbers to E.164', () => {
    expect(normalizePhone('0412345678')).toBe('+61412345678')
  })

  it('normalizes 02 landline to E.164', () => {
    expect(normalizePhone('0299991234')).toBe('+61299991234')
  })

  it('normalizes 07 landline to E.164', () => {
    expect(normalizePhone('0733001234')).toBe('+61733001234')
  })

  it('keeps already-E.164 numbers', () => {
    expect(normalizePhone('+61412345678')).toBe('+61412345678')
  })

  it('strips formatting characters', () => {
    expect(normalizePhone('(07) 3300 1234')).toBe('+61733001234')
    expect(normalizePhone('04 1234 5678')).toBe('+61412345678')
  })

  it('returns null for undefined', () => {
    expect(normalizePhone(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(normalizePhone('')).toBeNull()
  })

  it('returns null for invalid format', () => {
    expect(normalizePhone('12345')).toBeNull()
    expect(normalizePhone('+1-555-123-4567')).toBeNull()
  })

  it('handles +61 landline format', () => {
    expect(normalizePhone('+61299991234')).toBe('+61299991234')
  })
})

describe('normalizeWebsite', () => {
  it('passes through valid URLs', () => {
    expect(normalizeWebsite('https://example.com')).toBe('https://example.com/')
  })

  it('adds https:// if missing', () => {
    expect(normalizeWebsite('example.com')).toBe('https://example.com/')
  })

  it('keeps http:// URLs', () => {
    expect(normalizeWebsite('http://example.com')).toBe('http://example.com/')
  })

  it('returns null for undefined', () => {
    expect(normalizeWebsite(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(normalizeWebsite('')).toBeNull()
  })
})

describe('parseAddress', () => {
  it('extracts components from addressComponents', () => {
    const place: PlaceResult = {
      id: 'test',
      displayName: { text: 'Test', languageCode: 'en' },
      formattedAddress: '123 Main St, Brisbane QLD 4000',
      location: { latitude: -27.47, longitude: 153.02 },
      addressComponents: [
        { longText: '123', shortText: '123', types: ['street_number'] },
        { longText: 'Main St', shortText: 'Main St', types: ['route'] },
        { longText: 'Brisbane', shortText: 'Brisbane', types: ['locality'] },
        { longText: 'Queensland', shortText: 'QLD', types: ['administrative_area_level_1'] },
        { longText: '4000', shortText: '4000', types: ['postal_code'] },
      ],
    }
    const result = parseAddress(place)
    expect(result.streetAddress).toBe('123 Main St')
    expect(result.suburb).toBe('Brisbane')
    expect(result.state).toBe('QLD')
    expect(result.postcode).toBe('4000')
  })

  it('falls back to formattedAddress for state', () => {
    const place: PlaceResult = {
      id: 'test',
      displayName: { text: 'Test', languageCode: 'en' },
      formattedAddress: 'Some Place, Suburb NSW 2000, Australia',
      location: { latitude: -33.87, longitude: 151.21 },
    }
    const result = parseAddress(place)
    expect(result.state).toBe('NSW')
  })

  it('returns nulls when no data available', () => {
    const place: PlaceResult = {
      id: 'test',
      displayName: { text: 'Test', languageCode: 'en' },
      formattedAddress: '',
      location: { latitude: 0, longitude: 0 },
    }
    const result = parseAddress(place)
    expect(result.streetAddress).toBeNull()
    expect(result.suburb).toBeNull()
    expect(result.state).toBeNull()
    expect(result.postcode).toBeNull()
  })

  it('handles all AU state abbreviations', () => {
    for (const state of ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT']) {
      const place: PlaceResult = {
        id: 'test',
        displayName: { text: 'Test', languageCode: 'en' },
        formattedAddress: `123 St, Suburb ${state} 2000`,
        location: { latitude: 0, longitude: 0 },
        addressComponents: [
          { longText: 'Full State', shortText: state, types: ['administrative_area_level_1'] },
        ],
      }
      const result = parseAddress(place)
      expect(result.state).toBe(state)
    }
  })
})
