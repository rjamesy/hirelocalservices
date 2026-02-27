/**
 * Normalizes Google Places API results into our standard business format.
 */

import type { PlaceResult, NormalizedBusiness, CategoryQuery } from './types'

// ─── Category Mapping ────────────────────────────────────────────────
// Maps our category slugs to Google Places text search queries

export const CATEGORY_QUERIES: CategoryQuery[] = [
  // Cleaning
  { slug: 'house-cleaning', name: 'House Cleaning', googleQuery: 'house cleaning service' },
  { slug: 'office-cleaning', name: 'Office Cleaning', googleQuery: 'office cleaning service' },
  { slug: 'carpet-cleaning', name: 'Carpet Cleaning', googleQuery: 'carpet cleaning service' },
  { slug: 'window-cleaning', name: 'Window Cleaning', googleQuery: 'window cleaning service' },
  { slug: 'end-of-lease-cleaning', name: 'End of Lease Cleaning', googleQuery: 'end of lease cleaning' },
  { slug: 'aircon-cleaning', name: 'Aircon Cleaning', googleQuery: 'air conditioning service' },
  // Home Maintenance
  { slug: 'handyman', name: 'Handyman', googleQuery: 'handyman service' },
  { slug: 'painting', name: 'Painting', googleQuery: 'house painter' },
  { slug: 'plumbing', name: 'Plumbing', googleQuery: 'plumber' },
  { slug: 'electrical', name: 'Electrical', googleQuery: 'electrician' },
  { slug: 'carpentry', name: 'Carpentry', googleQuery: 'carpenter' },
  { slug: 'fencing', name: 'Fencing', googleQuery: 'fencing contractor' },
  { slug: 'roofing', name: 'Roofing', googleQuery: 'roofing contractor' },
  { slug: 'guttering', name: 'Guttering', googleQuery: 'gutter cleaning service' },
  // Outdoor
  { slug: 'lawn-mowing', name: 'Lawn Mowing', googleQuery: 'lawn mowing service' },
  { slug: 'gardening', name: 'Gardening', googleQuery: 'gardening service' },
  { slug: 'tree-removal', name: 'Tree Removal', googleQuery: 'tree removal service' },
  { slug: 'landscaping', name: 'Landscaping', googleQuery: 'landscaping service' },
  { slug: 'pressure-washing', name: 'Pressure Washing', googleQuery: 'pressure washing service' },
  // Automotive
  { slug: 'mobile-mechanic', name: 'Mobile Mechanic', googleQuery: 'mobile mechanic' },
  { slug: 'car-detailing', name: 'Car Detailing', googleQuery: 'car detailing service' },
  { slug: 'towing', name: 'Towing', googleQuery: 'towing service' },
  // Moving & Delivery
  { slug: 'removalists', name: 'Removalists', googleQuery: 'removalist moving service' },
  { slug: 'furniture-assembly', name: 'Furniture Assembly', googleQuery: 'furniture assembly service' },
  { slug: 'courier', name: 'Courier', googleQuery: 'courier delivery service' },
  { slug: 'rubbish-removal', name: 'Rubbish Removal', googleQuery: 'rubbish removal service' },
  // Pest Control
  { slug: 'general-pest-control', name: 'General Pest Control', googleQuery: 'pest control service' },
  { slug: 'termite-inspection', name: 'Termite Inspection', googleQuery: 'termite inspection service' },
  { slug: 'rodent-control', name: 'Rodent Control', googleQuery: 'rodent control service' },
  // Pet Services
  { slug: 'dog-walking', name: 'Dog Walking', googleQuery: 'dog walking service' },
  { slug: 'pet-grooming', name: 'Pet Grooming', googleQuery: 'pet grooming service' },
  { slug: 'pet-sitting', name: 'Pet Sitting', googleQuery: 'pet sitting service' },
  // Beauty & Wellness
  { slug: 'mobile-hairdresser', name: 'Mobile Hairdresser', googleQuery: 'mobile hairdresser' },
  { slug: 'mobile-beauty', name: 'Mobile Beauty', googleQuery: 'mobile beauty service' },
  { slug: 'massage-therapist', name: 'Massage Therapist', googleQuery: 'massage therapist' },
  // IT & Tech
  { slug: 'computer-repair', name: 'Computer Repair', googleQuery: 'computer repair service' },
  { slug: 'phone-repair', name: 'Phone Repair', googleQuery: 'phone repair service' },
  { slug: 'smart-home-setup', name: 'Smart Home Setup', googleQuery: 'smart home installation' },
  // Events
  { slug: 'photography', name: 'Photography', googleQuery: 'photographer' },
  { slug: 'dj', name: 'DJ', googleQuery: 'DJ hire service' },
  { slug: 'catering', name: 'Catering', googleQuery: 'catering service' },
  { slug: 'party-hire', name: 'Party Hire', googleQuery: 'party hire equipment' },
]

// ─── Phone Normalization ─────────────────────────────────────────────

export function normalizePhone(raw: string | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/[^0-9+]/g, '')
  // Australian phone formats: +61..., 0X...
  if (cleaned.match(/^\+61[2-9]\d{8}$/)) return cleaned
  if (cleaned.match(/^0[2-9]\d{8}$/)) return '+61' + cleaned.slice(1)
  // Mobile: +614..., 04...
  if (cleaned.match(/^\+614\d{8}$/)) return cleaned
  if (cleaned.match(/^04\d{8}$/)) return '+61' + cleaned.slice(1)
  return null
}

// ─── Website Normalization ───────────────────────────────────────────

export function normalizeWebsite(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
    return url.toString()
  } catch {
    return null
  }
}

// ─── Slug Generation ─────────────────────────────────────────────────

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// ─── Address Parsing ─────────────────────────────────────────────────

type ParsedAddress = {
  streetAddress: string | null
  suburb: string | null
  state: string | null
  postcode: string | null
}

const AU_STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT']

export function parseAddress(place: PlaceResult): ParsedAddress {
  const result: ParsedAddress = {
    streetAddress: null,
    suburb: null,
    state: null,
    postcode: null,
  }

  if (place.addressComponents) {
    for (const comp of place.addressComponents) {
      if (comp.types.includes('street_number') || comp.types.includes('route')) {
        result.streetAddress = result.streetAddress
          ? `${result.streetAddress} ${comp.longText}`
          : comp.longText
      }
      if (comp.types.includes('locality')) {
        result.suburb = comp.longText
      }
      if (comp.types.includes('administrative_area_level_1')) {
        // Google returns full state name; map to abbreviation
        const short = comp.shortText?.toUpperCase()
        result.state = AU_STATES.includes(short) ? short : comp.longText
      }
      if (comp.types.includes('postal_code')) {
        result.postcode = comp.longText
      }
    }
  }

  // Fallback: parse from formattedAddress
  if (!result.state && place.formattedAddress) {
    for (const st of AU_STATES) {
      if (place.formattedAddress.includes(` ${st} `)) {
        result.state = st
        break
      }
    }
  }

  return result
}

// ─── Main Normalizer ─────────────────────────────────────────────────

export function normalizeBusiness(
  place: PlaceResult,
  categorySlug: string
): NormalizedBusiness {
  const address = parseAddress(place)
  const name = place.displayName?.text ?? 'Unknown Business'

  return {
    name,
    slug: slugify(name),
    phone: normalizePhone(place.nationalPhoneNumber ?? place.internationalPhoneNumber),
    website: normalizeWebsite(place.websiteUri),
    description: null, // Set by description-generator
    lat: place.location.latitude,
    lng: place.location.longitude,
    suburb: address.suburb,
    state: address.state,
    postcode: address.postcode,
    streetAddress: address.streetAddress,
    categorySlug,
    googlePlaceId: place.id,
    openingHours: place.regularOpeningHours?.weekdayDescriptions ?? null,
    rating: place.rating ?? null,
    reviewCount: place.userRatingCount ?? null,
  }
}
