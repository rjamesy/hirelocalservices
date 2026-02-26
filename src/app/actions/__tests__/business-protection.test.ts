import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'
import { mockUser, mockBusiness } from '@/__tests__/helpers/test-data'

const { client: mockSupabase, single, maybeSingle, chainResult } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('@/app/actions/system-settings', () => ({
  getSettingValue: vi.fn(() => Promise.resolve(10)),
}))

// Mock protection module
const mockGetSystemFlagsSafe = vi.fn()
const mockRequireEmailVerified = vi.fn()

vi.mock('@/lib/protection', () => ({
  getSystemFlagsSafe: (...args: any[]) => mockGetSystemFlagsSafe(...args),
  requireEmailVerified: (...args: any[]) => mockRequireEmailVerified(...args),
}))

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn(),
  listingCreateLimiter: {},
}))

import { createBusinessDraft } from '../business'

function makeFormData(data: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(data)) {
    fd.set(key, value)
  }
  return fd
}

const validFormData = {
  name: 'Test Business',
  description: 'A valid description for testing purposes.',
  phone: '', email_contact: '', website: '', abn: '',
}

describe('createBusinessDraft protection guards', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    mockGetSystemFlagsSafe.mockResolvedValue({
      listings_enabled: true,
      registrations_enabled: true,
      claims_enabled: true,
      payments_enabled: true,
      maintenance_mode: false,
      captcha_required: false,
      listings_require_approval: false,
    })
    mockRequireEmailVerified.mockImplementation(() => {})
  })

  it('blocks when listings_enabled is false', async () => {
    mockGetSystemFlagsSafe.mockResolvedValue({
      listings_enabled: false,
    })

    const fd = makeFormData(validFormData)
    const result = await createBusinessDraft(fd)
    expect(result).toHaveProperty('error')
    expect((result as any).error).toContain('disabled')
  })

  it('blocks when email is unverified', async () => {
    mockRequireEmailVerified.mockImplementation(() => {
      throw new Error('Please verify your email')
    })

    const fd = makeFormData(validFormData)
    const result = await createBusinessDraft(fd)
    expect(result).toHaveProperty('error')
    expect((result as any).error).toContain('verify your email')
  })

  it('allows when all guards pass', async () => {
    // getUserListingCapacity: count=0
    chainResult.mockReturnValueOnce({ count: 0, error: null })
    // getUserListingCapacity: no subscription
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // slug check
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // insert
    single.mockResolvedValueOnce({ data: mockBusiness, error: null })

    const fd = makeFormData(validFormData)
    const result = await createBusinessDraft(fd)
    expect(result).toHaveProperty('data')
  })
})
