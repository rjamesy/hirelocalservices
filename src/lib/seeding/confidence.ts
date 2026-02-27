/**
 * Confidence scoring for seed listings.
 *
 * Returns a score from 0.0 to 1.0 indicating how complete and trustworthy
 * the business data is. Businesses below the minimum confidence threshold
 * (default 0.5) are not inserted.
 */

import type { NormalizedBusiness } from './types'

export function calculateConfidence(biz: NormalizedBusiness): number {
  let score = 0

  // Has phone number (+0.25)
  if (biz.phone) score += 0.25

  // Has website (+0.15)
  if (biz.website) score += 0.15

  // Has street address (+0.20)
  if (biz.streetAddress) score += 0.20

  // Has opening hours (+0.10)
  if (biz.openingHours && biz.openingHours.length > 0) score += 0.10

  // Has Google rating >= 3.5 (+0.10)
  if (biz.rating !== null && biz.rating >= 3.5) score += 0.10

  // Has >= 5 reviews (+0.10)
  if (biz.reviewCount !== null && biz.reviewCount >= 5) score += 0.10

  // Category mapped successfully (+0.10)
  if (biz.categorySlug) score += 0.10

  return Math.round(score * 100) / 100
}
