/**
 * Convert a string to a URL-safe slug.
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')       // Replace spaces with hyphens
    .replace(/[^\w-]+/g, '')    // Remove non-word characters (except hyphens)
    .replace(/--+/g, '-')       // Replace multiple hyphens with single
    .replace(/^-+/, '')         // Trim leading hyphens
    .replace(/-+$/, '')         // Trim trailing hyphens
}

/**
 * Format a distance in meters to a human-readable string in km.
 */
export function formatDistance(meters: number): string {
  const km = meters / 1000
  if (km < 1) {
    return `${Math.round(meters)} m`
  }
  return `${km.toFixed(1)} km`
}

/**
 * Calculate the average rating from an array of testimonials.
 * Returns 0 if the array is empty. Rounded to 1 decimal place.
 */
export function getAverageRating(testimonials: { rating: number }[]): number {
  if (testimonials.length === 0) return 0
  const sum = testimonials.reduce((acc, t) => acc + t.rating, 0)
  return Math.round((sum / testimonials.length) * 10) / 10
}

/**
 * Truncate a string to a given length, appending an ellipsis if truncated.
 */
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text
  return text.slice(0, length).trimEnd() + '...'
}

/**
 * Format an Australian phone number for display.
 * Attempts to format as: 04XX XXX XXX (mobile) or (0X) XXXX XXXX (landline).
 */
export function formatPhone(phone: string): string {
  // Strip all non-digit characters
  const digits = phone.replace(/\D/g, '')

  // Handle +61 prefix
  const normalized = digits.startsWith('61') ? '0' + digits.slice(2) : digits

  // Mobile: 04XX XXX XXX
  if (normalized.startsWith('04') && normalized.length === 10) {
    return `${normalized.slice(0, 4)} ${normalized.slice(4, 7)} ${normalized.slice(7)}`
  }

  // Landline: (0X) XXXX XXXX
  if (normalized.startsWith('0') && normalized.length === 10) {
    return `(${normalized.slice(0, 2)}) ${normalized.slice(2, 6)} ${normalized.slice(6)}`
  }

  // Fallback: return as-is
  return phone
}

/**
 * Classnames helper. Filters out falsy values and joins with a space.
 */
export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

/**
 * Get the base URL for the application.
 * Uses NEXT_PUBLIC_APP_URL if set, otherwise defaults to localhost:3000.
 */
export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  return 'http://localhost:3000'
}
