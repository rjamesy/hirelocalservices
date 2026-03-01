import { describe, it, expect } from 'vitest'
import {
  bigramSimilarity,
  scoreCategoryMatch,
  searchCategories,
  SearchableCategory,
} from '@/lib/category-search'

// ─── Test data ──────────────────────────────────────────────────────────────

const plumbing: SearchableCategory = {
  id: 'c-plumbing',
  name: 'Plumbing',
  parent_id: 'g-home',
  synonyms: ['Plumber', 'Plumbers'],
  keywords: ['drain', 'leaks', 'pipes', 'taps', 'hot water', 'toilet'],
}

const electrical: SearchableCategory = {
  id: 'c-electrical',
  name: 'Electrical',
  parent_id: 'g-home',
  synonyms: ['Electrician', 'Electricians', 'Sparky'],
  keywords: ['wiring', 'lights', 'power points', 'switchboard'],
}

const smartHome: SearchableCategory = {
  id: 'c-smart-home',
  name: 'Smart Home Setup',
  parent_id: 'g-tech',
  synonyms: ['Home Automation'],
  keywords: ['alexa', 'google home', 'smart lights', 'wifi'],
}

const houseCleaning: SearchableCategory = {
  id: 'c-house-clean',
  name: 'House Cleaning',
  parent_id: 'g-cleaning',
  synonyms: ['House Cleaner', 'Domestic Cleaning'],
  keywords: ['maid', 'regular clean', 'deep clean'],
}

const carpentry: SearchableCategory = {
  id: 'c-carpentry',
  name: 'Carpentry',
  parent_id: 'g-home',
  synonyms: ['Carpenter', 'Joiner'],
  keywords: ['timber', 'wood', 'deck'],
}

// Parent groups (should be excluded from search)
const homeGroup: SearchableCategory = {
  id: 'g-home',
  name: 'Home Maintenance',
  parent_id: null,
}

const allCategories = [homeGroup, plumbing, electrical, smartHome, houseCleaning, carpentry]

// ─── bigramSimilarity ───────────────────────────────────────────────────────

describe('bigramSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(bigramSimilarity('plumbing', 'plumbing')).toBe(1)
  })

  it('returns 0 for completely different strings', () => {
    expect(bigramSimilarity('abc', 'xyz')).toBe(0)
  })

  it('returns 0 for strings shorter than 2 chars', () => {
    expect(bigramSimilarity('a', 'abc')).toBe(0)
    expect(bigramSimilarity('ab', 'a')).toBe(0)
  })

  it('returns a value between 0 and 1 for partial matches', () => {
    const score = bigramSimilarity('plumbing', 'plumber')
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })
})

// ─── scoreCategoryMatch ─────────────────────────────────────────────────────

describe('scoreCategoryMatch', () => {
  it('returns 0 for empty or too-short queries', () => {
    expect(scoreCategoryMatch('', plumbing)).toBe(0)
    expect(scoreCategoryMatch('p', plumbing)).toBe(0)
  })

  it('returns 100 for exact prefix on name', () => {
    expect(scoreCategoryMatch('plumb', plumbing)).toBe(100)
    expect(scoreCategoryMatch('Plumbing', plumbing)).toBe(100)
  })

  it('returns 80 for word-start match on name', () => {
    expect(scoreCategoryMatch('Home', smartHome)).toBe(80)
    expect(scoreCategoryMatch('Setup', smartHome)).toBe(80)
  })

  it('returns 60 for substring match on name', () => {
    expect(scoreCategoryMatch('arpent', carpentry)).toBe(60)
    expect(scoreCategoryMatch('lumbi', plumbing)).toBe(60)
  })

  it('returns 50 for prefix on synonym', () => {
    expect(scoreCategoryMatch('Electrician', electrical)).toBe(50)
    expect(scoreCategoryMatch('Plumber', plumbing)).toBe(50)
  })

  it('returns 40 for substring on synonym', () => {
    expect(scoreCategoryMatch('lectrician', electrical)).toBe(40)
  })

  it('returns 30 for prefix on keyword', () => {
    expect(scoreCategoryMatch('drain', plumbing)).toBe(30)
    expect(scoreCategoryMatch('wiring', electrical)).toBe(30)
  })

  it('returns 20 for substring on keyword', () => {
    expect(scoreCategoryMatch('ipes', plumbing)).toBe(20)
  })

  it('returns 10 for fuzzy bigram match', () => {
    // "plumbin" vs "plumbing" has high bigram similarity
    const score = scoreCategoryMatch('plumbin', plumbing)
    // Should get at least 10 (bigram), but might hit substring (60) too
    expect(score).toBeGreaterThanOrEqual(10)
  })

  it('returns 0 when nothing matches', () => {
    expect(scoreCategoryMatch('zzzzz', plumbing)).toBe(0)
  })

  it('is case-insensitive', () => {
    expect(scoreCategoryMatch('PLUMB', plumbing)).toBe(100)
    expect(scoreCategoryMatch('electrician', electrical)).toBe(50)
  })

  it('handles categories with no synonyms or keywords', () => {
    const bare: SearchableCategory = {
      id: 'bare',
      name: 'Testing',
      parent_id: 'g1',
    }
    expect(scoreCategoryMatch('test', bare)).toBe(100)
    expect(scoreCategoryMatch('zzz', bare)).toBe(0)
  })
})

// ─── searchCategories ───────────────────────────────────────────────────────

describe('searchCategories', () => {
  it('only searches child categories (excludes parents)', () => {
    const results = searchCategories('Home', allCategories)
    const ids = results.map((r) => r.id)
    // "Home Maintenance" parent should NOT appear
    expect(ids).not.toContain('g-home')
  })

  it('returns results sorted by score descending', () => {
    const results = searchCategories('plumb', allCategories)
    expect(results[0].id).toBe('c-plumbing') // prefix match = 100
  })

  it('filters by groupId when specified', () => {
    const results = searchCategories('cl', allCategories, { groupId: 'g-cleaning' })
    expect(results.every((r) => r.parent_id === 'g-cleaning')).toBe(true)
  })

  it('excludes specific IDs', () => {
    const results = searchCategories('el', allCategories, {
      excludeIds: ['c-electrical'],
    })
    expect(results.map((r) => r.id)).not.toContain('c-electrical')
  })

  it('limits results to specified count', () => {
    const results = searchCategories('a', allCategories, { limit: 2 })
    expect(results.length).toBeLessThanOrEqual(2)
  })

  it('returns empty for no matches', () => {
    const results = searchCategories('zzzzzzz', allCategories)
    expect(results).toEqual([])
  })

  it('returns empty for short query', () => {
    const results = searchCategories('p', allCategories)
    expect(results).toEqual([])
  })

  it('searches across synonyms and keywords', () => {
    // "electrician" is a synonym for Electrical
    const results = searchCategories('electrician', allCategories)
    expect(results[0].id).toBe('c-electrical')

    // "drain" is a keyword for Plumbing
    const results2 = searchCategories('drain', allCategories)
    expect(results2[0].id).toBe('c-plumbing')
  })
})
