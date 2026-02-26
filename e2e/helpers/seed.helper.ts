import { supabaseAdmin } from './supabase.helper'
import { TEST_PREFIX, E2E_USER_EMAIL } from './constants'

export async function seedJourneyData() {
  // Look up the test user's ID to use as owner_id
  const { data: users } = await supabaseAdmin.auth.admin.listUsers()
  const testUser = users?.users?.find(u => u.email === E2E_USER_EMAIL)
  if (!testUser) {
    console.error('[E2E] Seed: test user not found, skipping business seeding')
    return []
  }
  const ownerId = testUser.id

  // Create test businesses
  const businesses = [
    {
      name: `${TEST_PREFIX}-sydney-plumber`,
      slug: `${TEST_PREFIX}-sydney-plumber`,
      description: `${TEST_PREFIX} test business in Sydney`,
      status: 'published',
      verification_status: 'approved',
      listing_source: 'manual',
      billing_status: 'active',
      phone: '0400000001',
      email_contact: 'sydney@example.com',
      website: 'https://example.com',
      owner_id: ownerId,
    },
    {
      name: `${TEST_PREFIX}-brisbane-cleaner`,
      slug: `${TEST_PREFIX}-brisbane-cleaner`,
      description: `${TEST_PREFIX} test business in Brisbane`,
      status: 'published',
      verification_status: 'approved',
      listing_source: 'manual',
      billing_status: 'active',
      phone: '0400000002',
      owner_id: ownerId,
    },
    {
      name: `${TEST_PREFIX}-unclaimed-business`,
      slug: `${TEST_PREFIX}-unclaimed-business`,
      description: `${TEST_PREFIX} unclaimed seed listing`,
      status: 'published',
      verification_status: 'approved',
      listing_source: 'osm',
      billing_status: 'active',
      claim_status: 'unclaimed',
      owner_id: ownerId,
    },
  ]

  const createdBusinesses: any[] = []
  for (const biz of businesses) {
    const { data, error } = await supabaseAdmin
      .from('businesses')
      .upsert(biz, { onConflict: 'slug' })
      .select()
      .single()
    if (error) {
      console.error(`Failed to seed business ${biz.name}:`, error.message)
      continue
    }
    createdBusinesses.push(data)
  }

  // Add locations
  for (const biz of createdBusinesses) {
    const location = biz.name.includes('sydney')
      ? { suburb: 'Sydney', state: 'NSW', postcode: '2000', lat: -33.8688, lng: 151.2093 }
      : { suburb: 'Brisbane', state: 'QLD', postcode: '4000', lat: -27.4698, lng: 153.0251 }

    await supabaseAdmin.from('business_locations').upsert({
      business_id: biz.id,
      ...location,
      service_radius_km: 25,
    }, { onConflict: 'business_id' })
  }

  return createdBusinesses
}

export async function cleanupJourneyData() {
  // Delete businesses with test prefix (cascades to locations, etc.)
  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .like('slug', `${TEST_PREFIX}%`)

  if (businesses && businesses.length > 0) {
    const ids = businesses.map(b => b.id)
    await supabaseAdmin.from('business_locations').delete().in('business_id', ids)
    await supabaseAdmin.from('business_categories').delete().in('business_id', ids)
    await supabaseAdmin.from('subscriptions').delete().in('business_id', ids)
    await supabaseAdmin.from('photos').delete().in('business_id', ids)
    await supabaseAdmin.from('testimonials').delete().in('business_id', ids)
    await supabaseAdmin.from('verification_jobs').delete().in('business_id', ids)
    await supabaseAdmin.from('businesses').delete().in('id', ids)
  }
}
