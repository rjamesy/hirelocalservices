/**
 * E2E: Pending Photo/Testimonial Workflow
 *
 * Tests the full lifecycle via Supabase API:
 * 1. Setup: Create test businesses with free/premium/premium_annual subscriptions
 * 2. Test photo add/delete behavior per business status (draft vs published)
 * 3. Test testimonial add/delete behavior
 * 4. Test admin approval promotes pending_add, deletes pending_delete
 * 5. Test admin rejection reverts pending_delete, deletes pending_add
 * 6. Cleanup: Remove all test data
 */

import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hqaeezfsetzyubcmbwbv.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxYWVlemZzZXR6eXViY21id2J2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc0MTgwNSwiZXhwIjoyMDg3MzE3ODA1fQ.71vuh44vFJJJsWZ4Ucsw8Fl8u9CYiTNpyO7krWURC4A'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Test data IDs (for cleanup)
const TEST_PREFIX = 'e2e-pending-test'
const ADMIN_USER_ID = '3211b764-1d33-4e23-8d2b-25668de53f65' // existing admin

let testBusinessIds: string[] = []
let testPhotoIds: string[] = []
let testTestimonialIds: string[] = []
let testUserIds: string[] = []

// ─── Helpers ────────────────────────────────────────────────────────

async function createTestUser(plan: string): Promise<string> {
  const email = `${TEST_PREFIX}-${plan}-${Date.now()}@test.local`
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: 'test-password-e2e-123',
    email_confirm: true,
  })
  if (error) throw new Error(`Failed to create test user: ${error.message}`)
  const userId = data.user.id
  testUserIds.push(userId)

  await supabase.from('user_subscriptions').insert({
    user_id: userId,
    plan,
    status: 'active',
    stripe_customer_id: `cus_test_${userId.slice(0, 8)}`,
    stripe_subscription_id: `sub_test_${userId.slice(0, 8)}`,
    stripe_price_id: `price_test_${plan}`,
    current_period_end: '2027-01-01T00:00:00Z',
    cancel_at_period_end: false,
  })

  return userId
}

async function createTestBusiness(
  name: string,
  status: 'draft' | 'published',
  verificationStatus: 'approved' | 'pending',
  plan?: string
) {
  const slug = name.toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).slice(2, 6)

  // Create a unique test user for this business if plan specified
  const ownerId = plan ? await createTestUser(plan) : ADMIN_USER_ID

  const { data: biz, error: bizError } = await supabase
    .from('businesses')
    .insert({
      owner_id: ownerId,
      name,
      slug,
      description: `${TEST_PREFIX} - Test business for E2E`,
      status,
      verification_status: verificationStatus,
      listing_source: 'manual',
      billing_status: 'active',
    })
    .select()
    .single()

  if (bizError) throw new Error(`Failed to create business: ${bizError.message}`)
  testBusinessIds.push(biz.id)

  // Create location
  await supabase.from('business_locations').insert({
    business_id: biz.id,
    suburb: 'Brisbane',
    state: 'QLD',
    postcode: '4000',
    lat: -27.4698,
    lng: 153.0251,
    service_radius_km: 25,
  })

  return biz
}

async function insertTestPhoto(
  businessId: string,
  sortOrder: number,
  status: 'live' | 'pending_add' | 'pending_delete'
) {
  const url = `https://hqaeezfsetzyubcmbwbv.supabase.co/storage/v1/object/public/photos/${businessId}/test-${Date.now()}-${sortOrder}.jpg`
  const { data, error } = await supabase
    .from('photos')
    .insert({
      business_id: businessId,
      url,
      sort_order: sortOrder,
      status,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to insert photo: ${error.message}`)
  testPhotoIds.push(data.id)
  return data
}

async function insertTestTestimonial(
  businessId: string,
  status: 'live' | 'pending_add' | 'pending_delete'
) {
  const { data, error } = await supabase
    .from('testimonials')
    .insert({
      business_id: businessId,
      author_name: `${TEST_PREFIX} Author`,
      text: 'Great service, would recommend to everyone in the area!',
      rating: 5,
      status,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to insert testimonial: ${error.message}`)
  testTestimonialIds.push(data.id)
  return data
}

async function getPhotos(businessId: string) {
  const { data } = await supabase
    .from('photos')
    .select('id, status, sort_order')
    .eq('business_id', businessId)
    .order('sort_order')
  return data ?? []
}

async function getTestimonials(businessId: string) {
  const { data } = await supabase
    .from('testimonials')
    .select('id, status, author_name')
    .eq('business_id', businessId)
  return data ?? []
}

// ─── Cleanup ────────────────────────────────────────────────────────

async function cleanup() {
  // Delete test photos
  if (testPhotoIds.length > 0) {
    await supabase.from('photos').delete().in('id', testPhotoIds)
  }
  // Delete test testimonials
  if (testTestimonialIds.length > 0) {
    await supabase.from('testimonials').delete().in('id', testTestimonialIds)
  }
  // Delete test businesses and related data
  for (const bizId of testBusinessIds) {
    await supabase.from('business_locations').delete().eq('business_id', bizId)
    await supabase.from('verification_jobs').delete().eq('business_id', bizId)
    await supabase.from('businesses').delete().eq('id', bizId)
  }
  // Delete test users and their subscriptions
  for (const userId of testUserIds) {
    await supabase.from('user_subscriptions').delete().eq('user_id', userId)
    await supabase.auth.admin.deleteUser(userId)
  }
  testBusinessIds = []
  testPhotoIds = []
  testTestimonialIds = []
  testUserIds = []
}

// ─── Tests ──────────────────────────────────────────────────────────

test.describe('Pending Photo/Testimonial E2E Workflow', () => {
  test.afterAll(async () => {
    // Extended timeout for cleanup of many test rows
    test.setTimeout(60000)
    await cleanup()
  })

  // ── 1. Status column exists and defaults to 'live' ──

  test('status column exists on photos and testimonials', async () => {
    const biz = await createTestBusiness(
      `${TEST_PREFIX}-status-check`,
      'draft',
      'approved',
      'premium'
    )

    const photo = await insertTestPhoto(biz.id, 0, 'live')
    expect(photo.status).toBe('live')

    const testimonial = await insertTestTestimonial(biz.id, 'live')
    expect(testimonial.status).toBe('live')
  })

  // ── 2. Draft business: photos and testimonials are 'live' directly ──

  test('draft business: photos insert as live', async () => {
    const biz = await createTestBusiness(
      `${TEST_PREFIX}-draft-photo`,
      'draft',
      'approved',
      'premium'
    )

    const photo = await insertTestPhoto(biz.id, 0, 'live')
    expect(photo.status).toBe('live')

    const photos = await getPhotos(biz.id)
    expect(photos).toHaveLength(1)
    expect(photos[0].status).toBe('live')
  })

  // ── 3. Published business: new photos get pending_add ──

  test('published business: new photos can be pending_add', async () => {
    const biz = await createTestBusiness(
      `${TEST_PREFIX}-pub-photo`,
      'published',
      'approved',
      'premium'
    )

    // Existing live photos
    await insertTestPhoto(biz.id, 0, 'live')
    await insertTestPhoto(biz.id, 1, 'live')
    // New photo pending approval
    await insertTestPhoto(biz.id, 2, 'pending_add')

    const photos = await getPhotos(biz.id)
    expect(photos).toHaveLength(3)
    expect(photos.filter(p => p.status === 'live')).toHaveLength(2)
    expect(photos.filter(p => p.status === 'pending_add')).toHaveLength(1)
  })

  // ── 4. Published business: deleted photos get pending_delete ──

  test('published business: live photos can be marked pending_delete', async () => {
    const biz = await createTestBusiness(
      `${TEST_PREFIX}-pub-delete`,
      'published',
      'approved',
      'premium'
    )

    const photo = await insertTestPhoto(biz.id, 0, 'live')

    // Mark for deletion
    const { error } = await supabase
      .from('photos')
      .update({ status: 'pending_delete' })
      .eq('id', photo.id)
    expect(error).toBeNull()

    const photos = await getPhotos(biz.id)
    expect(photos[0].status).toBe('pending_delete')
  })

  // ── 5. Testimonials follow same pattern ──

  test('published business: testimonials can be pending_add', async () => {
    const biz = await createTestBusiness(
      `${TEST_PREFIX}-pub-testimonial`,
      'published',
      'approved',
      'premium'
    )

    await insertTestTestimonial(biz.id, 'live')
    await insertTestTestimonial(biz.id, 'pending_add')

    const testimonials = await getTestimonials(biz.id)
    expect(testimonials).toHaveLength(2)
    expect(testimonials.filter(t => t.status === 'live')).toHaveLength(1)
    expect(testimonials.filter(t => t.status === 'pending_add')).toHaveLength(1)
  })

  test('published business: testimonials can be pending_delete', async () => {
    const biz = await createTestBusiness(
      `${TEST_PREFIX}-pub-test-delete`,
      'published',
      'approved',
      'premium'
    )

    const testimonial = await insertTestTestimonial(biz.id, 'live')

    const { error } = await supabase
      .from('testimonials')
      .update({ status: 'pending_delete' })
      .eq('id', testimonial.id)
    expect(error).toBeNull()

    const testimonials = await getTestimonials(biz.id)
    expect(testimonials[0].status).toBe('pending_delete')
  })

  // ── 6. Approval: pending_add → live, pending_delete → deleted ──

  test('approval promotes pending_add to live', async () => {
    const biz = await createTestBusiness(
      `${TEST_PREFIX}-approve-add`,
      'published',
      'approved',
      'premium'
    )

    await insertTestPhoto(biz.id, 0, 'pending_add')
    await insertTestPhoto(biz.id, 1, 'pending_add')

    // Simulate approval: update pending_add → live
    const { error } = await supabase
      .from('photos')
      .update({ status: 'live' })
      .eq('business_id', biz.id)
      .eq('status', 'pending_add')
    expect(error).toBeNull()

    const photos = await getPhotos(biz.id)
    expect(photos.every(p => p.status === 'live')).toBe(true)
  })

  test('approval deletes pending_delete photos', async () => {
    const biz = await createTestBusiness(
      `${TEST_PREFIX}-approve-delete`,
      'published',
      'approved',
      'premium'
    )

    const keepPhoto = await insertTestPhoto(biz.id, 0, 'live')
    const deletePhoto = await insertTestPhoto(biz.id, 1, 'pending_delete')

    // Simulate approval: delete pending_delete
    const { error } = await supabase
      .from('photos')
      .delete()
      .eq('business_id', biz.id)
      .eq('status', 'pending_delete')
    expect(error).toBeNull()

    // Remove from tracking since it's deleted
    testPhotoIds = testPhotoIds.filter(id => id !== deletePhoto.id)

    const photos = await getPhotos(biz.id)
    expect(photos).toHaveLength(1)
    expect(photos[0].id).toBe(keepPhoto.id)
    expect(photos[0].status).toBe('live')
  })

  // ── 7. Rejection: pending_add → deleted, pending_delete → live ──

  test('rejection deletes pending_add photos', async () => {
    const biz = await createTestBusiness(
      `${TEST_PREFIX}-reject-add`,
      'published',
      'approved',
      'premium'
    )

    const existingPhoto = await insertTestPhoto(biz.id, 0, 'live')
    const newPhoto = await insertTestPhoto(biz.id, 1, 'pending_add')

    // Simulate rejection: delete pending_add
    const { error } = await supabase
      .from('photos')
      .delete()
      .eq('business_id', biz.id)
      .eq('status', 'pending_add')
    expect(error).toBeNull()

    testPhotoIds = testPhotoIds.filter(id => id !== newPhoto.id)

    const photos = await getPhotos(biz.id)
    expect(photos).toHaveLength(1)
    expect(photos[0].id).toBe(existingPhoto.id)
    expect(photos[0].status).toBe('live')
  })

  test('rejection reverts pending_delete to live', async () => {
    const biz = await createTestBusiness(
      `${TEST_PREFIX}-reject-delete`,
      'published',
      'approved',
      'premium'
    )

    await insertTestPhoto(biz.id, 0, 'pending_delete')

    // Simulate rejection: revert pending_delete → live
    const { error } = await supabase
      .from('photos')
      .update({ status: 'live' })
      .eq('business_id', biz.id)
      .eq('status', 'pending_delete')
    expect(error).toBeNull()

    const photos = await getPhotos(biz.id)
    expect(photos).toHaveLength(1)
    expect(photos[0].status).toBe('live')
  })

  // ── 8. Mixed scenario: approval with adds and deletes ──

  test('mixed approval: promotes adds and deletes removals', async () => {
    const biz = await createTestBusiness(
      `${TEST_PREFIX}-mixed-approve`,
      'published',
      'approved',
      'premium'
    )

    // Existing live
    const live1 = await insertTestPhoto(biz.id, 0, 'live')
    const live2 = await insertTestPhoto(biz.id, 1, 'live')
    // New additions
    const add1 = await insertTestPhoto(biz.id, 2, 'pending_add')
    const add2 = await insertTestPhoto(biz.id, 3, 'pending_add')
    // Marked for deletion
    const del1 = await insertTestPhoto(biz.id, 4, 'pending_delete')

    // Simulate approval
    await supabase
      .from('photos')
      .update({ status: 'live' })
      .eq('business_id', biz.id)
      .eq('status', 'pending_add')

    await supabase
      .from('photos')
      .delete()
      .eq('business_id', biz.id)
      .eq('status', 'pending_delete')

    testPhotoIds = testPhotoIds.filter(id => id !== del1.id)

    const photos = await getPhotos(biz.id)
    expect(photos).toHaveLength(4) // live1, live2, add1→live, add2→live
    expect(photos.every(p => p.status === 'live')).toBe(true)
  })

  // ── 9. Mixed scenario: rejection with adds and deletes ──

  test('mixed rejection: deletes adds and reverts removals', async () => {
    const biz = await createTestBusiness(
      `${TEST_PREFIX}-mixed-reject`,
      'published',
      'approved',
      'premium'
    )

    const live1 = await insertTestPhoto(biz.id, 0, 'live')
    const add1 = await insertTestPhoto(biz.id, 1, 'pending_add')
    const del1 = await insertTestPhoto(biz.id, 2, 'pending_delete')

    // Simulate rejection
    await supabase
      .from('photos')
      .delete()
      .eq('business_id', biz.id)
      .eq('status', 'pending_add')

    await supabase
      .from('photos')
      .update({ status: 'live' })
      .eq('business_id', biz.id)
      .eq('status', 'pending_delete')

    testPhotoIds = testPhotoIds.filter(id => id !== add1.id)

    const photos = await getPhotos(biz.id)
    expect(photos).toHaveLength(2) // live1, del1→live
    expect(photos.every(p => p.status === 'live')).toBe(true)
  })

  // ── 10. Testimonials: same approval/rejection pattern ──

  test('testimonial approval: pending_add promoted, pending_delete removed', async () => {
    const biz = await createTestBusiness(
      `${TEST_PREFIX}-test-approve`,
      'published',
      'approved',
      'premium'
    )

    const live1 = await insertTestTestimonial(biz.id, 'live')
    const add1 = await insertTestTestimonial(biz.id, 'pending_add')
    const del1 = await insertTestTestimonial(biz.id, 'pending_delete')

    // Approve
    await supabase
      .from('testimonials')
      .update({ status: 'live' })
      .eq('business_id', biz.id)
      .eq('status', 'pending_add')

    await supabase
      .from('testimonials')
      .delete()
      .eq('business_id', biz.id)
      .eq('status', 'pending_delete')

    testTestimonialIds = testTestimonialIds.filter(id => id !== del1.id)

    const testimonials = await getTestimonials(biz.id)
    expect(testimonials).toHaveLength(2)
    expect(testimonials.every(t => t.status === 'live')).toBe(true)
  })

  test('testimonial rejection: pending_add removed, pending_delete reverted', async () => {
    const biz = await createTestBusiness(
      `${TEST_PREFIX}-test-reject`,
      'published',
      'approved',
      'premium'
    )

    const live1 = await insertTestTestimonial(biz.id, 'live')
    const add1 = await insertTestTestimonial(biz.id, 'pending_add')
    const del1 = await insertTestTestimonial(biz.id, 'pending_delete')

    // Reject
    await supabase
      .from('testimonials')
      .delete()
      .eq('business_id', biz.id)
      .eq('status', 'pending_add')

    await supabase
      .from('testimonials')
      .update({ status: 'live' })
      .eq('business_id', biz.id)
      .eq('status', 'pending_delete')

    testTestimonialIds = testTestimonialIds.filter(id => id !== add1.id)

    const testimonials = await getTestimonials(biz.id)
    expect(testimonials).toHaveLength(2)
    expect(testimonials.every(t => t.status === 'live')).toBe(true)
  })

  // ── 11. CHECK constraint validation ──

  test('status CHECK constraint rejects invalid values', async () => {
    const biz = await createTestBusiness(
      `${TEST_PREFIX}-constraint`,
      'draft',
      'approved',
      'premium'
    )

    const { error } = await supabase
      .from('photos')
      .insert({
        business_id: biz.id,
        url: 'https://example.com/test.jpg',
        sort_order: 0,
        status: 'invalid_status',
      })

    expect(error).not.toBeNull()
    expect(error!.message).toContain('photos_status_check')
  })

  test('testimonial status CHECK constraint rejects invalid values', async () => {
    const biz = await createTestBusiness(
      `${TEST_PREFIX}-t-constraint`,
      'draft',
      'approved',
      'premium'
    )

    const { error } = await supabase
      .from('testimonials')
      .insert({
        business_id: biz.id,
        author_name: 'Test',
        text: 'Test testimonial for constraint check!',
        rating: 5,
        status: 'invalid_status',
      })

    expect(error).not.toBeNull()
    expect(error!.message).toContain('testimonials_status_check')
  })

  // ── 12. Count queries exclude pending_delete ──

  test('count query excludes pending_delete photos', async () => {
    const biz = await createTestBusiness(
      `${TEST_PREFIX}-count-exclude`,
      'published',
      'approved',
      'premium'
    )

    await insertTestPhoto(biz.id, 0, 'live')
    await insertTestPhoto(biz.id, 1, 'live')
    await insertTestPhoto(biz.id, 2, 'pending_delete')
    await insertTestPhoto(biz.id, 3, 'pending_add')

    // Count excluding pending_delete (as the server action does)
    const { count } = await supabase
      .from('photos')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', biz.id)
      .neq('status', 'pending_delete')

    expect(count).toBe(3) // live + live + pending_add (not pending_delete)
  })

  // ── 13. Public visibility: only live items shown ──

  test('filtering to live-only excludes pending items', async () => {
    const biz = await createTestBusiness(
      `${TEST_PREFIX}-public-filter`,
      'published',
      'approved',
      'premium'
    )

    await insertTestPhoto(biz.id, 0, 'live')
    await insertTestPhoto(biz.id, 1, 'pending_add')
    await insertTestPhoto(biz.id, 2, 'pending_delete')

    // Query as public would (status = live only)
    const { data: publicPhotos } = await supabase
      .from('photos')
      .select('id, status')
      .eq('business_id', biz.id)
      .eq('status', 'live')

    expect(publicPhotos).toHaveLength(1)
    expect(publicPhotos![0].status).toBe('live')
  })

  // ── 14. Basic tier business: no premium subscription ──

  test('basic tier business exists without premium subscription', async () => {
    const biz = await createTestBusiness(
      `${TEST_PREFIX}-basic-tier`,
      'published',
      'approved',
      'basic' // Not premium
    )

    // Verify owner's subscription is basic
    const { data: sub } = await supabase
      .from('user_subscriptions')
      .select('plan')
      .eq('user_id', biz.owner_id)
      .maybeSingle()

    expect(sub?.plan).toBe('basic')
    expect(sub?.plan).not.toBe('premium')
  })

  // ── 15. Premium annual follows same rules as premium ──

  test('premium_annual business can have photos and testimonials', async () => {
    const biz = await createTestBusiness(
      `${TEST_PREFIX}-premium-annual`,
      'published',
      'approved',
      'premium_annual'
    )

    const photo = await insertTestPhoto(biz.id, 0, 'live')
    const testimonial = await insertTestTestimonial(biz.id, 'live')

    expect(photo.status).toBe('live')
    expect(testimonial.status).toBe('live')

    // Verify owner's subscription
    const { data: sub } = await supabase
      .from('user_subscriptions')
      .select('plan')
      .eq('user_id', biz.owner_id)
      .maybeSingle()

    expect(sub?.plan).toBe('premium_annual')
  })
})
