import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock entitlements
const mockGetUserEntitlements = vi.fn()
vi.mock('@/lib/entitlements', () => ({
  getUserEntitlements: (...args: unknown[]) => mockGetUserEntitlements(...args),
}))

// Mock system-settings (transitive dependency)
vi.mock('@/app/actions/system-settings', () => ({
  getSettingValue: vi.fn((_key: string, fallback: number) => Promise.resolve(fallback)),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({})),
}))

import { evaluateSearchEligibility } from '../eligibility'

function makeRpcChecks(overrides: Partial<Record<string, { passed: boolean; detail: string }>> = {}) {
  const defaults: Record<string, { passed: boolean; detail: string }> = {
    business_exists: { passed: true, detail: 'Business found' },
    verification_approved: { passed: true, detail: 'verification_status = approved' },
    not_suspended_or_paused: { passed: true, detail: 'status = published' },
    billing_ok: { passed: true, detail: 'billing_status = active' },
    has_contact: { passed: true, detail: 'has_contact = true' },
    is_claimed: { passed: true, detail: 'claim_status = claimed' },
  }

  const merged = { ...defaults, ...overrides }
  return Object.entries(merged).map(([check_name, val]) => ({
    check_name,
    passed: val.passed,
    detail: val.detail,
  }))
}

function createMockSupabase(opts: {
  rpcResult?: any[]
  rpcError?: any
  business?: { owner_id: string | null; is_seed: boolean } | null
} = {}) {
  const { rpcResult = makeRpcChecks(), rpcError = null, business = { owner_id: 'user-1', is_seed: false } } = opts

  return {
    rpc: vi.fn(() => Promise.resolve({ data: rpcResult, error: rpcError })),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: business, error: null })),
        })),
      })),
    })),
  }
}

describe('evaluateSearchEligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserEntitlements.mockResolvedValue({
      isActive: true,
      plan: 'premium',
      reasonCodes: [],
    })
  })

  it('returns eligible when all checks pass', async () => {
    const supabase = createMockSupabase()
    const result = await evaluateSearchEligibility(supabase, 'biz-1')

    expect(result.eligible).toBe(true)
    expect(result.failedChecks).toHaveLength(0)
    expect(result.checks.length).toBeGreaterThan(0)
  })

  it('returns ineligible when has_contact fails', async () => {
    const supabase = createMockSupabase({
      rpcResult: makeRpcChecks({
        has_contact: { passed: false, detail: 'has_contact = false' },
      }),
    })
    const result = await evaluateSearchEligibility(supabase, 'biz-1')

    expect(result.eligible).toBe(false)
    expect(result.failedChecks).toHaveLength(1)
    expect(result.failedChecks[0].checkName).toBe('has_contact')
  })

  it('returns ineligible when owner subscription is canceled', async () => {
    mockGetUserEntitlements.mockResolvedValue({
      isActive: false,
      plan: 'basic',
      reasonCodes: ['subscription_canceled'],
    })

    const supabase = createMockSupabase()
    const result = await evaluateSearchEligibility(supabase, 'biz-1')

    expect(result.eligible).toBe(false)
    const ownerCheck = result.failedChecks.find((c) => c.checkName === 'owner_subscription_active')
    expect(ownerCheck).toBeDefined()
    expect(ownerCheck!.passed).toBe(false)
  })

  it('handles RPC error gracefully', async () => {
    const supabase = createMockSupabase({
      rpcError: { message: 'RPC failed' },
      rpcResult: null as any,
    })
    const result = await evaluateSearchEligibility(supabase, 'biz-1')

    expect(result.eligible).toBe(false)
    expect(result.failedChecks[0].checkName).toBe('rpc_error')
  })

  it('skips owner entitlements check for seed businesses', async () => {
    const supabase = createMockSupabase({
      business: { owner_id: null, is_seed: true },
    })
    const result = await evaluateSearchEligibility(supabase, 'biz-1')

    expect(result.eligible).toBe(true)
    expect(mockGetUserEntitlements).not.toHaveBeenCalled()
  })
})
