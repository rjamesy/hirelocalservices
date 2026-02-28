/**
 * Google Places API (New) adapter
 *
 * Uses the Places API Text Search (New) endpoint.
 * Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
 */

import type { PlaceResult } from './types'

const API_BASE = 'https://places.googleapis.com/v1/places'
const DELAY_MS = 150 // ~6 req/s to stay well under limits

function getApiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY is not set')
  return key
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Search for places matching a text query near a location.
 * Returns up to 20 results per call (API maximum).
 */
export async function searchPlaces(
  query: string,
  lat: number,
  lng: number,
  radiusMeters: number = 25000
): Promise<PlaceResult[]> {
  const apiKey = getApiKey()

  const body = {
    textQuery: query,
    locationBias: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: radiusMeters,
      },
    },
    languageCode: 'en',
    regionCode: 'AU',
    maxResultCount: 20,
  }

  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.nationalPhoneNumber',
    'places.internationalPhoneNumber',
    'places.websiteUri',
    'places.googleMapsUri',
    'places.regularOpeningHours',
    'places.rating',
    'places.userRatingCount',
    'places.types',
    'places.location',
    'places.addressComponents',
  ].join(',')

  await delay(DELAY_MS)

  const resp = await fetch(`${API_BASE}:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Google Places API error ${resp.status}: ${text}`)
  }

  const data = await resp.json()
  return (data.places ?? []) as PlaceResult[]
}

/**
 * Convert a circle (center + radius) to a bounding box rectangle.
 * The Google Places Text Search API only supports locationRestriction
 * with a rectangle, not a circle.
 */
function circleToBoundingBox(lat: number, lng: number, radiusMeters: number) {
  const earthRadius = 6371000 // meters
  const dLat = (radiusMeters / earthRadius) * (180 / Math.PI)
  const dLng = (radiusMeters / (earthRadius * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI)
  return {
    low: { latitude: lat - dLat, longitude: lng - dLng },
    high: { latitude: lat + dLat, longitude: lng + dLng },
  }
}

/**
 * Search with locationRestriction (bounding box) instead of locationBias.
 * Results are strictly within the specified area.
 */
export async function searchPlacesRestricted(
  query: string,
  lat: number,
  lng: number,
  radiusMeters: number = 25000
): Promise<PlaceResult[]> {
  const apiKey = getApiKey()
  const rect = circleToBoundingBox(lat, lng, radiusMeters)

  const body = {
    textQuery: query,
    locationRestriction: {
      rectangle: rect,
    },
    languageCode: 'en',
    regionCode: 'AU',
    maxResultCount: 20,
  }

  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.nationalPhoneNumber',
    'places.internationalPhoneNumber',
    'places.websiteUri',
    'places.googleMapsUri',
    'places.regularOpeningHours',
    'places.rating',
    'places.userRatingCount',
    'places.types',
    'places.location',
    'places.addressComponents',
  ].join(',')

  await delay(DELAY_MS)

  const resp = await fetch(`${API_BASE}:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Google Places API error ${resp.status}: ${text}`)
  }

  const data = await resp.json()
  return (data.places ?? []) as PlaceResult[]
}

/**
 * Wrapper that tracks API call count for cost estimation.
 */
export async function searchPlacesTracked(
  query: string,
  lat: number,
  lng: number,
  radiusMeters: number,
  apiCallCounter: { count: number }
): Promise<PlaceResult[]> {
  apiCallCounter.count++
  return searchPlacesRestricted(query, lat, lng, radiusMeters)
}

/**
 * Get detailed information about a specific place.
 */
export async function getPlaceDetails(placeId: string): Promise<PlaceResult | null> {
  const apiKey = getApiKey()

  const fieldMask = [
    'id',
    'displayName',
    'formattedAddress',
    'nationalPhoneNumber',
    'internationalPhoneNumber',
    'websiteUri',
    'googleMapsUri',
    'regularOpeningHours',
    'rating',
    'userRatingCount',
    'types',
    'location',
    'addressComponents',
  ].join(',')

  await delay(DELAY_MS)

  const resp = await fetch(`${API_BASE}/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
  })

  if (!resp.ok) {
    if (resp.status === 404) return null
    const text = await resp.text()
    throw new Error(`Google Places API error ${resp.status}: ${text}`)
  }

  return (await resp.json()) as PlaceResult
}
