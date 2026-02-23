'use server'

import { createClient } from '@/lib/supabase/server'
import { businessSchema, locationSchema } from '@/lib/validations'
import { slugify } from '@/lib/utils'
import { quickBlacklistCheck } from '@/lib/blacklist'
import { revalidatePath } from 'next/cache'

// ─── Helpers ────────────────────────────────────────────────────────

function generateRandomSuffix(length = 4): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('You must be logged in to perform this action')
  }

  return { supabase, user }
}

async function verifyBusinessOwnership(businessId: string) {
  const { supabase, user } = await getAuthenticatedUser()

  const { data: business, error } = await supabase
    .from('businesses')
    .select('id, owner_id')
    .eq('id', businessId)
    .single()

  if (error || !business) {
    throw new Error('Business not found')
  }

  if (business.owner_id !== user.id) {
    throw new Error('You do not have permission to modify this business')
  }

  return { supabase, user, business }
}

// ─── Server Actions ─────────────────────────────────────────────────

export async function createBusinessDraft(formData: FormData) {
  const { supabase, user } = await getAuthenticatedUser()

  // Check if the user already has a business
  const { data: existing } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (existing) {
    return { error: 'You already have a business listing' }
  }

  // Validate form data
  const rawData = {
    name: formData.get('name') as string,
    description: formData.get('description') as string,
    phone: formData.get('phone') as string,
    email_contact: formData.get('email_contact') as string,
    website: formData.get('website') as string,
    abn: formData.get('abn') as string,
  }

  const parsed = businessSchema.safeParse(rawData)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  // Blacklist check
  const blockedTerm = quickBlacklistCheck(parsed.data.name)
  if (blockedTerm) {
    return { error: `Business name contains a blocked term: "${blockedTerm}". This type of business is not permitted on our platform.` }
  }

  // Generate a unique slug
  let slug = slugify(parsed.data.name)

  const { data: slugExists } = await supabase
    .from('businesses')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (slugExists) {
    slug = `${slug}-${generateRandomSuffix()}`
  }

  // Insert the business as draft
  const { data: business, error } = await supabase
    .from('businesses')
    .insert({
      owner_id: user.id,
      name: parsed.data.name,
      slug,
      description: parsed.data.description || null,
      phone: parsed.data.phone || null,
      email_contact: parsed.data.email_contact || null,
      website: parsed.data.website || null,
      abn: parsed.data.abn || null,
      status: 'draft',
      claim_status: 'claimed',
      listing_source: 'manual',
    })
    .select()
    .single()

  if (error) {
    return { error: 'Failed to create business. Please try again.' }
  }

  // Insert business_contacts row
  await supabase.from('business_contacts').insert({
    business_id: business.id,
    phone: parsed.data.phone || null,
    email: parsed.data.email_contact || null,
    website: parsed.data.website || null,
  })

  // Run verification inline (best-effort, don't block creation)
  try {
    const { runVerification } = await import('@/app/actions/verification')
    await Promise.race([
      runVerification(business.id, 'create'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ])
  } catch {
    // Verification failure shouldn't block business creation
  }

  revalidatePath('/dashboard')
  return { data: business }
}

export async function updateBusiness(businessId: string, formData: FormData) {
  const { supabase } = await verifyBusinessOwnership(businessId)

  const rawData = {
    name: formData.get('name') as string,
    description: formData.get('description') as string,
    phone: formData.get('phone') as string,
    email_contact: formData.get('email_contact') as string,
    website: formData.get('website') as string,
    abn: formData.get('abn') as string,
  }

  const parsed = businessSchema.safeParse(rawData)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  const { data: business, error } = await supabase
    .from('businesses')
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      phone: parsed.data.phone || null,
      email_contact: parsed.data.email_contact || null,
      website: parsed.data.website || null,
      abn: parsed.data.abn || null,
    })
    .eq('id', businessId)
    .select()
    .single()

  if (error) {
    return { error: 'Failed to update business. Please try again.' }
  }

  // Sync business_contacts
  await supabase
    .from('business_contacts')
    .upsert({
      business_id: businessId,
      phone: parsed.data.phone || null,
      email: parsed.data.email_contact || null,
      website: parsed.data.website || null,
    }, { onConflict: 'business_id' })

  // Re-run verification (best-effort)
  try {
    const { runVerification } = await import('@/app/actions/verification')
    await Promise.race([
      runVerification(businessId, 'update'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ])
  } catch {
    // Verification failure shouldn't block update
  }

  revalidatePath('/dashboard')
  revalidatePath(`/business/${business.slug}`)
  return { data: business }
}

export async function updateBusinessLocation(
  businessId: string,
  formData: FormData
) {
  const { supabase } = await verifyBusinessOwnership(businessId)

  const rawData = {
    address_text: (formData.get('address_text') as string) || undefined,
    suburb: formData.get('suburb') as string,
    state: formData.get('state') as string,
    postcode: formData.get('postcode') as string,
    service_radius_km: Number(formData.get('service_radius_km')),
  }

  const parsed = locationSchema.safeParse(rawData)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  // Look up lat/lng from postcodes table
  const { data: postcodeData } = await supabase
    .from('postcodes')
    .select('lat, lng')
    .eq('postcode', parsed.data.postcode)
    .eq('suburb', parsed.data.suburb.toUpperCase())
    .maybeSingle()

  // Fall back to postcode-only lookup if exact match fails
  let lat: number | null = null
  let lng: number | null = null

  if (postcodeData) {
    lat = postcodeData.lat
    lng = postcodeData.lng
  } else {
    const { data: fallback } = await supabase
      .from('postcodes')
      .select('lat, lng')
      .eq('postcode', parsed.data.postcode)
      .limit(1)
      .maybeSingle()

    if (fallback) {
      lat = fallback.lat
      lng = fallback.lng
    }
  }

  // Check if a location already exists for this business
  const { data: existingLocation } = await supabase
    .from('business_locations')
    .select('id')
    .eq('business_id', businessId)
    .maybeSingle()

  // Build the location data. We use RPC for the geom column since the
  // Supabase JS client cannot construct PostGIS geography values directly.
  if (existingLocation) {
    // Update existing location
    const { error } = await supabase.rpc('upsert_business_location', {
      p_business_id: businessId,
      p_address_text: parsed.data.address_text || null,
      p_suburb: parsed.data.suburb,
      p_state: parsed.data.state,
      p_postcode: parsed.data.postcode,
      p_lat: lat,
      p_lng: lng,
      p_service_radius_km: parsed.data.service_radius_km,
    })

    if (error) {
      // Fallback: update without geom (if the RPC doesn't exist yet)
      const { error: updateError } = await supabase
        .from('business_locations')
        .update({
          address_text: parsed.data.address_text || null,
          suburb: parsed.data.suburb,
          state: parsed.data.state,
          postcode: parsed.data.postcode,
          lat,
          lng,
          service_radius_km: parsed.data.service_radius_km,
        })
        .eq('id', existingLocation.id)

      if (updateError) {
        return { error: 'Failed to update location. Please try again.' }
      }
    }
  } else {
    // Insert new location
    const { error } = await supabase.rpc('upsert_business_location', {
      p_business_id: businessId,
      p_address_text: parsed.data.address_text || null,
      p_suburb: parsed.data.suburb,
      p_state: parsed.data.state,
      p_postcode: parsed.data.postcode,
      p_lat: lat,
      p_lng: lng,
      p_service_radius_km: parsed.data.service_radius_km,
    })

    if (error) {
      // Fallback: insert without geom (if the RPC doesn't exist yet)
      const { error: insertError } = await supabase
        .from('business_locations')
        .insert({
          business_id: businessId,
          address_text: parsed.data.address_text || null,
          suburb: parsed.data.suburb,
          state: parsed.data.state,
          postcode: parsed.data.postcode,
          lat,
          lng,
          service_radius_km: parsed.data.service_radius_km,
        })

      if (insertError) {
        return { error: 'Failed to save location. Please try again.' }
      }
    }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function updateBusinessCategories(
  businessId: string,
  categoryIds: string[]
) {
  const { supabase } = await verifyBusinessOwnership(businessId)

  if (categoryIds.length === 0) {
    return { error: 'Select at least one category' }
  }

  if (categoryIds.length > 5) {
    return { error: 'You can select up to 5 categories' }
  }

  // Delete existing categories
  const { error: deleteError } = await supabase
    .from('business_categories')
    .delete()
    .eq('business_id', businessId)

  if (deleteError) {
    return { error: 'Failed to update categories. Please try again.' }
  }

  // Insert new categories
  const rows = categoryIds.map((categoryId) => ({
    business_id: businessId,
    category_id: categoryId,
  }))

  const { error: insertError } = await supabase
    .from('business_categories')
    .insert(rows)

  if (insertError) {
    return { error: 'Failed to save categories. Please try again.' }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function publishBusiness(businessId: string) {
  const { supabase } = await verifyBusinessOwnership(businessId)

  // Check verification status
  const { data: biz } = await supabase
    .from('businesses')
    .select('verification_status')
    .eq('id', businessId)
    .single()

  if (biz && biz.verification_status !== 'approved') {
    return { error: 'verification_required' }
  }

  // Check if there is an active subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('business_id', businessId)
    .maybeSingle()

  if (
    !subscription ||
    !['active', 'past_due'].includes(subscription.status)
  ) {
    return { error: 'subscription_required' }
  }

  const { error } = await supabase
    .from('businesses')
    .update({ status: 'published' })
    .eq('id', businessId)

  if (error) {
    return { error: 'Failed to publish business. Please try again.' }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function unpublishBusiness(businessId: string) {
  const { supabase, user } = await getAuthenticatedUser()

  // Verify the user is the owner or an admin
  const { data: business } = await supabase
    .from('businesses')
    .select('id, owner_id, slug')
    .eq('id', businessId)
    .single()

  if (!business) {
    throw new Error('Business not found')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (business.owner_id !== user.id && profile?.role !== 'admin') {
    throw new Error('You do not have permission to unpublish this business')
  }

  const { error } = await supabase
    .from('businesses')
    .update({ status: 'draft' })
    .eq('id', businessId)

  if (error) {
    return { error: 'Failed to unpublish business. Please try again.' }
  }

  revalidatePath('/dashboard')
  revalidatePath(`/business/${business.slug}`)
  return { success: true }
}

export async function getMyBusiness() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: business, error } = await supabase
    .from('businesses')
    .select(
      `
      *,
      business_locations (*),
      business_categories (
        category_id,
        categories (*)
      ),
      photos (*),
      testimonials (*),
      subscriptions (*)
    `
    )
    .eq('owner_id', user.id)
    .maybeSingle()

  if (error || !business) {
    return null
  }

  // Flatten subscription (one-to-one relationship)
  const subscription = Array.isArray(business.subscriptions)
    ? business.subscriptions[0] ?? null
    : business.subscriptions

  // Flatten location (one-to-one relationship)
  const location = Array.isArray(business.business_locations)
    ? business.business_locations[0] ?? null
    : business.business_locations

  return {
    ...business,
    location,
    subscription,
    categories: business.business_categories,
    photos: business.photos ?? [],
    testimonials: business.testimonials ?? [],
  }
}

export async function getBusinessBySlug(slug: string) {
  const supabase = await createClient()

  const { data: business, error } = await supabase
    .from('businesses')
    .select(
      `
      *,
      business_locations (*),
      business_categories (
        category_id,
        categories (*)
      ),
      photos (*),
      testimonials (*)
    `
    )
    .eq('slug', slug)
    .neq('status', 'suspended')
    .maybeSingle()

  if (error || !business) {
    return null
  }

  // Non-seed manual listings need a subscription to be visible
  if (business.listing_source === 'manual' && !business.is_seed) {
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('business_id', business.id)
      .maybeSingle()

    if (
      !subscription ||
      !['active', 'past_due'].includes(subscription.status)
    ) {
      // Allow owner to see their own draft/unpublished business
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.id !== business.owner_id) {
        return null
      }
    }
  }

  // Calculate average rating
  const testimonials = business.testimonials ?? []
  const avgRating =
    testimonials.length > 0
      ? Math.round(
          (testimonials.reduce(
            (sum: number, t: { rating: number }) => sum + t.rating,
            0
          ) /
            testimonials.length) *
            10
        ) / 10
      : null

  // Flatten location
  const location = Array.isArray(business.business_locations)
    ? business.business_locations[0] ?? null
    : business.business_locations

  return {
    ...business,
    location,
    categories: business.business_categories,
    photos: (business.photos ?? []).sort(
      (a: { sort_order: number }, b: { sort_order: number }) =>
        a.sort_order - b.sort_order
    ),
    testimonials,
    avgRating,
    reviewCount: testimonials.length,
  }
}
