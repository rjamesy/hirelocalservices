import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'
import { mockUser } from '@/__tests__/helpers/test-data'

const { client: mockSupabase, single, maybeSingle, chainResult, rpc } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockLogAudit = vi.fn()
vi.mock('@/lib/audit', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}))

vi.mock('@/app/actions/notifications', () => ({
  createNotification: vi.fn(),
}))

const mockRunVerification = vi.fn()
vi.mock('@/app/actions/verification', () => ({
  runVerification: (...args: unknown[]) => mockRunVerification(...args),
}))

import { adminRevalidateReport } from '../admin'

function setupAdmin() {
  mockSupabase.auth.getUser.mockResolvedValue({
    data: { user: mockUser },
    error: null,
  })
  // admin profile check
  single.mockResolvedValueOnce({
    data: { role: 'admin' },
    error: null,
  })
}

describe('adminRevalidateReport', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('requires admin', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authed' },
    })
    await expect(adminRevalidateReport('rep-1')).rejects.toThrow('logged in')
  })

  it('returns error for already resolved report', async () => {
    setupAdmin()

    single.mockResolvedValueOnce({
      data: { id: 'rep-1', status: 'resolved', business_id: 'biz-1' },
      error: null,
    })

    const result = await adminRevalidateReport('rep-1')
    expect(result).toEqual({ error: 'Report is already resolved' })
  })

  it('on AI pass — resolves report as reported_passed', async () => {
    setupAdmin()

    // fetch report
    single.mockResolvedValueOnce({
      data: { id: 'rep-1', status: 'open', business_id: 'biz-1' },
      error: null,
    })

    // runVerification
    mockRunVerification.mockResolvedValue(undefined)

    // fetch latest verification job via maybeSingle
    maybeSingle.mockResolvedValueOnce({
      data: { id: 'job-1', final_decision: 'approved' },
      error: null,
    })

    // resolve report update (chainResult)
    chainResult.mockReturnValueOnce({ data: null, error: null })

    const result = await adminRevalidateReport('rep-1')
    expect(result).toEqual({ success: true, outcome: 'reported_passed' })
    expect(mockRunVerification).toHaveBeenCalledWith('biz-1', 'report_revalidation')
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'report_revalidated',
        entityType: 'report',
        entityId: 'rep-1',
        details: expect.objectContaining({
          resolution_outcome: 'reported_passed',
        }),
      })
    )
  })

  it('on AI fail — suspends listing and resolves as reported_failed', async () => {
    setupAdmin()

    // fetch report
    single.mockResolvedValueOnce({
      data: { id: 'rep-1', status: 'open', business_id: 'biz-1' },
      error: null,
    })

    // runVerification
    mockRunVerification.mockResolvedValue(undefined)

    // fetch latest verification job — rejected
    maybeSingle.mockResolvedValueOnce({
      data: { id: 'job-1', final_decision: 'rejected' },
      error: null,
    })

    // suspend listing update (chainResult)
    chainResult.mockReturnValueOnce({ data: null, error: null })

    // rpc refresh_search_index
    rpc.mockResolvedValueOnce({ data: null, error: null })

    // fetch business for notification (single)
    single.mockResolvedValueOnce({
      data: { owner_id: 'user-1', name: 'Test Biz' },
      error: null,
    })

    // resolve report update (chainResult)
    chainResult.mockReturnValueOnce({ data: null, error: null })

    const result = await adminRevalidateReport('rep-1')
    expect(result).toEqual({ success: true, outcome: 'reported_failed' })
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'report_revalidated',
        details: expect.objectContaining({
          resolution_outcome: 'reported_failed',
          verification_decision: 'rejected',
        }),
      })
    )
  })
})
