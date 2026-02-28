/**
 * Maps Google Places API types to internal category slugs.
 *
 * Google returns types like "plumber", "electrician", "car_wash" etc.
 * We map these to our CATEGORY_QUERIES slugs for automatic categorisation.
 */

/** Google type → internal category slug(s) */
const TYPE_MAP: Record<string, string[]> = {
  // Cleaning
  'laundry': ['house-cleaning'],
  'dry_cleaning': ['house-cleaning'],

  // Home Maintenance
  'plumber': ['plumbing'],
  'electrician': ['electrical'],
  'painter': ['painting'],
  'roofing_contractor': ['roofing'],
  'general_contractor': ['handyman'],

  // Outdoor
  'landscaper': ['landscaping'],

  // Automotive
  'auto_repair': ['mobile-mechanic'],
  'car_repair': ['mobile-mechanic'],
  'car_wash': ['car-detailing'],
  'towing_service': ['towing'],

  // Moving & Delivery
  'moving_company': ['removalists'],
  'courier_service': ['courier'],

  // Pest Control
  'pest_control': ['general-pest-control'],

  // Pet Services
  'pet_store': ['pet-grooming'],
  'veterinary_care': ['pet-grooming'],
  'dog_park': ['dog-walking'],

  // Beauty & Wellness
  'hair_salon': ['mobile-hairdresser'],
  'hair_care': ['mobile-hairdresser'],
  'beauty_salon': ['mobile-beauty'],
  'spa': ['massage-therapist'],

  // IT & Tech
  'electronics_store': ['computer-repair', 'phone-repair'],
  'cell_phone_store': ['phone-repair'],

  // Events
  'photographer': ['photography'],
  'catering': ['catering'],
  'event_planner': ['party-hire'],

  // General services (lower confidence mapping)
  'locksmith': ['handyman'],
  'storage': ['removalists'],
  'furniture_store': ['furniture-assembly'],
}

/**
 * Map Google Place types to internal category slugs.
 * Returns unique slugs, preserving the source_category if provided.
 */
export function mapGoogleTypes(
  googleTypes: string[],
  sourceCategory?: string
): string[] {
  const slugs = new Set<string>()

  // Always include source category from extraction phase
  if (sourceCategory) {
    slugs.add(sourceCategory)
  }

  for (const gType of googleTypes) {
    const mapped = TYPE_MAP[gType]
    if (mapped) {
      for (const slug of mapped) slugs.add(slug)
    }
  }

  return Array.from(slugs)
}

/**
 * Check if any Google types are relevant to local services.
 * Used to filter out irrelevant places (e.g. restaurants, banks).
 */
export function hasRelevantGoogleType(googleTypes: string[]): boolean {
  return googleTypes.some((t) => t in TYPE_MAP)
}
