/**
 * Extract Supabase storage path from a photo URL.
 * The URL pattern from Supabase Storage is:
 * https://<project>.supabase.co/storage/v1/object/public/photos/<path>
 */
export function extractStoragePath(url: string): string | null {
  try {
    const urlObj = new URL(url)
    const pathSegments = urlObj.pathname.split('/storage/v1/object/public/photos/')
    if (pathSegments.length === 2 && pathSegments[1]) {
      return decodeURIComponent(pathSegments[1])
    }
  } catch {
    // URL parsing failed
  }
  return null
}
