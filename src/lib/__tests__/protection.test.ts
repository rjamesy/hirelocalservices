import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock createAdminClient
const mockAdminClient = {
  from: vi.fn(),
  rpc: vi.fn(),
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockAdminClient),
}))

vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(),
}))

vi.mock('@/app/actions/alerts', () => ({
  createSystemAlert: vi.fn(() => Promise.resolve({ id: 'alert-1', error: null })),
}))

// Build a chainable mock for Supabase queries
function buildChainable(resolveValue: any = { data: null, error: null }) {
  const chain: any = {}
  const methods = ['select', 'insert', 'update', 'eq', 'order', 'limit', 'single', 'maybeSingle']
  for (const m of methods) {
    chain[m] = vi.fn(() => {
      if (m === 'single' || m === 'maybeSingle') {
        return Promise.resolve(resolveValue)
      }
      return chain
    })
  }
  chain.then = vi.fn((resolve: any) => resolve(resolveValue))
  return chain
}

import {
  getSystemFlags,
  getSystemFlagsSafe,
  updateSystemFlag,
  verifyCaptcha,
  requireEmailVerified,
  invalidateFlagsCache,
  logPaymentEvent,
} from '../protection'

describe('getSystemFlags', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    invalidateFlagsCache()
  })

  it('returns flags from database', async () => {
    const mockFlags = {
      id: 1,
      registrations_enabled: true,
      listings_enabled: true,
      payments_enabled: true,
      claims_enabled: true,
      maintenance_mode: false,
      maintenance_message: '',
      captcha_required: false,
      listings_require_approval: false,
      circuit_breaker_triggered_at: null,
      circuit_breaker_cooldown_minutes: 15,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    }

    mockAdminClient.from.mockReturnValue(
      buildChainable({ data: mockFlags, error: null })
    )

    const result = await getSystemFlags()
    expect(result).toEqual(mockFlags)
    expect(mockAdminClient.from).toHaveBeenCalledWith('system_flags')
  })

  it('uses cached value on second call', async () => {
    const mockFlags = {
      id: 1,
      registrations_enabled: true,
      listings_enabled: true,
      payments_enabled: true,
      claims_enabled: true,
      maintenance_mode: false,
      maintenance_message: '',
      captcha_required: false,
      listings_require_approval: false,
      circuit_breaker_triggered_at: null,
      circuit_breaker_cooldown_minutes: 15,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    }

    mockAdminClient.from.mockReturnValue(
      buildChainable({ data: mockFlags, error: null })
    )

    await getSystemFlags()
    await getSystemFlags()

    // Only called once because second call uses cache
    expect(mockAdminClient.from).toHaveBeenCalledTimes(1)
  })

  it('throws on DB error', async () => {
    mockAdminClient.from.mockReturnValue(
      buildChainable({ data: null, error: { message: 'DB down' } })
    )

    await expect(getSystemFlags()).rejects.toThrow('Failed to load system flags')
  })
})

describe('getSystemFlagsSafe', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    invalidateFlagsCache()
  })

  it('returns safe defaults on error', async () => {
    mockAdminClient.from.mockReturnValue(
      buildChainable({ data: null, error: { message: 'DB down' } })
    )

    const result = await getSystemFlagsSafe()
    expect(result.registrations_enabled).toBe(true)
    expect(result.listings_enabled).toBe(true)
    expect(result.maintenance_mode).toBe(false)
  })

  it('forces listings_require_approval when soft_launch_mode is true', async () => {
    const mockFlags = {
      id: 1,
      registrations_enabled: true,
      listings_enabled: true,
      payments_enabled: true,
      claims_enabled: true,
      maintenance_mode: false,
      maintenance_message: '',
      captcha_required: false,
      listings_require_approval: false,
      soft_launch_mode: true,
      circuit_breaker_triggered_at: null,
      circuit_breaker_cooldown_minutes: 15,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    }

    mockAdminClient.from.mockReturnValue(
      buildChainable({ data: mockFlags, error: null })
    )

    const result = await getSystemFlagsSafe()
    expect(result.soft_launch_mode).toBe(true)
    expect(result.listings_require_approval).toBe(true)
  })
})

describe('updateSystemFlag', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    invalidateFlagsCache()
  })

  it('updates flag and invalidates cache', async () => {
    mockAdminClient.from.mockReturnValue(
      buildChainable({ data: null, error: null })
    )

    const result = await updateSystemFlag('registrations_enabled', false)
    expect(result.success).toBe(true)
  })

  it('returns error on failure', async () => {
    mockAdminClient.from.mockReturnValue(
      buildChainable({ data: null, error: { message: 'update failed' } })
    )

    const result = await updateSystemFlag('registrations_enabled', false)
    expect(result.success).toBe(false)
    expect(result.error).toBe('update failed')
  })
})

describe('verifyCaptcha', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetAllMocks()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns success when no secret key configured', async () => {
    delete process.env.TURNSTILE_SECRET_KEY
    const result = await verifyCaptcha('token123')
    expect(result.success).toBe(true)
  })

  it('returns success on valid captcha', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret'

    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    }) as any

    const result = await verifyCaptcha('valid-token')
    expect(result.success).toBe(true)
  })

  it('returns failure on invalid captcha', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret'

    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: false }),
    }) as any

    const result = await verifyCaptcha('invalid-token')
    expect(result.success).toBe(false)
  })
})

describe('requireEmailVerified', () => {
  it('does nothing for verified user', () => {
    expect(() => requireEmailVerified({ email_confirmed_at: '2024-01-01T00:00:00Z' })).not.toThrow()
  })

  it('throws for unverified user', () => {
    expect(() => requireEmailVerified({ email_confirmed_at: null })).toThrow('verify your email')
  })

  it('throws for undefined email_confirmed_at', () => {
    expect(() => requireEmailVerified({})).toThrow('verify your email')
  })
})

describe('logPaymentEvent', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('inserts payment event into database', async () => {
    mockAdminClient.from.mockReturnValue(
      buildChainable({ data: null, error: null })
    )

    await logPaymentEvent('user-1', 'cus_123', 'sub_123', 'checkout.session.completed', { plan: 'basic' })
    expect(mockAdminClient.from).toHaveBeenCalledWith('payment_events')
  })

  it('does not throw on error', async () => {
    mockAdminClient.from.mockImplementation(() => {
      throw new Error('DB error')
    })

    // Should not throw
    await logPaymentEvent('user-1', null, null, 'test_event')
  })
})
