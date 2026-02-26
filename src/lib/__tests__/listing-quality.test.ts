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
    status: 'published',
    verification_status: 'approved',
    pending_changes: null,
    deleted_at: null,
    suspended_reason: null,
    hasCategories: true,
    hasLocation: true,
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
      listing: { status: 'suspended' },
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

    // ── UNDER_REVIEW ──
    {
      desc: 'verification_status=pending → under_review',
      listing: { verification_status: 'pending' },
      expected: { flag: 'under_review', hint: /awaiting approval/i },
    },
    {
      desc: 'verification_status=review → under_review',
      listing: { verification_status: 'review' },
      expected: { flag: 'under_review', hint: /admin review/i },
    },
    {
      desc: 'verification_status=rejected → rejected',
      listing: { verification_status: 'rejected' },
      expected: { flag: 'rejected', hint: /rejected/i },
    },
    {
      desc: 'pending_changes + published → edited',
      listing: { pending_changes: { name: 'New Name' }, status: 'published' },
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
      makeListing({ status: 'suspended', description: null }),
      makeFlags()
    )
    expect(result.flag).toBe('blocked')
  })

  it('under_review overrides needs_action', () => {
    const result = getListingQuality(
      makeListing({ verification_status: 'pending', description: null }),
      makeFlags()
    )
    expect(result.flag).toBe('under_review')
  })

  it('blocked overrides under_review', () => {
    const result = getListingQuality(
      makeListing({ status: 'suspended', verification_status: 'pending' }),
      makeFlags()
    )
    expect(result.flag).toBe('blocked')
  })

  it('suspended with reason shows reason in hint', () => {
    const result = getListingQuality(
      makeListing({ status: 'suspended', suspended_reason: 'Terms of service violation' }),
      makeFlags()
    )
    expect(result.flag).toBe('blocked')
    expect(result.hint).toMatch(/Terms of service violation/)
  })

  it('rejected overrides needs_action', () => {
    const result = getListingQuality(
      makeListing({ verification_status: 'rejected', description: null }),
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
    const result = getListingQuality(makeListing({ status: 'suspended' }), makeFlags())
    expect(result.colorClass).toContain('red')
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
