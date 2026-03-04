import { describe, it, expect } from 'vitest'
import { deriveStatus } from '../pw-service'
import type { PublishedListing, WorkingListing } from '../pw-service'

function makeP(overrides: Partial<PublishedListing> = {}): PublishedListing {
  return {
    id: 'p-1',
    business_id: 'biz-1',
    version: 1,
    is_current: true,
    visibility_status: 'live',
    name: 'Test Biz',
    description: 'Desc',
    phone: '0400000000',
    email_contact: 'test@example.com',
    website: 'https://example.com',
    abn: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as PublishedListing
}

function makeW(overrides: Partial<WorkingListing> = {}): WorkingListing {
  return {
    id: 'w-1',
    business_id: 'biz-1',
    change_type: 'new',
    review_status: 'draft',
    name: 'Test Biz',
    description: 'Desc',
    phone: '0400000000',
    email_contact: 'test@example.com',
    website: 'https://example.com',
    abn: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as WorkingListing
}

const defaultBiz = { deleted_at: null, billing_status: 'active' }

describe('deriveStatus', () => {
  // ── Draft (W only, review_status='draft') → NOT under review ──
  it('draft only → effectiveVerification = not_submitted', () => {
    const result = deriveStatus(null, makeW({ review_status: 'draft' }), defaultBiz)
    expect(result.effectiveStatus).toBe('draft')
    expect(result.effectiveVerification).toBe('not_submitted')
  })

  it('draft only → isUnderReview would be false', () => {
    const result = deriveStatus(null, makeW({ review_status: 'draft' }), defaultBiz)
    // Downstream check: derived.effectiveVerification === 'pending'
    expect(result.effectiveVerification === 'pending').toBe(false)
  })

  // ── Pending review (W.review_status='pending') → under review ──
  it('pending review → effectiveVerification = pending', () => {
    const result = deriveStatus(null, makeW({ review_status: 'pending' }), defaultBiz)
    expect(result.effectiveVerification).toBe('pending')
  })

  // ── Rejected (W.review_status='changes_required') → rejected ──
  it('changes_required → effectiveVerification = rejected', () => {
    const result = deriveStatus(null, makeW({ review_status: 'changes_required' }), defaultBiz)
    expect(result.effectiveVerification).toBe('rejected')
  })

  // ── Published (P exists, no W) → approved ──
  it('published no amendment → effectiveVerification = approved', () => {
    const result = deriveStatus(makeP(), null, defaultBiz)
    expect(result.effectiveStatus).toBe('published')
    expect(result.effectiveVerification).toBe('approved')
  })

  // ── Published with pending amendment ──
  it('published + pending amendment → effectiveVerification = pending', () => {
    const result = deriveStatus(
      makeP(),
      makeW({ change_type: 'edit', review_status: 'pending' }),
      defaultBiz
    )
    expect(result.effectiveStatus).toBe('published')
    expect(result.effectiveVerification).toBe('pending')
    expect(result.hasPendingChanges).toBe(true)
  })

  // ── Published with draft amendment (not yet submitted) ──
  it('published + draft amendment → effectiveVerification = approved', () => {
    const result = deriveStatus(
      makeP(),
      makeW({ change_type: 'edit', review_status: 'draft' }),
      defaultBiz
    )
    expect(result.effectiveStatus).toBe('published')
    expect(result.effectiveVerification).toBe('approved')
  })

  // ── Deleted overrides everything ──
  it('deleted → effectiveStatus = deleted, effectiveVerification = approved', () => {
    const result = deriveStatus(makeP(), makeW(), { deleted_at: '2024-01-01T00:00:00Z' })
    expect(result.effectiveStatus).toBe('deleted')
    expect(result.effectiveVerification).toBe('approved')
  })

  // ── Suspended ──
  it('suspended P → effectiveStatus = suspended', () => {
    const result = deriveStatus(makeP({ visibility_status: 'suspended' }), null, defaultBiz)
    expect(result.effectiveStatus).toBe('suspended')
  })

  // ── Suspended + draft amendment (edit allowed, amendment path) ──
  it('suspended P + draft amendment → suspended, approved', () => {
    const result = deriveStatus(
      makeP({ visibility_status: 'suspended' }),
      makeW({ change_type: 'edit', review_status: 'draft' }),
      defaultBiz
    )
    expect(result.effectiveStatus).toBe('suspended')
    expect(result.effectiveVerification).toBe('approved')
    expect(result.hasPendingChanges).toBe(true)
  })

  // ── Suspended + pending amendment (submitted for review) ──
  it('suspended P + pending amendment → suspended, pending', () => {
    const result = deriveStatus(
      makeP({ visibility_status: 'suspended' }),
      makeW({ change_type: 'edit', review_status: 'pending' }),
      defaultBiz
    )
    expect(result.effectiveStatus).toBe('suspended')
    expect(result.effectiveVerification).toBe('pending')
  })

  // ── Paused ──
  it('paused P → effectiveStatus = paused', () => {
    const result = deriveStatus(makeP({ visibility_status: 'paused' }), null, defaultBiz)
    expect(result.effectiveStatus).toBe('paused')
  })
})
