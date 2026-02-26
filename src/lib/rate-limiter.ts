import { RateLimiterMemory } from 'rate-limiter-flexible'
import { logAbuseEvent } from '@/lib/protection'
import type { AbuseEventType } from '@/lib/types'

export const registrationLimiter = new RateLimiterMemory({
  points: 5,
  duration: 3600,
})

export const loginLimiter = new RateLimiterMemory({
  points: 20,
  duration: 3600,
})

export const listingCreateLimiter = new RateLimiterMemory({
  points: 10,
  duration: 3600,
})

export const claimSubmitLimiter = new RateLimiterMemory({
  points: 5,
  duration: 3600,
})

/**
 * Check rate limit. Throws if exceeded.
 * key = IP address for unauthenticated, user ID for authenticated.
 */
export async function checkRateLimit(
  limiter: RateLimiterMemory,
  key: string,
  eventType?: AbuseEventType
): Promise<void> {
  try {
    await limiter.consume(key)
  } catch {
    if (eventType) {
      // Fire-and-forget abuse event logging
      logAbuseEvent('rate_limit_violation', null, null, {
        limiter_key: key,
        original_event_type: eventType,
      }).catch(() => {})
    }
    throw new Error('Too many requests. Please try again later.')
  }
}
