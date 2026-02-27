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

import { evaluateSearchEligibility, getListingEligibility } from '../eligibility'

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
    passed: val!.passed,
    detail: val!.detail,
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

// ─── getListingEligibility ──────────────────────────────────────────

function createEligibilitySupabase(opts: {
  business?: {
    status: string
    verification_status: string
    billing_status: string
    deleted_at: string | null
    owner_id: string | null
    is_seed: boolean
  } | null
  error?: any
} = {}) {
  const { business, error = null } = opts
  return {
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: business ?? null, error: error ?? (business ? null : { message: 'Not found' }) })),
        })),
      })),
    })),
  }
}

const publishedBusiness = {
  status: 'published',
  verification_status: 'approved',
  billing_status: 'active',
  deleted_at: null,
  owner_id: 'user-1',
  is_seed: false,
}

describe('getListingEligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserEntitlements.mockResolvedValue({
      isActive: true,
      plan: 'premium',
      reasonCodes: [],
    })
  })

  it('returns all-false for non-existent business', async () => {
    const supabase = createEligibilitySupabase({ business: null })
    const result = await getListingEligibility(supabase, 'nonexistent')

    expect(result.visiblePublic).toBe(false)
    expect(result.visibleInSearch).toBe(false)
    expect(result.blockedReasons).toContain('business_not_found')
  })

  it('returns visible for published+approved+active business', async () => {
    const supabase = createEligibilitySupabase({ business: publishedBusiness })
    const result = await getListingEligibility(supabase, 'biz-1')

    expect(result.visiblePublic).toBe(true)
    expect(result.visibleInSearch).toBe(true)
    expect(result.blockedReasons).toHaveLength(0)
    expect(result.checks.statusOk).toBe(true)
    expect(result.checks.verificationOk).toBe(true)
    expect(result.checks.billingOk).toBe(true)
    expect(result.checks.notDeleted).toBe(true)
    expect(result.checks.notSuspended).toBe(true)
  })

  it('returns not visible for draft business', async () => {
    const supabase = createEligibilitySupabase({
      business: { ...publishedBusiness, status: 'draft' },
    })
    const result = await getListingEligibility(supabase, 'biz-1')

    expect(result.visiblePublic).toBe(false)
    expect(result.checks.statusOk).toBe(false)
    expect(result.blockedReasons).toContain("status is 'draft', expected 'published'")
  })

  it('returns not visible for suspended business', async () => {
    const supabase = createEligibilitySupabase({
      business: { ...publishedBusiness, status: 'suspended' },
    })
    const result = await getListingEligibility(supabase, 'biz-1')

    expect(result.visiblePublic).toBe(false)
    expect(result.checks.statusOk).toBe(false)
    expect(result.checks.notSuspended).toBe(false)
  })

  it('returns not visible for pending verification', async () => {
    const supabase = createEligibilitySupabase({
      business: { ...publishedBusiness, verification_status: 'pending' },
    })
    const result = await getListingEligibility(supabase, 'biz-1')

    expect(result.visiblePublic).toBe(false)
    expect(result.checks.verificationOk).toBe(false)
  })

  it('returns not visible for billing_suspended', async () => {
    const supabase = createEligibilitySupabase({
      business: { ...publishedBusiness, billing_status: 'billing_suspended' },
    })
    const result = await getListingEligibility(supabase, 'biz-1')

    expect(result.visiblePublic).toBe(false)
    expect(result.checks.billingOk).toBe(false)
  })

  it('treats trial billing_status as OK', async () => {
    const supabase = createEligibilitySupabase({
      business: { ...publishedBusiness, billing_status: 'trial' },
    })
    const result = await getListingEligibility(supabase, 'biz-1')

    expect(result.visiblePublic).toBe(true)
    expect(result.checks.billingOk).toBe(true)
  })

  it('returns not visible for deleted business', async () => {
    const supabase = createEligibilitySupabase({
      business: { ...publishedBusiness, deleted_at: '2024-01-01T00:00:00Z' },
    })
    const result = await getListingEligibility(supabase, 'biz-1')

    expect(result.visiblePublic).toBe(false)
    expect(result.checks.notDeleted).toBe(false)
  })

  it('skips owner check for seed businesses', async () => {
    const supabase = createEligibilitySupabase({
      business: { ...publishedBusiness, is_seed: true, owner_id: null },
    })
    const result = await getListingEligibility(supabase, 'biz-1')

    expect(result.visiblePublic).toBe(true)
    expect(result.checks.ownerActive).toBe(true)
    expect(result.checks.ownerPlan).toBeNull()
    expect(mockGetUserEntitlements).not.toHaveBeenCalled()
  })

  it('returns visiblePublic but not visibleInSearch when owner inactive', async () => {
    mockGetUserEntitlements.mockResolvedValue({
      isActive: false,
      plan: null,
      reasonCodes: ['no_subscription'],
    })

    const supabase = createEligibilitySupabase({ business: publishedBusiness })
    const result = await getListingEligibility(supabase, 'biz-1')

    expect(result.visiblePublic).toBe(true)
    expect(result.visibleInSearch).toBe(false)
    expect(result.checks.ownerActive).toBe(false)
    expect(result.blockedReasons).toContain('owner subscription inactive (plan: none)')
  })
})
