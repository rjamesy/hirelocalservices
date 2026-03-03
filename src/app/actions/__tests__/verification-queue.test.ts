import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'
import { mockAdminUser } from '@/__tests__/helpers/test-data'

// ─── Mock Supabase client (used by requireAdmin + data queries) ────────────

const { client: mockSupabase, single, chainResult } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))

vi.mock('@/lib/verification', () => ({
  runDeterministicChecks: vi.fn(),
  runAIContentReview: vi.fn(),
  makeVerificationDecision: vi.fn(),
}))

vi.mock('@/app/actions/notifications', () => ({
  createNotification: vi.fn(),
}))

vi.mock('@/lib/pw-service', () => ({
  dualWrite: vi.fn(),
  approveWorking: vi.fn(),
  rejectWorking: vi.fn(),
}))

const mockGetBatchEntitlements = vi.fn(() => Promise.resolve(new Map()))

vi.mock('@/lib/entitlements', () => ({
  getBatchUserEntitlements: (...args: any[]) => mockGetBatchEntitlements(...args),
}))

// Import after mocks
import { getAdminVerificationQueue } from '../verification'

/** Helper: create a minimal entitlements object for testing */
function makeEntitlements(overrides: { plan?: string | null; isActive?: boolean } = {}) {
  const plan = 'plan' in overrides ? overrides.plan : 'premium'
  return {
    userId: '',
    plan,
    subscriptionStatus: plan ? 'active' : null,
    isActive: overrides.isActive ?? true,
    isTrial: false,
    maxListings: 10,
    currentListingCount: 0,
    publishedListingCount: 0,
    canClaimMore: true,
    canCreateMore: true,
    canPublishMore: true,
    canPublish: overrides.isActive ?? true,
    canEdit: true,
    canUploadPhotos: overrides.isActive ?? true,
    canAddTestimonials: overrides.isActive ?? true,
    canViewMetrics: overrides.isActive ?? true,
    maxPhotos: 10,
    maxTestimonials: 20,
    descriptionLimit: 1500,
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    effectiveState: (overrides.isActive ?? true) ? 'ok' : 'blocked',
    reasonCodes: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Admin auth: getUser + profile check
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockAdminUser }, error: null })
  single.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })

  // Default: all owners have active premium subscriptions
  mockGetBatchEntitlements.mockImplementation((_supabase: any, userIds: string[]) => {
    const map = new Map()
    for (const uid of userIds) {
      map.set(uid, makeEntitlements({ plan: 'premium', isActive: true }))
    }
    return Promise.resolve(map)
  })
})

// ─── Test data ─────────────────────────────────────────────────────────────

const wNew = {
  business_id: 'biz-1',
  name: 'New Biz',
  description: 'A new listing',
  phone: '0400000001',
  email_contact: 'new@test.com',
  website: 'https://new.com',
  abn: '11111111111',
  change_type: 'new',
  review_status: 'pending',
  submitted_at: '2024-06-01T00:00:00Z',
  created_at: '2024-05-01T00:00:00Z',
}

const wEdit = {
  business_id: 'biz-2',
  name: 'Edited Name',
  description: 'Same desc',
  phone: '0400000002',
  email_contact: 'edit@test.com',
  website: 'https://edit.com',
  abn: '22222222222',
  change_type: 'edit',
  review_status: 'pending',
  submitted_at: '2024-06-02T00:00:00Z',
  created_at: '2024-05-02T00:00:00Z',
}

const pForEdit = {
  business_id: 'biz-2',
  name: 'Original Name',
  description: 'Same desc',
  phone: '0400000002',
  email_contact: 'old@test.com',
  website: 'https://edit.com',
  abn: '22222222222',
}

const bizRows = [
  { id: 'biz-1', owner_id: 'owner-1', slug: 'new-biz', listing_source: 'manual', duplicate_user_choice: null, duplicate_of_business_id: null, duplicate_confidence: null },
  { id: 'biz-2', owner_id: 'owner-2', slug: 'edited-biz', listing_source: 'manual', duplicate_user_choice: 'matched', duplicate_of_business_id: 'seed-1', duplicate_confidence: 85 },
]

const jobRows = [
  { id: 'job-1', business_id: 'biz-1', deterministic_result: { spam_score: 0.1 }, ai_result: null, final_decision: 'pending', created_at: '2024-06-01T01:00:00Z' },
]

const photoRows = [
  { id: 'ph-1', business_id: 'biz-1', url: 'https://img/1.jpg', sort_order: 0, status: 'pending_add' },
]

const testimonialRows = [
  { id: 'tm-1', business_id: 'biz-1', author_name: 'Jane', text: 'Great service', rating: 5, status: 'pending_add' },
]

/**
 * Sets up chainResult mocks for a standard getAdminVerificationQueue call.
 * Order: working_listings, businesses, published_listings, verification_jobs, photos, testimonials
 */
function mockQueueQueries(
  wData: Record<string, unknown>[],
  opts?: {
    businesses?: Record<string, unknown>[]
    published?: Record<string, unknown>[]
    jobs?: Record<string, unknown>[]
    photos?: Record<string, unknown>[]
    testimonials?: Record<string, unknown>[]
  }
) {
  chainResult
    .mockReturnValueOnce({ data: wData, count: wData.length, error: null })
    .mockReturnValueOnce({ data: opts?.businesses ?? bizRows, error: null })
    .mockReturnValueOnce({ data: opts?.published ?? [], error: null })
    .mockReturnValueOnce({ data: opts?.jobs ?? [], error: null })
    .mockReturnValueOnce({ data: opts?.photos ?? [], error: null })
    .mockReturnValueOnce({ data: opts?.testimonials ?? [], error: null })
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('getAdminVerificationQueue — W-based', () => {
  it('returns empty when no pending W items', async () => {
    chainResult.mockReturnValueOnce({ data: [], count: 0, error: null })

    const result = await getAdminVerificationQueue()
    expect(result.data).toEqual([])
    expect(result.totalCount).toBe(0)
  })

  it('returns W content for new listing with pending_changes = null', async () => {
    mockQueueQueries([wNew], { jobs: jobRows, photos: photoRows, testimonials: testimonialRows })

    const result = await getAdminVerificationQueue()
    expect(result.data).toHaveLength(1)

    const item = result.data[0]
    expect(item.id).toBe('biz-1')
    expect(item.name).toBe('New Biz')
    expect(item.description).toBe('A new listing')
    expect(item.phone).toBe('0400000001')
    expect(item.pending_changes).toBeNull()
    expect(item.verification_status).toBe('pending')
    expect(item.created_at).toBe('2024-06-01T00:00:00Z')
  })

  it('builds pending_changes diff for edit listing (W vs P)', async () => {
    mockQueueQueries([wEdit], { published: [pForEdit] })

    const result = await getAdminVerificationQueue()
    const item = result.data[0]

    // Main fields from P (live baseline)
    expect(item.name).toBe('Original Name')
    expect(item.email_contact).toBe('old@test.com')
    // Only changed fields in pending_changes
    expect(item.pending_changes).toEqual({
      name: 'Edited Name',
      email_contact: 'edit@test.com',
    })
  })

  it('preserves identity fields from businesses join', async () => {
    mockQueueQueries([wEdit], { published: [pForEdit] })

    const result = await getAdminVerificationQueue()
    const item = result.data[0]

    expect(item.slug).toBe('edited-biz')
    expect(item.listing_source).toBe('manual')
    expect(item.duplicate_user_choice).toBe('matched')
    expect(item.duplicate_of_business_id).toBe('seed-1')
    expect(item.duplicate_confidence).toBe(85)
  })

  it('includes photos and testimonials from batch queries', async () => {
    mockQueueQueries([wNew], { jobs: jobRows, photos: photoRows, testimonials: testimonialRows })

    const result = await getAdminVerificationQueue()
    const item = result.data[0]

    expect(item.verification_jobs).toHaveLength(1)
    expect(item.verification_jobs[0].id).toBe('job-1')
    expect(item.photos).toHaveLength(1)
    expect(item.photos[0].status).toBe('pending_add')
    expect(item.testimonials).toHaveLength(1)
    expect(item.testimonials[0].author_name).toBe('Jane')
  })
})

describe('getAdminVerificationQueue — subscriptionWarning', () => {
  it('returns no_subscription when owner has no entitlements', async () => {
    mockGetBatchEntitlements.mockResolvedValue(new Map())
    mockQueueQueries([wNew])

    const result = await getAdminVerificationQueue()
    expect(result.data[0].subscriptionWarning).toBe('no_subscription')
  })

  it('returns no_subscription when owner plan is null', async () => {
    mockGetBatchEntitlements.mockResolvedValue(
      new Map([['owner-1', makeEntitlements({ plan: null, isActive: false })]])
    )
    mockQueueQueries([wNew])

    const result = await getAdminVerificationQueue()
    expect(result.data[0].subscriptionWarning).toBe('no_subscription')
  })

  it('returns subscription_inactive when owner has plan but is not active', async () => {
    mockGetBatchEntitlements.mockResolvedValue(
      new Map([['owner-1', makeEntitlements({ plan: 'premium', isActive: false })]])
    )
    mockQueueQueries([wNew])

    const result = await getAdminVerificationQueue()
    expect(result.data[0].subscriptionWarning).toBe('subscription_inactive')
  })

  it('returns plan_insufficient when basic plan but listing has photos', async () => {
    mockGetBatchEntitlements.mockResolvedValue(
      new Map([['owner-1', makeEntitlements({ plan: 'basic', isActive: true })]])
    )
    mockQueueQueries([wNew], { photos: photoRows })

    const result = await getAdminVerificationQueue()
    expect(result.data[0].subscriptionWarning).toBe('plan_insufficient')
  })

  it('returns plan_insufficient when basic plan but listing has testimonials', async () => {
    mockGetBatchEntitlements.mockResolvedValue(
      new Map([['owner-1', makeEntitlements({ plan: 'basic', isActive: true })]])
    )
    mockQueueQueries([wNew], { testimonials: testimonialRows })

    const result = await getAdminVerificationQueue()
    expect(result.data[0].subscriptionWarning).toBe('plan_insufficient')
  })

  it('returns null when premium plan with photos (sufficient)', async () => {
    mockGetBatchEntitlements.mockResolvedValue(
      new Map([['owner-1', makeEntitlements({ plan: 'premium', isActive: true })]])
    )
    mockQueueQueries([wNew], { photos: photoRows })

    const result = await getAdminVerificationQueue()
    expect(result.data[0].subscriptionWarning).toBeNull()
  })

  it('returns null when basic plan and no photos/testimonials', async () => {
    mockGetBatchEntitlements.mockResolvedValue(
      new Map([['owner-1', makeEntitlements({ plan: 'basic', isActive: true })]])
    )
    mockQueueQueries([wNew])

    const result = await getAdminVerificationQueue()
    expect(result.data[0].subscriptionWarning).toBeNull()
  })

  it('returns no_subscription when business has no owner_id', async () => {
    mockQueueQueries([wNew], {
      businesses: [{ ...bizRows[0], owner_id: null }],
    })

    const result = await getAdminVerificationQueue()
    expect(result.data[0].subscriptionWarning).toBe('no_subscription')
  })

  it('excludes pending_delete items from plan insufficiency check', async () => {
    mockGetBatchEntitlements.mockResolvedValue(
      new Map([['owner-1', makeEntitlements({ plan: 'basic', isActive: true })]])
    )
    // All photos are pending_delete, so they shouldn't count
    mockQueueQueries([wNew], {
      photos: [{ id: 'ph-1', business_id: 'biz-1', url: 'https://img/1.jpg', sort_order: 0, status: 'pending_delete' }],
    })

    const result = await getAdminVerificationQueue()
    expect(result.data[0].subscriptionWarning).toBeNull()
  })
})
