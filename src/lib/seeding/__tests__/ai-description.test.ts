import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateFallbackDescription,
  estimateCost,
} from '../ai-description'
import type { CandidateForAI } from '../ai-description'

describe('generateFallbackDescription', () => {
  const base: CandidateForAI = {
    name: 'Brisbane House Cleaners',
    suburb: 'Brisbane City',
    state: 'QLD',
    postcode: '4000',
    categories: ['house-cleaning'],
    rating: 4.5,
    user_ratings_total: 25,
    phone_e164: '+61733001234',
    website_url: 'https://example.com',
  }

  it('generates a template description', () => {
    const desc = generateFallbackDescription(base)
    expect(desc).toContain('Brisbane House Cleaners')
    expect(desc).toContain('house cleaning')
    expect(desc).toContain('Brisbane City, QLD')
  })

  it('includes rating when reviews >= 3', () => {
    const desc = generateFallbackDescription(base)
    expect(desc).toContain('Rated 4.5/5 from 25 reviews')
  })

  it('omits rating when reviews < 3', () => {
    const desc = generateFallbackDescription({ ...base, user_ratings_total: 2 })
    expect(desc).not.toContain('Rated')
  })

  it('omits rating when null', () => {
    const desc = generateFallbackDescription({ ...base, rating: null, user_ratings_total: null })
    expect(desc).not.toContain('Rated')
  })

  it('includes contact hint when phone available', () => {
    const desc = generateFallbackDescription(base)
    expect(desc).toContain('Contact details available')
  })

  it('omits contact hint when no phone', () => {
    const desc = generateFallbackDescription({ ...base, phone_e164: null })
    expect(desc).not.toContain('Contact details available')
  })

  it('truncates to 200 chars max', () => {
    const longName = 'A'.repeat(200)
    const desc = generateFallbackDescription({ ...base, name: longName })
    expect(desc.length).toBeLessThanOrEqual(200)
    expect(desc).toMatch(/\.{3}$/)
  })

  it('uses slug as fallback when category not found', () => {
    const desc = generateFallbackDescription({ ...base, categories: ['unknown-category'] })
    expect(desc).toContain('unknown-category')
  })

  it('uses "service" when no categories', () => {
    const desc = generateFallbackDescription({ ...base, categories: [] })
    expect(desc).toContain('service provider')
  })
})

describe('estimateCost', () => {
  it('returns 0 for 0 tokens', () => {
    expect(estimateCost(0, 0)).toBe(0)
  })

  it('calculates cost with input pricing', () => {
    // 1M input tokens at $0.15
    const cost = estimateCost(1_000_000, 0)
    expect(cost).toBeCloseTo(0.15, 2)
  })

  it('calculates cost with output pricing', () => {
    // 1M output tokens at $0.60
    const cost = estimateCost(0, 1_000_000)
    expect(cost).toBeCloseTo(0.60, 2)
  })

  it('calculates combined cost', () => {
    // 500 prompt + 100 completion (realistic per-call)
    const cost = estimateCost(500, 100)
    // 500 * 0.15/1M + 100 * 0.60/1M = 0.000075 + 0.00006 = 0.000135
    expect(cost).toBeCloseTo(0.000135, 6)
  })

  it('handles typical batch cost', () => {
    // 100 candidates × 2 calls × ~300 prompt + ~50 completion
    const cost = estimateCost(100 * 2 * 300, 100 * 2 * 50)
    // 60000 * 0.15/1M + 10000 * 0.60/1M = 0.009 + 0.006 = 0.015
    expect(cost).toBeCloseTo(0.015, 3)
  })
})
