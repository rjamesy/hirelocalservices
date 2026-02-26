import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/protection', () => ({
  logAbuseEvent: vi.fn(() => Promise.resolve()),
}))

import {
  registrationLimiter,
  loginLimiter,
  listingCreateLimiter,
  claimSubmitLimiter,
  checkRateLimit,
} from '../rate-limiter'

describe('rate limiters exist', () => {
  it('registrationLimiter is configured', () => {
    expect(registrationLimiter).toBeDefined()
  })

  it('loginLimiter is configured', () => {
    expect(loginLimiter).toBeDefined()
  })

  it('listingCreateLimiter is configured', () => {
    expect(listingCreateLimiter).toBeDefined()
  })

  it('claimSubmitLimiter is configured', () => {
    expect(claimSubmitLimiter).toBeDefined()
  })
})

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('passes when under limit', async () => {
    // registrationLimiter allows 5 per hour
    await expect(
      checkRateLimit(registrationLimiter, 'test-under-limit')
    ).resolves.toBeUndefined()
  })

  it('throws when over limit', async () => {
    // loginLimiter allows 20 per hour — consume all 20, then the 21st should fail
    const limiter = loginLimiter
    const key = 'test-over-limit-' + Date.now()

    // Consume all points
    for (let i = 0; i < 20; i++) {
      await limiter.consume(key)
    }

    await expect(
      checkRateLimit(limiter, key, 'rate_limit_violation')
    ).rejects.toThrow('Too many requests')
  })
})
