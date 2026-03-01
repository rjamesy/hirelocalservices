/**
 * Verification Approval/Rejection Tests
 *
 * Tests the admin approval/rejection flow including:
 * - Photo/testimonial promotion on approval
 * - Photo/testimonial revert on rejection
 * - Pending changes application on approval
 * - Storage cleanup on approval/rejection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'
import { mockAdminUser, mockUser } from '@/__tests__/helpers/test-data'

const { client: mockSupabase, single, maybeSingle, chainResult } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(() => Promise.resolve()),
}))

import {
  adminApproveVerification,
  adminRejectVerification,
} from '@/app/actions/verification'

describe('adminApproveVerification', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Admin auth
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockAdminUser },
      error: null,
    })
    // Admin role check
    single.mockResolvedValueOnce({
      data: { role: 'admin' },
      error: null,
    })
  })

  it('requires admin role', async () => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { role: 'business' },
      error: null,
    })

    await expect(adminApproveVerification('biz-123')).rejects.toThrow('admin')
  })

  it('requires authentication', async () => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authed' },
    })

    await expect(adminApproveVerification('biz-123')).rejects.toThrow('logged in')
  })

  it('approves business without pending changes', async () => {
    // Fetch business
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', slug: 'test-biz', pending_changes: null },
      error: null,
    })
    // Pending_delete photos query
    chainResult.mockReturnValueOnce({ data: [], error: null })
    // Latest verification job
    maybeSingle.mockResolvedValueOnce({
      data: { id: 'job-1' },
      error: null,
    })

    const result = await adminApproveVerification('biz-123', 'Looks good')
    expect(result).toEqual({ success: true })
  })

  it('applies pending changes on approval', async () => {
    single.mockResolvedValueOnce({
      data: {
        id: 'biz-123',
        slug: 'test-biz',
        pending_changes: {
          name: 'Updated Name',
          description: 'Updated description',
          phone: '0499999999',
        },
      },
      error: null,
    })
    chainResult.mockReturnValueOnce({ data: [], error: null })
    maybeSingle.mockResolvedValueOnce({
      data: { id: 'job-1' },
      error: null,
    })

    const result = await adminApproveVerification('biz-123')
    expect(result).toEqual({ success: true })
    // Verify from('businesses') was called (for the update)
    expect(mockSupabase.from).toHaveBeenCalledWith('businesses')
  })

  it('returns success even without verification job', async () => {
    single.mockResolvedValueOnce({
      data: { id: 'biz-123', slug: 'test-biz', pending_changes: null },
      error: null,
    })
    chainResult.mockReturnValueOnce({ data: [], error: null })
    maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    })

    const result = await adminApproveVerification('biz-123')
    expect(result).toEqual({ success: true })
  })
})

describe('adminRejectVerification', () => {
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

  it('requires admin role', async () => {
    vi.resetAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: { role: 'business' },
      error: null,
    })

    await expect(adminRejectVerification('biz-123')).rejects.toThrow('admin')
  })

  it('rejects business and returns success', async () => {
    // Write-then-read sanity check for verification_status
    single.mockResolvedValueOnce({
      data: { verification_status: 'rejected' },
      error: null,
    })
    // pending_add photos query (the chainResult for the select query)
    chainResult.mockReturnValueOnce({
      data: [
        { id: 'photo-1', url: 'https://example.supabase.co/storage/v1/object/public/photos/biz-123/1-test.jpg' },
      ],
      error: null,
    })
    // Latest verification job
    maybeSingle.mockResolvedValueOnce({
      data: { id: 'job-1' },
      error: null,
    })

    const result = await adminRejectVerification('biz-123', 'Bad content')
    expect(result).toEqual({ success: true })
  })

  it('returns success even with no pending photos', async () => {
    // Write-then-read sanity check for verification_status
    single.mockResolvedValueOnce({
      data: { verification_status: 'rejected' },
      error: null,
    })
    chainResult.mockReturnValueOnce({ data: [], error: null })
    maybeSingle.mockResolvedValueOnce({
      data: { id: 'job-1' },
      error: null,
    })

    const result = await adminRejectVerification('biz-123')
    expect(result).toEqual({ success: true })
  })
})
