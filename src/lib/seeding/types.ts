/**
 * Types for the Google Places seeding pipeline
 */

export type PlaceResult = {
  id: string // Google Place ID
  displayName: { text: string; languageCode: string }
  formattedAddress: string
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  websiteUri?: string
  googleMapsUri?: string
  regularOpeningHours?: {
    openNow?: boolean
    weekdayDescriptions?: string[]
  }
  rating?: number
  userRatingCount?: number
  types?: string[]
  location: {
    latitude: number
    longitude: number
  }
  addressComponents?: Array<{
    longText: string
    shortText: string
    types: string[]
  }>
}

export type NormalizedBusiness = {
  name: string
  slug: string
  phone: string | null
  website: string | null
  description: string | null
  lat: number
  lng: number
  suburb: string | null
  state: string | null
  postcode: string | null
  streetAddress: string | null
  categorySlug: string
  googlePlaceId: string
  openingHours: string[] | null
  rating: number | null
  reviewCount: number | null
}

export type SeedResult = {
  id: string | null
  error: string | null
  skipped: boolean
  skipReason?: 'duplicate' | 'blacklisted' | 'low_confidence' | 'no_phone' | 'no_category'
}

export type SeedBatchStats = {
  total: number
  inserted: number
  duplicates: number
  blacklisted: number
  lowConfidence: number
  noPhone: number
  noCategory: number
  errors: number
}

export type CityRegion = {
  name: string
  state: string
  lat: number
  lng: number
  radius: number // meters
}

export type CategoryQuery = {
  slug: string
  name: string
  googleQuery: string
}
