// Pure, synchronous listing quality assessment — no DB calls, no async

export const LISTING_STEP = {
  DETAILS: 1,
  CATEGORIES: 2,
  LOCATION: 3,
  PHOTOS: 4,
  TESTIMONIALS: 5,
  PREVIEW: 6,
} as const

export interface ListingForQuality {
  name: string | null
  description: string | null
  phone: string | null
  email_contact: string | null
  website: string | null
  isSuspended: boolean
  suspendedReason: string | null
  isUnderReview: boolean
  isRejected: boolean
  hasPendingChanges: boolean
  deleted_at: string | null
  hasCategories: boolean
  hasLocation: boolean
}

export interface QualityFlags {
  canPublish: boolean
  isActive: boolean
  effectiveState: string
  reasonCodes: string[]
  listingsEnabled: boolean
}

export interface QualityResult {
  flag: 'complete' | 'needs_action' | 'under_review' | 'blocked' | 'rejected' | 'edited'
  label: string
  hint: string
  fixStep: number | null
  colorClass: string
}

interface CompletenessIssue {
  field: string
  hint: string
  fixStep: number
}

const DEFAULT_FLAGS: QualityFlags = {
  canPublish: true,
  isActive: true,
  effectiveState: 'ok',
  reasonCodes: [],
  listingsEnabled: true,
}

function blocked(hint: string): QualityResult {
  return { flag: 'blocked', label: 'Blocked', hint, fixStep: null, colorClass: 'bg-red-100 text-red-800' }
}

function underReview(hint: string): QualityResult {
  return { flag: 'under_review', label: 'Under Review', hint, fixStep: null, colorClass: 'bg-blue-100 text-blue-800' }
}

function needsAction(hint: string, fixStep: number): QualityResult {
  return { flag: 'needs_action', label: 'Action Needed', hint, fixStep, colorClass: 'bg-amber-100 text-amber-800' }
}

function rejected(hint: string): QualityResult {
  return { flag: 'rejected', label: 'Rejected', hint, fixStep: null, colorClass: 'bg-red-100 text-red-800' }
}

function edited(hint: string): QualityResult {
  return { flag: 'edited', label: 'Edited', hint, fixStep: null, colorClass: 'bg-purple-100 text-purple-800' }
}

function getBlockedHint(reasonCodes: string[]): string {
  if (reasonCodes.includes('trial_expired')) return 'Not visible: trial expired'
  if (reasonCodes.includes('subscription_canceled')) return 'Not visible: subscription cancelled'
  if (reasonCodes.includes('payment_past_due')) return 'Not visible: payment past due'
  return 'Not visible: subscription required'
}

export function getCompletenessIssues(listing: ListingForQuality): CompletenessIssue[] {
  const issues: CompletenessIssue[] = []

  if (!listing.name?.trim()) {
    issues.push({ field: 'name', hint: 'Add a business name', fixStep: LISTING_STEP.DETAILS })
  }
  if (!listing.description?.trim()) {
    issues.push({ field: 'description', hint: 'Add a description', fixStep: LISTING_STEP.DETAILS })
  }
  if (!listing.phone?.trim() && !listing.email_contact?.trim() && !listing.website?.trim()) {
    issues.push({ field: 'contacts', hint: 'Add contact details', fixStep: LISTING_STEP.DETAILS })
  }
  if (!listing.hasCategories) {
    issues.push({ field: 'categories', hint: 'Select at least one category', fixStep: LISTING_STEP.CATEGORIES })
  }
  if (!listing.hasLocation) {
    issues.push({ field: 'location', hint: 'Add your service location', fixStep: LISTING_STEP.LOCATION })
  }

  return issues
}

export function getListingQuality(
  listing: ListingForQuality,
  flags?: QualityFlags
): QualityResult {
  const f = flags ?? DEFAULT_FLAGS

  // 1. BLOCKED — checked first
  if (listing.isSuspended) {
    const reason = listing.suspendedReason
      ? `Suspended: ${listing.suspendedReason}`
      : 'Listing suspended'
    return blocked(reason)
  }
  if (listing.deleted_at !== null) return blocked('Listing deleted')
  if (!f.listingsEnabled) return blocked('Listings temporarily disabled')
  if (f.effectiveState === 'blocked') return blocked(getBlockedHint(f.reasonCodes))
  if (!f.canPublish && !f.isActive) return blocked('Not visible: subscription required')

  // 2. UNDER_REVIEW / REJECTED / EDITED
  if (listing.isUnderReview) return underReview('Awaiting approval')
  if (listing.isRejected) return rejected('Rejected: edit and resubmit')
  if (listing.hasPendingChanges) {
    return edited('Has pending changes')
  }

  // 3. NEEDS_ACTION — first missing field determines the hint
  const issues = getCompletenessIssues(listing)
  if (issues.length > 0) {
    return needsAction(issues[0].hint, issues[0].fixStep)
  }

  // 4. COMPLETE
  return {
    flag: 'complete',
    label: 'Complete',
    hint: 'Listing is complete',
    fixStep: null,
    colorClass: 'bg-green-100 text-green-800',
  }
}
