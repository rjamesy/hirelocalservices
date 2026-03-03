/**
 * tests/auth-blacklist.test.ts
 *
 * Tests for email blacklist check at signup and suspended account dashboard gate.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock rate limiter
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn(),
  registrationLimiter: {},
  loginLimiter: {},
}))

// Mock IP
vi.mock('@/lib/ip', () => ({
  getClientIp: vi.fn(() => Promise.resolve('127.0.0.1')),
}))

// Mock protection
vi.mock('@/lib/protection', () => ({
  getSystemFlagsSafe: vi.fn(() =>
    Promise.resolve({
      registrations_enabled: true,
      captcha_required: false,
      maintenance_mode: false,
      soft_launch_mode: false,
    })
  ),
  verifyCaptcha: vi.fn(() => Promise.resolve({ success: true })),
  logAbuseEvent: vi.fn(),
}))

// Mock admin Supabase client
const mockAdminRpc = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    rpc: mockAdminRpc,
  })),
}))

describe('Email Blacklist at Signup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('should block registration with blacklisted email', async () => {
    mockAdminRpc.mockResolvedValue({
      data: [{ is_blocked: true, matched_term: 'baduser@test.com', reason: 'Account self-deleted' }],
      error: null,
    })

    const { checkRegistrationAllowed } = await import('@/app/actions/auth')
    const result = await checkRegistrationAllowed('baduser@test.com')

    expect(result.allowed).toBe(false)
    expect(result.error).toBe('This email address cannot be used for registration.')
    expect(mockAdminRpc).toHaveBeenCalledWith('is_blacklisted', {
      p_value: 'baduser@test.com',
      p_field_type: 'email',
    })
  })

  it('should allow registration with non-blacklisted email', async () => {
    mockAdminRpc.mockResolvedValue({
      data: [{ is_blocked: false, matched_term: null, reason: null }],
      error: null,
    })

    const { checkRegistrationAllowed } = await import('@/app/actions/auth')
    const result = await checkRegistrationAllowed('gooduser@test.com')

    expect(result.allowed).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('should normalize email to lowercase before checking blacklist', async () => {
    mockAdminRpc.mockResolvedValue({
      data: [{ is_blocked: false, matched_term: null, reason: null }],
      error: null,
    })

    const { checkRegistrationAllowed } = await import('@/app/actions/auth')
    await checkRegistrationAllowed('User@EXAMPLE.com')

    expect(mockAdminRpc).toHaveBeenCalledWith('is_blacklisted', {
      p_value: 'user@example.com',
      p_field_type: 'email',
    })
  })

  it('should fail open if blacklist RPC throws', async () => {
    mockAdminRpc.mockRejectedValue(new Error('DB connection error'))

    const { checkRegistrationAllowed } = await import('@/app/actions/auth')
    const result = await checkRegistrationAllowed('user@test.com')

    expect(result.allowed).toBe(true)
  })

  it('should fail open if blacklist RPC returns error in data', async () => {
    mockAdminRpc.mockResolvedValue({
      data: null,
      error: { message: 'function not found' },
    })

    const { checkRegistrationAllowed } = await import('@/app/actions/auth')
    const result = await checkRegistrationAllowed('user@test.com')

    expect(result.allowed).toBe(true)
  })

  it('should allow registration when no email provided', async () => {
    const { checkRegistrationAllowed } = await import('@/app/actions/auth')
    const result = await checkRegistrationAllowed()

    expect(result.allowed).toBe(true)
    expect(mockAdminRpc).not.toHaveBeenCalled()
  })

  it('should block when registrations are disabled', async () => {
    const { getSystemFlagsSafe } = await import('@/lib/protection')
    vi.mocked(getSystemFlagsSafe).mockResolvedValueOnce({
      registrations_enabled: false,
      captcha_required: false,
      maintenance_mode: false,
      soft_launch_mode: false,
      listings_enabled: true,
      payments_enabled: true,
      claims_enabled: true,
      listings_require_approval: true,
    })

    const { checkRegistrationAllowed } = await import('@/app/actions/auth')
    const result = await checkRegistrationAllowed('user@test.com')

    expect(result.allowed).toBe(false)
    expect(result.error).toContain('disabled')
  })
})
