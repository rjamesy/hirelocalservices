import { describe, it, expect } from 'vitest'
import { scoreCandidate, decideStatus } from '../candidate-scorer'

describe('scoreCandidate', () => {
  it('returns base 0.30 for empty input', () => {
    const result = scoreCandidate({
      phone_e164: null,
      website_url: null,
      user_ratings_total: null,
      opening_hours_json: null,
      lat: null,
      lng: null,
      suburb: null,
      state: null,
      postcode: null,
      categories: [],
    })
    expect(result.score).toBe(0.3)
    expect(result.reasons).toContain('base:0.30')
  })

  it('adds 0.25 for phone', () => {
    const result = scoreCandidate({
      phone_e164: '+61299991234',
      website_url: null,
      user_ratings_total: null,
      opening_hours_json: null,
      lat: null,
      lng: null,
      suburb: null,
      state: null,
      postcode: null,
      categories: [],
    })
    expect(result.score).toBe(0.55)
    expect(result.reasons).toContain('phone:+0.25')
    expect(result.completenessFlags).toContain('has_phone')
  })

  it('adds 0.20 for website', () => {
    const result = scoreCandidate({
      phone_e164: null,
      website_url: 'https://example.com',
      user_ratings_total: null,
      opening_hours_json: null,
      lat: null,
      lng: null,
      suburb: null,
      state: null,
      postcode: null,
      categories: [],
    })
    expect(result.score).toBe(0.5)
    expect(result.reasons).toContain('website:+0.20')
    expect(result.completenessFlags).toContain('has_website')
  })

  it('adds 0.10 for reviews >= 5', () => {
    const result = scoreCandidate({
      phone_e164: null,
      website_url: null,
      user_ratings_total: 10,
      opening_hours_json: null,
      lat: null,
      lng: null,
      suburb: null,
      state: null,
      postcode: null,
      categories: [],
    })
    expect(result.score).toBe(0.4)
    expect(result.reasons).toContain('reviews>=5:+0.10')
  })

  it('does not add reviews bonus for < 5', () => {
    const result = scoreCandidate({
      phone_e164: null,
      website_url: null,
      user_ratings_total: 3,
      opening_hours_json: null,
      lat: null,
      lng: null,
      suburb: null,
      state: null,
      postcode: null,
      categories: [],
    })
    expect(result.score).toBe(0.3)
  })

  it('adds 0.10 for opening hours', () => {
    const result = scoreCandidate({
      phone_e164: null,
      website_url: null,
      user_ratings_total: null,
      opening_hours_json: { weekdayDescriptions: ['Mon: 9-5'] },
      lat: null,
      lng: null,
      suburb: null,
      state: null,
      postcode: null,
      categories: [],
    })
    expect(result.score).toBe(0.4)
    expect(result.completenessFlags).toContain('has_hours')
  })

  it('adds 0.05 for coordinates', () => {
    const result = scoreCandidate({
      phone_e164: null,
      website_url: null,
      user_ratings_total: null,
      opening_hours_json: null,
      lat: -27.47,
      lng: 153.02,
      suburb: null,
      state: null,
      postcode: null,
      categories: [],
    })
    expect(result.score).toBe(0.35)
    expect(result.completenessFlags).toContain('has_coords')
  })

  it('caps at 1.0', () => {
    const result = scoreCandidate({
      phone_e164: '+61299991234',
      website_url: 'https://example.com',
      user_ratings_total: 100,
      opening_hours_json: { weekdayDescriptions: ['Mon: 9-5'] },
      lat: -27.47,
      lng: 153.02,
      suburb: 'Brisbane',
      state: 'QLD',
      postcode: '4000',
      categories: ['plumbing'],
    })
    expect(result.score).toBe(1.0)
  })

  it('includes address completeness flags', () => {
    const result = scoreCandidate({
      phone_e164: null,
      website_url: null,
      user_ratings_total: null,
      opening_hours_json: null,
      lat: null,
      lng: null,
      suburb: 'Brisbane',
      state: 'QLD',
      postcode: '4000',
      categories: ['plumbing'],
    })
    expect(result.completenessFlags).toContain('has_suburb')
    expect(result.completenessFlags).toContain('has_state')
    expect(result.completenessFlags).toContain('has_postcode')
    expect(result.completenessFlags).toContain('has_category')
  })
})

describe('decideStatus', () => {
  const base = {
    confidence_score: 0.75,
    min_confidence: 0.5,
    phone_e164: '+61299991234' as string | null,
    website_url: 'https://example.com' as string | null,
    suburb: 'Brisbane' as string | null,
    state: 'QLD' as string | null,
    postcode: '4000' as string | null,
    categories: ['plumbing'],
    is_blacklisted: false,
  }

  it('returns ready_for_ai when all criteria met', () => {
    const result = decideStatus(base)
    expect(result.status).toBe('ready_for_ai')
  })

  it('rejects blacklisted places', () => {
    const result = decideStatus({ ...base, is_blacklisted: true })
    expect(result.status).toBe('rejected_low_quality')
    expect(result.rejectReason).toBe('blacklisted')
  })

  it('rejects missing suburb', () => {
    const result = decideStatus({ ...base, suburb: null })
    expect(result.status).toBe('rejected_low_quality')
    expect(result.rejectReason).toBe('missing_address')
  })

  it('rejects missing state', () => {
    const result = decideStatus({ ...base, state: null })
    expect(result.status).toBe('rejected_low_quality')
    expect(result.rejectReason).toBe('missing_address')
  })

  it('rejects missing postcode', () => {
    const result = decideStatus({ ...base, postcode: null })
    expect(result.status).toBe('rejected_low_quality')
    expect(result.rejectReason).toBe('missing_address')
  })

  it('rejects when no phone AND no website', () => {
    const result = decideStatus({ ...base, phone_e164: null, website_url: null })
    expect(result.status).toBe('rejected_low_quality')
    expect(result.rejectReason).toBe('no_contact')
  })

  it('accepts phone-only (no website)', () => {
    const result = decideStatus({ ...base, website_url: null })
    expect(result.status).toBe('ready_for_ai')
  })

  it('accepts website-only (no phone)', () => {
    const result = decideStatus({ ...base, phone_e164: null })
    expect(result.status).toBe('ready_for_ai')
  })

  it('rejects empty categories', () => {
    const result = decideStatus({ ...base, categories: [] })
    expect(result.status).toBe('rejected_low_quality')
    expect(result.rejectReason).toBe('no_category')
  })

  it('returns pending when confidence below min', () => {
    const result = decideStatus({ ...base, confidence_score: 0.3, min_confidence: 0.5 })
    expect(result.status).toBe('pending')
  })
})
