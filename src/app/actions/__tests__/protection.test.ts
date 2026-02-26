import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'
import { mockAdminUser } from '@/__tests__/helpers/test-data'

// Mock clients
const { client: mockSupabase, single, rpc } = createMockSupabaseClient()
const mockAdminSystemClient = {
  from: vi.fn(),
  rpc: vi.fn(),
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockAdminSystemClient),
}))

vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(),
}))

vi.mock('@/lib/protection', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    getSystemFlagsSafe: vi.fn(() =>
      Promise.resolve({
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
        created_at: '',
        updated_at: '',
      })
    ),
    updateSystemFlag: vi.fn(() => Promise.resolve({ success: true })),
    resetCircuitBreaker: vi.fn(),
    invalidateFlagsCache: vi.fn(),
  }
})

// Build chainable for admin client
function buildChainable(resolveValue: any = { data: null, error: null }) {
  const chain: any = {}
  const methods = ['select', 'insert', 'update', 'eq', 'order', 'limit', 'single', 'maybeSingle']
  for (const m of methods) {
    chain[m] = vi.fn(() => {
      if (m === 'single' || m === 'maybeSingle') return Promise.resolve(resolveValue)
      return chain
    })
  }
  chain.then = vi.fn((resolve: any) => resolve(resolveValue))
  return chain
}

import {
  getPublicProtectionFlags,
  getAdminProtectionData,
  updateProtectionFlag,
  activateKillSwitch,
  activateMaintenanceMode,
  adminResetCircuitBreaker,
} from '../protection'

describe('getPublicProtectionFlags', () => {
  it('returns safe subset of flags', async () => {
    const result = await getPublicProtectionFlags()
    expect(result).toHaveProperty('captcha_required')
    expect(result).toHaveProperty('maintenance_mode')
    expect(result).toHaveProperty('registrations_enabled')
    // Should NOT have admin-only fields
    expect(result).not.toHaveProperty('circuit_breaker_triggered_at')
  })
})

describe('getAdminProtectionData', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockAdminUser },
      error: null,
    })
    // Admin role check
    single.mockResolvedValueOnce({
      data: { role: 'admin' },
      error: null,
    })
    // Mock admin client calls
    mockAdminSystemClient.rpc.mockResolvedValue({ data: 0, error: null })
    mockAdminSystemClient.from.mockReturnValue(
      buildChainable({ data: [], error: null })
    )
  })

  it('returns flags, abuse counts, and recent events', async () => {
    const result = await getAdminProtectionData()
    expect(result).toHaveProperty('flags')
    expect(result).toHaveProperty('abuseCounts')
    expect(result).toHaveProperty('recentEvents')
  })
})

describe('updateProtectionFlag', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockAdminUser },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { role: 'admin' },
      error: null,
    })
  })

  it('updates flag with audit log', async () => {
    const result = await updateProtectionFlag('registrations_enabled', false)
    expect(result).toEqual({ success: true })
  })
})

describe('activateKillSwitch', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockAdminUser },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { role: 'admin' },
      error: null,
    })
  })

  it('returns success', async () => {
    const result = await activateKillSwitch()
    expect(result).toEqual({ success: true })
  })
})

describe('activateMaintenanceMode', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockAdminUser },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { role: 'admin' },
      error: null,
    })
  })

  it('returns success', async () => {
    const result = await activateMaintenanceMode('Maintenance in progress')
    expect(result).toEqual({ success: true })
  })
})

describe('adminResetCircuitBreaker', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockAdminUser },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { role: 'admin' },
      error: null,
    })
  })

  it('returns success', async () => {
    const result = await adminResetCircuitBreaker()
    expect(result).toEqual({ success: true })
  })
})
