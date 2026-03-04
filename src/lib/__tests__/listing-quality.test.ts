import { describe, it, expect } from 'vitest'
import {
  getListingQuality,
  getCompletenessIssues,
  LISTING_STEP,
  type ListingForQuality,
  type QualityFlags,
} from '../listing-quality'

function makeListing(overrides: Partial<ListingForQuality> = {}): ListingForQuality {
  return {
    name: 'Test Biz',
    description: 'A test business',
    phone: '0400000000',
    email_contact: 'test@example.com',
    website: 'https://example.com',
    isSuspended: false,
    suspendedReason: null,
    isUnderReview: false,
    isRejected: false,
    hasPendingChanges: false,
    deleted_at: null,
    hasCategories: true,
    hasLocation: true,
    isDraft: false,
    ...overrides,
  }
}

function makeFlags(overrides: Partial<QualityFlags> = {}): QualityFlags {
  return {
    canPublish: true,
    isActive: true,
    effectiveState: 'ok',
    reasonCodes: [],
    listingsEnabled: true,
    ...overrides,
  }
}

describe('getListingQuality', () => {
  it.each<{ desc: string; listing: Partial<ListingForQuality>; flags?: Partial<QualityFlags>; expected: { flag: string; hint?: RegExp } }>([
    // ── COMPLETE ──
    {
      desc: 'complete listing → complete',
      listing: {},
      expected: { flag: 'complete' },
    },
    {
      desc: 'phone-only (no email/website) → still complete',
      listing: { email_contact: null, website: null },
      expected: { flag: 'complete' },
    },

    // ── BLOCKED ──
    {
      desc: 'suspended → blocked',
      listing: { isSuspended: true },
      expected: { flag: 'blocked', hint: /suspended/i },
    },
    {
      desc: 'deleted_at set → blocked',
      listing: { deleted_at: '2024-01-01T00:00:00Z' },
      expected: { flag: 'blocked', hint: /deleted/i },
    },
    {
      desc: 'listingsEnabled=false → blocked',
      listing: {},
      flags: { listingsEnabled: false },
      expected: { flag: 'blocked', hint: /temporarily disabled/i },
    },
    {
      desc: 'effectiveState=blocked + trial_expired → blocked with trial hint',
      listing: {},
      flags: { effectiveState: 'blocked', reasonCodes: ['trial_expired'] },
      expected: { flag: 'blocked', hint: /trial expired/i },
    },
    {
      desc: 'effectiveState=blocked + payment_past_due → blocked with payment hint',
      listing: {},
      flags: { effectiveState: 'blocked', reasonCodes: ['payment_past_due'] },
      expected: { flag: 'blocked', hint: /payment/i },
    },
    {
      desc: 'effectiveState=blocked + subscription_canceled → blocked with cancelled hint',
      listing: {},
      flags: { effectiveState: 'blocked', reasonCodes: ['subscription_canceled'] },
      expected: { flag: 'blocked', hint: /cancelled/i },
    },
    {
      desc: 'canPublish=false, isActive=false → blocked',
      listing: {},
      flags: { canPublish: false, isActive: false },
      expected: { flag: 'blocked', hint: /subscription required/i },
    },

    // ── AWAITING_SUBSCRIPTION (draft + no subscription) ──
    {
      desc: 'draft + effectiveState=blocked → awaiting_subscription',
      listing: { isDraft: true },
      flags: { effectiveState: 'blocked', reasonCodes: ['trial_expired'] },
      expected: { flag: 'awaiting_subscription', hint: /subscribe/i },
    },
    {
      desc: 'draft + canPublish=false, isActive=false → awaiting_subscription',
      listing: { isDraft: true },
      flags: { canPublish: false, isActive: false },
      expected: { flag: 'awaiting_subscription', hint: /subscribe/i },
    },
    {
      desc: 'draft + suspended → still blocked (not awaiting_subscription)',
      listing: { isDraft: true, isSuspended: true },
      expected: { flag: 'blocked', hint: /suspended/i },
    },
    {
      desc: 'draft + deleted → still blocked',
      listing: { isDraft: true, deleted_at: '2024-01-01T00:00:00Z' },
      expected: { flag: 'blocked', hint: /deleted/i },
    },

    // ── UNDER_REVIEW ──
    {
      desc: 'isUnderReview → under_review',
      listing: { isUnderReview: true },
      expected: { flag: 'under_review', hint: /awaiting approval/i },
    },
    {
      desc: 'isRejected → rejected',
      listing: { isRejected: true },
      expected: { flag: 'rejected', hint: /rejected/i },
    },
    {
      desc: 'hasPendingChanges → edited',
      listing: { hasPendingChanges: true },
      expected: { flag: 'edited', hint: /pending changes/i },
    },

    // ── NEEDS_ACTION ──
    {
      desc: 'missing description → needs_action with details step',
      listing: { description: null },
      expected: { flag: 'needs_action', hint: /description/i },
    },
    {
      desc: 'missing categories → needs_action with categories step',
      listing: { hasCategories: false },
      expected: { flag: 'needs_action', hint: /category/i },
    },
    {
      desc: 'missing location → needs_action with location step',
      listing: { hasLocation: false },
      expected: { flag: 'needs_action', hint: /location/i },
    },
    {
      desc: 'missing all contacts → needs_action with details step',
      listing: { phone: null, email_contact: null, website: null },
      expected: { flag: 'needs_action', hint: /contact/i },
    },
    {
      desc: 'missing name → needs_action',
      listing: { name: null },
      expected: { flag: 'needs_action', hint: /business name/i },
    },
  ])('$desc', ({ listing, flags, expected }) => {
    const result = getListingQuality(makeListing(listing), makeFlags(flags))
    expect(result.flag).toBe(expected.flag)
    if (expected.hint) {
      expect(result.hint).toMatch(expected.hint)
    }
  })

  // ── Priority ordering ──
  it('blocked overrides needs_action', () => {
    const result = getListingQuality(
      makeListing({ isSuspended: true, description: null }),
      makeFlags()
    )
    expect(result.flag).toBe('blocked')
  })

  it('under_review overrides needs_action', () => {
    const result = getListingQuality(
      makeListing({ isUnderReview: true, description: null }),
      makeFlags()
    )
    expect(result.flag).toBe('under_review')
  })

  it('blocked overrides under_review', () => {
    const result = getListingQuality(
      makeListing({ isSuspended: true, isUnderReview: true }),
      makeFlags()
    )
    expect(result.flag).toBe('blocked')
  })

  it('suspended with reason shows reason in hint', () => {
    const result = getListingQuality(
      makeListing({ isSuspended: true, suspendedReason: 'Terms of service violation' }),
      makeFlags()
    )
    expect(result.flag).toBe('blocked')
    expect(result.hint).toMatch(/Terms of service violation/)
  })

  it('rejected overrides needs_action', () => {
    const result = getListingQuality(
      makeListing({ isRejected: true, description: null }),
      makeFlags()
    )
    expect(result.flag).toBe('rejected')
  })

  it('no flags provided → defaults permissive → complete', () => {
    const result = getListingQuality(makeListing())
    expect(result.flag).toBe('complete')
  })

  // ── fixStep checks ──
  it('missing description → fixStep = DETAILS', () => {
    const result = getListingQuality(makeListing({ description: null }), makeFlags())
    expect(result.fixStep).toBe(LISTING_STEP.DETAILS)
  })

  it('missing categories → fixStep = CATEGORIES', () => {
    const result = getListingQuality(makeListing({ hasCategories: false }), makeFlags())
    expect(result.fixStep).toBe(LISTING_STEP.CATEGORIES)
  })

  it('missing location → fixStep = LOCATION', () => {
    const result = getListingQuality(makeListing({ hasLocation: false }), makeFlags())
    expect(result.fixStep).toBe(LISTING_STEP.LOCATION)
  })

  // ── colorClass ──
  it('complete has green colorClass', () => {
    const result = getListingQuality(makeListing(), makeFlags())
    expect(result.colorClass).toContain('green')
  })

  it('blocked has red colorClass', () => {
    const result = getListingQuality(makeListing({ isSuspended: true }), makeFlags())
    expect(result.colorClass).toContain('red')
  })

  it('awaiting_subscription has blue colorClass', () => {
    const result = getListingQuality(
      makeListing({ isDraft: true }),
      makeFlags({ canPublish: false, isActive: false })
    )
    expect(result.flag).toBe('awaiting_subscription')
    expect(result.colorClass).toContain('blue')
  })

  it('draft + suspended → blocked overrides awaiting_subscription', () => {
    const result = getListingQuality(
      makeListing({ isDraft: true, isSuspended: true }),
      makeFlags({ canPublish: false, isActive: false })
    )
    expect(result.flag).toBe('blocked')
  })

  // Phase 1 — draft + active sub → flag: draft (NOT complete, NOT under_review)
  it('draft + active sub → flag: draft', () => {
    const result = getListingQuality(
      makeListing({ isDraft: true, isUnderReview: false }),
      makeFlags({ canPublish: true, isActive: true, effectiveState: 'ok' })
    )
    expect(result.flag).toBe('draft')
    expect(result.flag).not.toBe('under_review')
    expect(result.flag).not.toBe('complete')
  })

  // Phase 1 — draft + no sub → awaiting_subscription
  it('draft + no subscription → awaiting_subscription, NOT under_review', () => {
    const result = getListingQuality(
      makeListing({ isDraft: true, isUnderReview: false }),
      makeFlags({ canPublish: false, isActive: false, effectiveState: 'no_plan' })
    )
    expect(result.flag).toBe('awaiting_subscription')
    expect(result.flag).not.toBe('under_review')
  })

  // Phase 1 — submitted (review_status='pending') + active sub → under_review
  it('submitted (isUnderReview=true) + active sub → under_review', () => {
    const result = getListingQuality(
      makeListing({ isDraft: true, isUnderReview: true }),
      makeFlags({ canPublish: true, isActive: true, effectiveState: 'ok' })
    )
    expect(result.flag).toBe('under_review')
  })

  // Phase 1 — published clean → complete
  it('published clean → complete', () => {
    const result = getListingQuality(
      makeListing({ isDraft: false, isUnderReview: false }),
      makeFlags({ canPublish: true, isActive: true, effectiveState: 'ok' })
    )
    expect(result.flag).toBe('complete')
  })

  // Phase 1 — published clean → complete
  it('published clean → complete', () => {
    const result = getListingQuality(
      makeListing({ isDraft: false, isUnderReview: false }),
      makeFlags({ canPublish: true, isActive: true, effectiveState: 'ok' })
    )
    expect(result.flag).toBe('complete')
  })
})

describe('getCompletenessIssues', () => {
  it('returns empty for complete listing', () => {
    expect(getCompletenessIssues(makeListing())).toEqual([])
  })

  it('returns all missing fields', () => {
    const issues = getCompletenessIssues(
      makeListing({
        name: null,
        description: null,
        phone: null,
        email_contact: null,
        website: null,
        hasCategories: false,
        hasLocation: false,
      })
    )
    expect(issues).toHaveLength(5)
    expect(issues.map((i) => i.field)).toEqual(['name', 'description', 'contacts', 'categories', 'location'])
  })

  it('does not flag contacts if phone is set', () => {
    const issues = getCompletenessIssues(
      makeListing({ email_contact: null, website: null })
    )
    expect(issues.find((i) => i.field === 'contacts')).toBeUndefined()
  })

  it('treats whitespace-only name as missing', () => {
    const issues = getCompletenessIssues(makeListing({ name: '   ' }))
    expect(issues.find((i) => i.field === 'name')).toBeDefined()
  })
})
