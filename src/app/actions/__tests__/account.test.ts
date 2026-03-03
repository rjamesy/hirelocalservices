import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'
import { mockUser, mockBusiness } from '@/__tests__/helpers/test-data'

// Mock createClient
const { client: mockSupabase, single, maybeSingle, chainResult, rpc } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Mock Stripe — use vi.hoisted since vi.mock is hoisted above variable declarations
const mockStripeCancel = vi.hoisted(() => vi.fn(() => Promise.resolve({ id: 'sub_test' })))
vi.mock('@/lib/stripe', () => ({
  stripe: {
    subscriptions: {
      cancel: mockStripeCancel,
    },
  },
}))

// Import after mocks
import { changePassword, requestPasswordReset, deleteMyAccount } from '../account'

describe('changePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
  })

  it('rejects passwords shorter than 8 characters', async () => {
    const result = await changePassword('short')
    expect(result.error).toBe('Password must be at least 8 characters.')
  })

  it('rejects empty password', async () => {
    const result = await changePassword('')
    expect(result.error).toBe('Password must be at least 8 characters.')
  })

  it('returns error when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    })
    const result = await changePassword('validpassword123')
    expect(result.error).toBe('Not authenticated.')
  })

  it('successfully changes password', async () => {
    mockSupabase.auth.updateUser = vi.fn(() =>
      Promise.resolve({ data: { user: mockUser }, error: null })
    )
    const result = await changePassword('newSecurePassword123')
    expect(result.success).toBe(true)
    expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newSecurePassword123' })
  })

  it('returns Supabase error on failure', async () => {
    mockSupabase.auth.updateUser = vi.fn(() =>
      Promise.resolve({ data: { user: null }, error: { message: 'Password too weak' } })
    )
    const result = await changePassword('weakpass1')
    expect(result.error).toBe('Password too weak')
  })
})

describe('requestPasswordReset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects invalid email', async () => {
    const result = await requestPasswordReset('notanemail')
    expect(result.error).toBe('Please enter a valid email address.')
  })

  it('rejects empty email', async () => {
    const result = await requestPasswordReset('')
    expect(result.error).toBe('Please enter a valid email address.')
  })

  it('sends reset email successfully', async () => {
    mockSupabase.auth.resetPasswordForEmail = vi.fn(() =>
      Promise.resolve({ data: {}, error: null })
    )
    const result = await requestPasswordReset('test@example.com')
    expect(result.success).toBe(true)
    expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'test@example.com',
      expect.objectContaining({ redirectTo: expect.stringContaining('/reset-password') })
    )
  })

  it('returns Supabase error on failure', async () => {
    mockSupabase.auth.resetPasswordForEmail = vi.fn(() =>
      Promise.resolve({ data: null, error: { message: 'Rate limit exceeded' } })
    )
    const result = await requestPasswordReset('test@example.com')
    expect(result.error).toBe('Rate limit exceeded')
  })
})

describe('deleteMyAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
  })

  it('returns error when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    })
    const result = await deleteMyAccount()
    expect(result.error).toBe('Not authenticated.')
  })

  it('cancels Stripe subscription if exists', async () => {
    // Setup: user has subscription
    maybeSingle.mockResolvedValueOnce({
      data: { stripe_subscription_id: 'sub_test123', stripe_customer_id: 'cus_test' },
      error: null,
    })

    // No businesses
    chainResult.mockReturnValueOnce({ data: [], error: null })
    // Profile update
    chainResult.mockReturnValueOnce({ data: null, error: null })

    rpc.mockResolvedValue({ data: null, error: null })

    const result = await deleteMyAccount()
    expect(result.success).toBe(true)
    expect(mockStripeCancel).toHaveBeenCalledWith('sub_test123')
  })

  it('continues if Stripe cancellation fails', async () => {
    // Subscription exists but cancel throws
    maybeSingle.mockResolvedValueOnce({
      data: { stripe_subscription_id: 'sub_fail', stripe_customer_id: 'cus_test' },
      error: null,
    })
    mockStripeCancel.mockRejectedValueOnce(new Error('Stripe error'))

    // No businesses
    chainResult.mockReturnValueOnce({ data: [], error: null })
    // Profile update
    chainResult.mockReturnValueOnce({ data: null, error: null })

    rpc.mockResolvedValue({ data: null, error: null })

    const result = await deleteMyAccount()
    expect(result.success).toBe(true)
  })

  it('soft-deletes businesses and hard-deletes working listings', async () => {
    // No subscription
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    // User has businesses
    const bizData = [
      {
        id: 'biz-1',
        name: 'My Biz',
        slug: 'my-biz',
        status: 'published',
        phone: '0412345678',
        email_contact: 'biz@test.com',
        website: 'https://www.mybiz.com.au',
        abn: '12 345 678 901',
      },
    ]
    chainResult.mockReturnValueOnce({ data: bizData, error: null })

    // Business update (soft-delete), working listings delete, profile update
    chainResult.mockReturnValue({ data: null, error: null })
    // RPCs: refresh_search_index, blacklist_on_delete, insert_audit_log
    rpc.mockResolvedValue({ data: null, error: null })

    const result = await deleteMyAccount()
    expect(result.success).toBe(true)
    expect(mockSupabase.auth.signOut).toHaveBeenCalled()
  })

  it('blacklists normalized identifiers via RPC', async () => {
    // No subscription
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    // Business with various identifiers
    const bizData = [
      {
        id: 'biz-1',
        name: 'Test',
        slug: 'test',
        status: 'draft',
        phone: '(04) 1234-5678',
        email_contact: null,
        website: 'https://www.mybiz.com.au/',
        abn: '12 345 678 901',
      },
    ]
    chainResult.mockReturnValueOnce({ data: bizData, error: null })

    // Business update, search index, working listings
    chainResult.mockReturnValue({ data: null, error: null })
    rpc.mockResolvedValue({ data: null, error: null })

    const result = await deleteMyAccount()
    expect(result.success).toBe(true)

    // Verify blacklist_on_delete RPC was called with identifiers
    const rpcCalls = rpc.mock.calls
    const blacklistRpc = rpcCalls.find((c: any[]) => c[0] === 'blacklist_on_delete')
    expect(blacklistRpc).toBeTruthy()
    const identifiers = blacklistRpc![1].p_identifiers
    // email + phone + website + abn = 4 identifiers
    expect(identifiers.length).toBeGreaterThanOrEqual(4)
    // Verify normalization: phone stripped of non-digits, website lowercased
    const phoneTerm = identifiers.find((i: any) => i.field_type === 'phone')
    expect(phoneTerm?.term).toBe('0412345678')
    const websiteTerm = identifiers.find((i: any) => i.field_type === 'website')
    expect(websiteTerm?.term).toBe('mybiz.com.au')
    const abnTerm = identifiers.find((i: any) => i.field_type === 'abn')
    expect(abnTerm?.term).toBe('12345678901')
  })

  it('signs out user after deletion', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    chainResult.mockReturnValueOnce({ data: [], error: null })
    chainResult.mockReturnValue({ data: null, error: null })
    rpc.mockResolvedValue({ data: null, error: null })

    await deleteMyAccount()
    expect(mockSupabase.auth.signOut).toHaveBeenCalled()
  })
})
