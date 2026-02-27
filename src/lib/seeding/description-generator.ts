/**
 * Template-based description generator for seed listings.
 * No AI — just clean, professional text from available data.
 */

import type { NormalizedBusiness } from './types'
import { CATEGORY_QUERIES } from './normalizer'

const MAX_LENGTH = 200

export function generateDescription(biz: NormalizedBusiness): string {
  const category = CATEGORY_QUERIES.find((c) => c.slug === biz.categorySlug)
  const categoryName = category?.name ?? 'service'

  const location = [biz.suburb, biz.state].filter(Boolean).join(', ')

  let desc = `${biz.name} is a ${categoryName.toLowerCase()} provider`
  if (location) {
    desc += ` located in ${location}`
  }
  desc += '.'

  // Append rating if available
  if (biz.rating !== null && biz.reviewCount !== null && biz.reviewCount >= 3) {
    desc += ` Rated ${biz.rating}/5 from ${biz.reviewCount} reviews.`
  }

  // Append contact hint if available
  if (biz.phone) {
    desc += ' Contact details available.'
  }

  // Truncate if too long
  if (desc.length > MAX_LENGTH) {
    desc = desc.slice(0, MAX_LENGTH - 3) + '...'
  }

  return desc
}
