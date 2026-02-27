import { headers } from 'next/headers'

/**
 * Extract the client IP from the request headers.
 * Prioritises x-forwarded-for (set by reverse proxies like Vercel),
 * then x-real-ip, with a fallback to 'unknown'.
 */
export async function getClientIp(): Promise<string> {
  const headersList = await headers()

  // x-forwarded-for may contain a comma-separated list; take the first IP
  const forwarded = headersList.get('x-forwarded-for')
  if (forwarded) {
    const firstIp = forwarded.split(',')[0]?.trim()
    if (firstIp) return firstIp
  }

  const realIp = headersList.get('x-real-ip')
  if (realIp) return realIp

  return 'unknown'
}
