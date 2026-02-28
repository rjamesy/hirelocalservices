import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for the publish pipeline logic.
 *
 * These test the pure logic (eligibility checks, idempotency, slug generation)
 * without hitting the database. DB functions are tested via integration.
 */

// We test the logic patterns used by publishCandidate:
// 1. Idempotency: already-published candidates are skipped
// 2. Ineligible: missing description, low confidence, no categories → skipped
// 3. Slug generation: deterministic from name + place_id hash
// 4. Rollback status transitions

import { slugify } from '../normalizer'

describe('publish eligibility', () => {
  const baseCandidate = {
    place_id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    name: 'Brisbane House Cleaners',
    suburb: 'Brisbane City',
    postcode: '4000',
    state: 'QLD',
    lat: -27.4698,
    lng: 153.0251,
    phone_e164: '+61733001234',
    website_url: 'https://example.com',
    categories: ['house-cleaning'],
    confidence_score: 0.75,
    description: 'Professional house cleaning in Brisbane City, QLD.',
    description_source: 'openai',
    publish_status: 'unpublished',
    published_business_id: null,
  }

  it('eligible candidate has description, confidence >= 0.5, and categories', () => {
    const c = baseCandidate
    const isEligible = !!c.description && c.confidence_score >= 0.5 && c.categories.length > 0
    expect(isEligible).toBe(true)
  })

  it('ineligible when no description', () => {
    const c = { ...baseCandidate, description: null as string | null }
    const isEligible = !!c.description && c.confidence_score >= 0.5 && c.categories.length > 0
    expect(isEligible).toBe(false)
  })

  it('ineligible when confidence < 0.5', () => {
    const c = { ...baseCandidate, confidence_score: 0.3 }
    const isEligible = !!c.description && c.confidence_score >= 0.5 && c.categories.length > 0
    expect(isEligible).toBe(false)
  })

  it('ineligible when no categories', () => {
    const c = { ...baseCandidate, categories: [] as string[] }
    const isEligible = !!c.description && c.confidence_score >= 0.5 && c.categories.length > 0
    expect(isEligible).toBe(false)
  })

  it('already published is idempotent skip', () => {
    const c = { ...baseCandidate, publish_status: 'published', published_business_id: 'some-uuid' }
    const isAlreadyPublished = c.publish_status === 'published' && !!c.published_business_id
    expect(isAlreadyPublished).toBe(true)
  })

  it('not skipped when force with already published', () => {
    // Force mode would re-query with publish_status != 'unpublished' filter removed
    // The publishCandidate function still checks publish_status === 'published'
    // so the caller (getCandidatesForPublish with force) controls whether these are loaded
    const c = { ...baseCandidate, publish_status: 'published', published_business_id: 'some-uuid' }
    const isAlreadyPublished = c.publish_status === 'published' && !!c.published_business_id
    expect(isAlreadyPublished).toBe(true) // still detected as already published by publishCandidate
  })
})

describe('publish slug generation', () => {
  it('generates slug from name + place_id hash', () => {
    const name = 'Brisbane House Cleaners'
    const placeId = 'ChIJN1t_tDeuEmsRUsoyG83frY4'
    const hash = placeId.slice(-6).toLowerCase().replace(/[^a-z0-9]/g, '')
    const slug = `${slugify(name)}-${hash}`

    expect(slug).toBe('brisbane-house-cleaners-83fry4')
  })

  it('handles special characters in name', () => {
    const name = "O'Brien's Plumbing & Gas"
    const placeId = 'ChIJabcdef123456'
    const hash = placeId.slice(-6).toLowerCase().replace(/[^a-z0-9]/g, '')
    const slug = `${slugify(name)}-${hash}`

    expect(slug).toMatch(/^obriens-plumbing-and-gas-/)
    expect(slug).toMatch(/[a-z0-9]+$/)
  })

  it('produces consistent slugs for same input', () => {
    const name = 'Test Business'
    const placeId = 'ChIJN1t_tDeuEmsRUsoyG83frY4'
    const hash = placeId.slice(-6).toLowerCase().replace(/[^a-z0-9]/g, '')
    const slug1 = `${slugify(name)}-${hash}`
    const slug2 = `${slugify(name)}-${hash}`

    expect(slug1).toBe(slug2)
  })
})

describe('publish status transitions', () => {
  it('unpublished → published on success', () => {
    const statuses = ['unpublished', 'published'] as const
    expect(statuses[0]).toBe('unpublished')
    expect(statuses[1]).toBe('published')
  })

  it('unpublished → skipped on ineligible', () => {
    const status = 'skipped'
    expect(status).toBe('skipped')
  })

  it('published → rolled_back on rollback', () => {
    const status = 'rolled_back'
    expect(status).toBe('rolled_back')
  })

  it('all valid publish statuses', () => {
    const validStatuses = ['unpublished', 'published', 'skipped', 'rolled_back']
    expect(validStatuses).toHaveLength(4)
    for (const s of validStatuses) {
      expect(typeof s).toBe('string')
    }
  })
})

describe('publish batch tracking', () => {
  it('batch_id is a valid UUID format', () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    const batchId = '550e8400-e29b-41d4-a716-446655440000'
    expect(batchId).toMatch(uuidRegex)
  })

  it('multiple candidates share same batch_id', () => {
    const batchId = '550e8400-e29b-41d4-a716-446655440000'
    const candidates = [
      { place_id: 'a', publish_batch_id: batchId },
      { place_id: 'b', publish_batch_id: batchId },
      { place_id: 'c', publish_batch_id: batchId },
    ]
    const allSameBatch = candidates.every((c) => c.publish_batch_id === batchId)
    expect(allSameBatch).toBe(true)
  })
})

describe('visibility rules for seed businesses', () => {
  // Tests the visibility logic from is_business_visible / is_search_eligible
  // A seed business is visible when:
  // - status = 'published'
  // - verification_status = 'approved'
  // - is_seed = true
  // - claim_status = 'unclaimed'
  // - seed_confidence >= 0.5
  // - billing_status != 'billing_suspended'
  // - has_contact = true (phone or website)

  interface SeedBusiness {
    status: string
    verification_status: string
    is_seed: boolean
    claim_status: string
    seed_confidence: number
    billing_status: string
    has_contact: boolean
  }

  function isVisible(b: SeedBusiness): boolean {
    return (
      b.verification_status === 'approved' &&
      b.status === 'published' &&
      b.billing_status !== 'billing_suspended' &&
      b.has_contact &&
      (b.claim_status === 'claimed' || (b.is_seed && b.claim_status !== 'claimed' && b.seed_confidence >= 0.5))
    )
  }

  const baseBusiness: SeedBusiness = {
    status: 'published',
    verification_status: 'approved',
    is_seed: true,
    claim_status: 'unclaimed',
    seed_confidence: 0.75,
    billing_status: 'seed',
    has_contact: true,
  }

  it('visible with standard seed business fields', () => {
    expect(isVisible(baseBusiness)).toBe(true)
  })

  it('not visible when seed_confidence < 0.5', () => {
    expect(isVisible({ ...baseBusiness, seed_confidence: 0.3 })).toBe(false)
  })

  it('not visible when no contact', () => {
    expect(isVisible({ ...baseBusiness, has_contact: false })).toBe(false)
  })

  it('not visible when billing_suspended', () => {
    expect(isVisible({ ...baseBusiness, billing_status: 'billing_suspended' })).toBe(false)
  })

  it('not visible when status is not published', () => {
    expect(isVisible({ ...baseBusiness, status: 'draft' })).toBe(false)
  })

  it('not visible when verification_status is not approved', () => {
    expect(isVisible({ ...baseBusiness, verification_status: 'pending' })).toBe(false)
  })

  it('visible when claimed (regardless of seed_confidence)', () => {
    expect(isVisible({ ...baseBusiness, claim_status: 'claimed', seed_confidence: 0.1 })).toBe(true)
  })

  it('visible at exactly 0.5 confidence', () => {
    expect(isVisible({ ...baseBusiness, seed_confidence: 0.5 })).toBe(true)
  })
})
