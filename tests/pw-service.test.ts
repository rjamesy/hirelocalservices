/**
 * pw-service.test.ts — Unit tests for P/W service module
 *
 * Mocks createAdminClient to verify correct Supabase queries without
 * hitting a real database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock setup ─────────────────────────────────────────────────────────────

// Chain-mockable query builder
function createQueryBuilder(returnData: any = null) {
  const builder: any = {
    _data: returnData,
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: returnData, error: null }),
    single: vi.fn().mockResolvedValue({ data: returnData, error: null }),
  }
  return builder
}

// Per-table mock builders, configurable per test
let tableBuilders: Record<string, any> = {}

const mockFrom = vi.fn((table: string) => {
  if (tableBuilders[table]) {
    return tableBuilders[table]
  }
  return createQueryBuilder(null)
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: mockFrom,
  }),
}))

// Import AFTER mocking
import {
  dualWrite,
  createWorking,
  updateWorking,
  submitWorking,
  approveWorking,
  rejectWorking,
  archiveWorking,
  setVisibility,
  getActiveWorking,
  getCurrentPublished,
} from '@/lib/pw-service'

beforeEach(() => {
  vi.clearAllMocks()
  tableBuilders = {}
  // Re-establish mockFrom implementation after clearAllMocks
  mockFrom.mockImplementation((table: string) => {
    if (tableBuilders[table]) {
      return tableBuilders[table]
    }
    return createQueryBuilder(null)
  })
})

// ─── dualWrite ──────────────────────────────────────────────────────────────

describe('dualWrite', () => {
  it('calls the function on success', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)
    await dualWrite('test', fn)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('catches and logs errors without rethrowing', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fn = vi.fn().mockRejectedValue(new Error('test error'))

    await expect(dualWrite('testLabel', fn)).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[pw-service] testLabel failed'),
      expect.any(Error)
    )
    consoleSpy.mockRestore()
  })
})

// ─── createWorking ──────────────────────────────────────────────────────────

describe('createWorking', () => {
  it('inserts a new W row for change_type=new', async () => {
    // Mock: no existing active W
    const wBuilder = createQueryBuilder(null)
    // Mock: businesses (for snapshot on edit only — not called for 'new')
    tableBuilders['working_listings'] = wBuilder

    await createWorking('biz-1', 'new', {
      name: 'Test Business',
      phone: '0400000000',
    })

    expect(mockFrom).toHaveBeenCalledWith('working_listings')
    // First call: select to check existing
    expect(wBuilder.select).toHaveBeenCalled()
    // Second call should be insert
    expect(wBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        business_id: 'biz-1',
        name: 'Test Business',
        phone: '0400000000',
        change_type: 'new',
        review_status: 'draft',
      })
    )
  })

  it('updates existing W instead of creating duplicate', async () => {
    // Mock: active W already exists
    const wBuilder = createQueryBuilder({ id: 'w-existing' })
    tableBuilders['working_listings'] = wBuilder

    await createWorking('biz-1', 'new', { name: 'Updated Name' })

    expect(wBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Updated Name' })
    )
    expect(wBuilder.insert).not.toHaveBeenCalled()
  })
})

// ─── updateWorking ──────────────────────────────────────────────────────────

describe('updateWorking', () => {
  it('updates the active W fields', async () => {
    const wBuilder = createQueryBuilder({ id: 'w-1' })
    tableBuilders['working_listings'] = wBuilder

    await updateWorking('biz-1', { phone: '0411111111', suburb: 'Sydney' })

    expect(wBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '0411111111', suburb: 'Sydney' })
    )
  })

  it('creates W via createWorking if no active W exists', async () => {
    // First call to updateWorking: no active W found
    // Then createWorking is called internally, which also checks + inserts
    const wBuilder = createQueryBuilder(null)
    const bizBuilder = createQueryBuilder({ name: 'Biz', description: null, phone: null, email_contact: null, website: null, abn: null })
    const locBuilder = createQueryBuilder(null)
    const catBuilder = createQueryBuilder(null)

    // For the multiple calls to from('working_listings'), from('businesses'), etc.
    let wCallCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'working_listings') {
        wCallCount++
        if (wCallCount <= 2) {
          // First two calls: select checks for existing (both return null)
          return createQueryBuilder(null)
        }
        // Third call: insert
        return createQueryBuilder(null)
      }
      if (table === 'businesses') return bizBuilder
      if (table === 'business_locations') {
        const b = createQueryBuilder(null)
        b.limit = vi.fn().mockResolvedValue({ data: [], error: null })
        return b
      }
      if (table === 'business_categories') return catBuilder
      return createQueryBuilder(null)
    })

    await updateWorking('biz-1', { name: 'New Name' })

    // Should have called from('working_listings') multiple times
    expect(mockFrom).toHaveBeenCalledWith('working_listings')
  })

  it('skips update if no fields provided', async () => {
    const wBuilder = createQueryBuilder({ id: 'w-1' })
    tableBuilders['working_listings'] = wBuilder

    await updateWorking('biz-1', {})

    expect(wBuilder.update).not.toHaveBeenCalled()
  })
})

// ─── submitWorking ──────────────────────────────────────────────────────────

describe('submitWorking', () => {
  it('sets review_status to pending with submitted_at', async () => {
    const wBuilder = createQueryBuilder(null)
    tableBuilders['working_listings'] = wBuilder

    await submitWorking('biz-1')

    expect(wBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        review_status: 'pending',
        submitted_at: expect.any(String),
      })
    )
  })
})

// ─── rejectWorking ──────────────────────────────────────────────────────────

describe('rejectWorking', () => {
  it('sets changes_required and increments rejection_count', async () => {
    const wBuilder = createQueryBuilder({ id: 'w-1', rejection_count: 1 })
    tableBuilders['working_listings'] = wBuilder

    await rejectWorking('biz-1', 'admin-1', 'Please fix description')

    expect(wBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        review_status: 'changes_required',
        rejection_reason: 'Please fix description',
        rejection_count: 2,
        reviewed_by: 'admin-1',
      })
    )
  })

  it('does nothing if no active W exists', async () => {
    const wBuilder = createQueryBuilder(null)
    tableBuilders['working_listings'] = wBuilder

    await rejectWorking('biz-1', 'admin-1', 'reason')

    // update should NOT have been called (only select was)
    // The maybeSingle returns null, so function returns early
    expect(wBuilder.update).not.toHaveBeenCalled()
  })
})

// ─── archiveWorking ─────────────────────────────────────────────────────────

describe('archiveWorking', () => {
  it('sets archived_at on the active W', async () => {
    const wBuilder = createQueryBuilder(null)
    tableBuilders['working_listings'] = wBuilder

    await archiveWorking('biz-1')

    expect(wBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        archived_at: expect.any(String),
      })
    )
    expect(wBuilder.eq).toHaveBeenCalledWith('business_id', 'biz-1')
    expect(wBuilder.is).toHaveBeenCalledWith('archived_at', null)
  })
})

// ─── setVisibility ──────────────────────────────────────────────────────────

describe('setVisibility', () => {
  it('updates visibility_status on the current P', async () => {
    const pBuilder = createQueryBuilder(null)
    tableBuilders['published_listings'] = pBuilder

    await setVisibility('biz-1', 'paused')

    expect(pBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ visibility_status: 'paused' })
    )
    expect(pBuilder.eq).toHaveBeenCalledWith('business_id', 'biz-1')
    expect(pBuilder.eq).toHaveBeenCalledWith('is_current', true)
  })

  it('sets visibility to suspended', async () => {
    const pBuilder = createQueryBuilder(null)
    tableBuilders['published_listings'] = pBuilder

    await setVisibility('biz-1', 'suspended')

    expect(pBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ visibility_status: 'suspended' })
    )
  })

  it('sets visibility to live', async () => {
    const pBuilder = createQueryBuilder(null)
    tableBuilders['published_listings'] = pBuilder

    await setVisibility('biz-1', 'live')

    expect(pBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ visibility_status: 'live' })
    )
  })
})

// ─── getActiveWorking ───────────────────────────────────────────────────────

describe('getActiveWorking', () => {
  it('returns the active W if it exists', async () => {
    const mockW = { id: 'w-1', business_id: 'biz-1', name: 'Test' }
    const wBuilder = createQueryBuilder(mockW)
    tableBuilders['working_listings'] = wBuilder

    const result = await getActiveWorking('biz-1')

    expect(result).toEqual(mockW)
    expect(wBuilder.eq).toHaveBeenCalledWith('business_id', 'biz-1')
    expect(wBuilder.is).toHaveBeenCalledWith('archived_at', null)
  })

  it('returns null if no active W', async () => {
    const wBuilder = createQueryBuilder(null)
    tableBuilders['working_listings'] = wBuilder

    const result = await getActiveWorking('biz-1')

    expect(result).toBeNull()
  })
})

// ─── getCurrentPublished ────────────────────────────────────────────────────

describe('getCurrentPublished', () => {
  it('returns the current P if it exists', async () => {
    const mockP = { id: 'p-1', business_id: 'biz-1', amendment: 0, is_current: true }
    const pBuilder = createQueryBuilder(mockP)
    tableBuilders['published_listings'] = pBuilder

    const result = await getCurrentPublished('biz-1')

    expect(result).toEqual(mockP)
    expect(pBuilder.eq).toHaveBeenCalledWith('business_id', 'biz-1')
    expect(pBuilder.eq).toHaveBeenCalledWith('is_current', true)
  })

  it('returns null if no current P', async () => {
    const pBuilder = createQueryBuilder(null)
    tableBuilders['published_listings'] = pBuilder

    const result = await getCurrentPublished('biz-1')

    expect(result).toBeNull()
  })
})
