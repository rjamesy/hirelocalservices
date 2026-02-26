import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'
import { mockUser } from '@/__tests__/helpers/test-data'

const { client: mockSupabase, single, maybeSingle, chainResult } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/app/actions/notifications', () => ({
  createNotification: vi.fn(),
}))

// Mock protection module
const mockGetSystemFlagsSafe = vi.fn()
const mockRequireEmailVerified = vi.fn()
const mockVerifyCaptcha = vi.fn()
const mockLogAbuseEvent = vi.fn()

vi.mock('@/lib/protection', () => ({
  getSystemFlagsSafe: (...args: any[]) => mockGetSystemFlagsSafe(...args),
  requireEmailVerified: (...args: any[]) => mockRequireEmailVerified(...args),
  verifyCaptcha: (...args: any[]) => mockVerifyCaptcha(...args),
  logAbuseEvent: (...args: any[]) => mockLogAbuseEvent(...args),
}))

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn(),
  claimSubmitLimiter: {},
}))

import { claimBusiness } from '../claims'

describe('claimBusiness protection guards', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    mockGetSystemFlagsSafe.mockResolvedValue({
      claims_enabled: true,
      registrations_enabled: true,
      listings_enabled: true,
      payments_enabled: true,
      maintenance_mode: false,
      captcha_required: false,
      listings_require_approval: false,
    })
    mockRequireEmailVerified.mockImplementation(() => {})
    mockVerifyCaptcha.mockResolvedValue({ success: true })
  })

  it('blocks when claims_enabled is false', async () => {
    mockGetSystemFlagsSafe.mockResolvedValue({
      claims_enabled: false,
      captcha_required: false,
    })

    const result = await claimBusiness('biz-123', {
      businessName: 'Test',
    })
    expect(result).toHaveProperty('error')
    expect((result as any).error).toContain('disabled')
  })

  it('blocks when email is unverified', async () => {
    mockRequireEmailVerified.mockImplementation(() => {
      throw new Error('Please verify your email')
    })

    const result = await claimBusiness('biz-123', {
      businessName: 'Test',
    })
    expect(result).toHaveProperty('error')
    expect((result as any).error).toContain('verify your email')
  })

  it('blocks when captcha required but no token provided', async () => {
    mockGetSystemFlagsSafe.mockResolvedValue({
      claims_enabled: true,
      captcha_required: true,
    })

    const result = await claimBusiness('biz-123', {
      businessName: 'Test',
    })
    expect(result).toHaveProperty('error')
    expect((result as any).error).toContain('captcha')
  })

  it('blocks when captcha verification fails', async () => {
    mockGetSystemFlagsSafe.mockResolvedValue({
      claims_enabled: true,
      captcha_required: true,
    })
    mockVerifyCaptcha.mockResolvedValue({ success: false })

    const result = await claimBusiness('biz-123', {
      businessName: 'Test',
      captchaToken: 'invalid-token',
    })
    expect(result).toHaveProperty('error')
    expect((result as any).error).toContain('Captcha verification failed')
  })
})
