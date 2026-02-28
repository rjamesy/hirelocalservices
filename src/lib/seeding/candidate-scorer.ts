/**
 * Confidence scoring and status decisions for seed candidates.
 *
 * Separate from the existing confidence.ts which operates on NormalizedBusiness.
 * This module works directly with seed_candidates fields.
 */

export interface CandidateScoreInput {
  phone_e164: string | null
  website_url: string | null
  user_ratings_total: number | null
  opening_hours_json: unknown | null
  lat: number | null
  lng: number | null
  suburb: string | null
  state: string | null
  postcode: string | null
  categories: string[]
}

export interface ScoreResult {
  score: number
  reasons: string[]
  completenessFlags: string[]
}

/**
 * Compute deterministic confidence score for a seed candidate.
 *
 * Scoring:
 *  base     0.30
 *  phone   +0.25
 *  website +0.20
 *  reviews +0.10  (userRatingCount >= 5)
 *  hours   +0.10
 *  coords  +0.05
 *  cap      1.00
 */
export function scoreCandidate(input: CandidateScoreInput): ScoreResult {
  let score = 0.30
  const reasons: string[] = ['base:0.30']
  const flags: string[] = []

  if (input.phone_e164) {
    score += 0.25
    reasons.push('phone:+0.25')
    flags.push('has_phone')
  }

  if (input.website_url) {
    score += 0.20
    reasons.push('website:+0.20')
    flags.push('has_website')
  }

  if (input.user_ratings_total !== null && input.user_ratings_total >= 5) {
    score += 0.10
    reasons.push('reviews>=5:+0.10')
    flags.push('has_reviews')
  }

  if (input.opening_hours_json) {
    score += 0.10
    reasons.push('hours:+0.10')
    flags.push('has_hours')
  }

  if (input.lat !== null && input.lng !== null) {
    score += 0.05
    reasons.push('coords:+0.05')
    flags.push('has_coords')
  }

  score = Math.min(score, 1.0)
  score = Math.round(score * 100) / 100

  if (input.suburb) flags.push('has_suburb')
  if (input.state) flags.push('has_state')
  if (input.postcode) flags.push('has_postcode')
  if (input.categories.length > 0) flags.push('has_category')

  return { score, reasons, completenessFlags: flags }
}

export type CandidateStatus = 'pending' | 'ready_for_ai' | 'rejected_low_quality'

export interface StatusInput {
  confidence_score: number
  min_confidence: number
  phone_e164: string | null
  website_url: string | null
  suburb: string | null
  state: string | null
  postcode: string | null
  categories: string[]
  is_blacklisted: boolean
}

export interface StatusResult {
  status: CandidateStatus
  rejectReason?: string
}

/**
 * Determine candidate status based on quality rules.
 *
 * Reject rules (rejected_low_quality):
 *  - missing suburb/state/postcode
 *  - missing both phone and website
 *  - category mapping empty
 *  - blacklisted
 *
 * Ready rules (ready_for_ai):
 *  - confidence >= min_confidence AND has contact AND has category
 */
export function decideStatus(input: StatusInput): StatusResult {
  // Reject rules
  if (input.is_blacklisted) {
    return { status: 'rejected_low_quality', rejectReason: 'blacklisted' }
  }
  if (!input.suburb || !input.state || !input.postcode) {
    return { status: 'rejected_low_quality', rejectReason: 'missing_address' }
  }
  if (!input.phone_e164 && !input.website_url) {
    return { status: 'rejected_low_quality', rejectReason: 'no_contact' }
  }
  if (input.categories.length === 0) {
    return { status: 'rejected_low_quality', rejectReason: 'no_category' }
  }

  // Ready rules
  if (
    input.confidence_score >= input.min_confidence &&
    (input.phone_e164 || input.website_url) &&
    input.categories.length > 0
  ) {
    return { status: 'ready_for_ai' }
  }

  return { status: 'pending' }
}
