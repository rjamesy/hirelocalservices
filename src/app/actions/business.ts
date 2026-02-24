'use server'

import { createClient } from '@/lib/supabase/server'
import { businessSchema, locationSchema } from '@/lib/validations'
import { slugify } from '@/lib/utils'
import { quickBlacklistCheck } from '@/lib/blacklist'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit'
import { getUserListingCapacity } from '@/lib/listing-limits'

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

  // Check listing capacity based on user's plan tier
  const capacity = await getUserListingCapacity(supabase, user.id)
  if (!capacity.canClaimMore) {
    return {
      error:
        capacity.maxAllowed === 1
          ? 'You already have a business listing'
          : `You have reached your limit of ${capacity.maxAllowed} listings.`,
    }
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

  await logAudit(supabase, {
    action: 'listing_created',
    entityType: 'listing',
    entityId: business.id,
    actorId: user.id,
    details: {
      listing_name: parsed.data.name,
      new_status: 'draft',
    },
  })

  revalidatePath('/dashboard')
  return { data: business }
}

export async function updateBusiness(businessId: string, formData: FormData) {
  const { supabase, user } = await verifyBusinessOwnership(businessId)

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

  // Fetch current business status
  const { data: currentBiz } = await supabase
    .from('businesses')
    .select('status, slug, billing_status')
    .eq('id', businessId)
    .single()

  if (currentBiz?.billing_status === 'billing_suspended') {
    return { error: 'This listing is suspended due to billing. Please upgrade your plan.' }
  }

  const isLive = currentBiz?.status === 'published' || currentBiz?.status === 'paused'

  if (isLive) {
    // Published/paused: write to pending_changes only — live version unchanged
    const pendingChanges = {
      name: parsed.data.name,
      description: parsed.data.description || null,
      phone: parsed.data.phone || null,
      email_contact: parsed.data.email_contact || null,
      website: parsed.data.website || null,
      abn: parsed.data.abn || null,
    }

    const { data: business, error } = await supabase
      .from('businesses')
      .update({ pending_changes: pendingChanges as unknown as Record<string, unknown> })
      .eq('id', businessId)
      .select()
      .single()

    if (error) {
      return { error: 'Failed to save draft changes. Please try again.' }
    }

    await logAudit(supabase, {
      action: 'listing_updated',
      entityType: 'listing',
      entityId: businessId,
      actorId: user.id,
      details: { listing_name: parsed.data.name, draft_save: true },
    })

    revalidatePath('/dashboard')
    return { data: business }
  }

  // Draft: write directly to main columns (not public)
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

  // Sync business_contacts for drafts
  await supabase
    .from('business_contacts')
    .upsert({
      business_id: businessId,
      phone: parsed.data.phone || null,
      email: parsed.data.email_contact || null,
      website: parsed.data.website || null,
    }, { onConflict: 'business_id' })

  // Re-run verification for drafts (best-effort)
  try {
    const { runVerification } = await import('@/app/actions/verification')
    await Promise.race([
      runVerification(businessId, 'update'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ])
  } catch {
    // Verification failure shouldn't block update
  }

  await logAudit(supabase, {
    action: 'listing_updated',
    entityType: 'listing',
    entityId: businessId,
    actorId: user.id,
    details: { listing_name: parsed.data.name },
  })

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

export async function publishChanges(businessId: string) {
  const { supabase, user } = await verifyBusinessOwnership(businessId)

  // Check user subscription
  const { data: userSub } = await supabase
    .from('user_subscriptions')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!userSub || !['active', 'past_due'].includes(userSub.status)) {
    return { error: 'subscription_required' }
  }

  // Fetch current business
  const { data: biz } = await supabase
    .from('businesses')
    .select(`
      id, name, description, phone, email_contact, website, abn,
      status, slug, pending_changes, verification_status, billing_status,
      business_locations (lat, lng),
      business_contacts (phone, email)
    `)
    .eq('id', businessId)
    .single()

  if (!biz) {
    return { error: 'Business not found' }
  }

  if ((biz as any).billing_status === 'billing_suspended') {
    return { error: 'This listing is suspended due to billing. Please upgrade your plan.' }
  }

  // Determine the content to validate: pending_changes merged with main columns
  const pending = (biz.pending_changes ?? {}) as Record<string, unknown>
  const contentToValidate = {
    name: (pending.name as string) ?? biz.name,
    description: (pending.description as string | null) ?? biz.description,
    phone: (pending.phone as string | null) ?? biz.phone,
    email_contact: (pending.email_contact as string | null) ?? biz.email_contact,
    website: (pending.website as string | null) ?? biz.website,
    abn: (pending.abn as string | null) ?? biz.abn,
  }

  // Run verification pipeline
  const {
    runDeterministicChecks,
    runAIContentReview,
    makeVerificationDecision,
  } = await import('@/lib/verification')

  const rawLocations = biz.business_locations as any
  const location = Array.isArray(rawLocations) ? rawLocations[0] : rawLocations
  const rawContacts = biz.business_contacts as any
  const contact = Array.isArray(rawContacts) ? rawContacts[0] : rawContacts

  // Fetch nearby businesses for duplicate check
  const { data: nearbyBusinesses } = await supabase
    .from('businesses')
    .select('name, business_locations (lat, lng)')
    .neq('id', businessId)
    .limit(100)

  const existingForCheck = (nearbyBusinesses ?? []).map((b: any) => {
    const loc = Array.isArray(b.business_locations) ? b.business_locations[0] : null
    return { name: b.name, lat: loc?.lat ?? null, lng: loc?.lng ?? null }
  })

  const deterministic = runDeterministicChecks(
    {
      name: contentToValidate.name,
      description: contentToValidate.description,
      phone: contact?.phone ?? contentToValidate.phone,
      email: contact?.email ?? contentToValidate.email_contact,
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
    },
    existingForCheck
  )

  const aiResult = await runAIContentReview({
    name: contentToValidate.name,
    description: contentToValidate.description,
    phone: contact?.phone ?? contentToValidate.phone,
    email: contact?.email ?? contentToValidate.email_contact,
    lat: location?.lat ?? null,
    lng: location?.lng ?? null,
  })

  const decision = makeVerificationDecision(
    deterministic,
    aiResult,
    contentToValidate.name,
    contentToValidate.description
  )

  // Create verification job
  await supabase.from('verification_jobs').insert({
    business_id: businessId,
    status: decision,
    deterministic_result: deterministic as unknown as Record<string, unknown>,
    ai_result: aiResult as unknown as Record<string, unknown> | null,
    final_decision: decision,
  } as any)

  if (decision === 'approved') {
    // Apply pending_changes to main columns
    const updateData: Record<string, unknown> = {
      ...contentToValidate,
      pending_changes: null,
      status: 'published',
      verification_status: 'approved',
    }

    await supabase.from('businesses').update(updateData).eq('id', businessId)

    // Sync business_contacts
    await supabase
      .from('business_contacts')
      .upsert({
        business_id: businessId,
        phone: contentToValidate.phone || null,
        email: contentToValidate.email_contact || null,
        website: contentToValidate.website || null,
      }, { onConflict: 'business_id' })

    // Refresh search index
    await supabase.rpc('refresh_search_index', { p_business_id: businessId })

    await logAudit(supabase, {
      action: 'listing_updated',
      entityType: 'listing',
      entityId: businessId,
      actorId: user.id,
      details: { listing_name: contentToValidate.name, published: true },
    })

    revalidatePath('/dashboard')
    revalidatePath(`/business/${biz.slug}`)
    return { success: true, published: true }
  }

  // Pending/rejected: keep pending_changes intact, set verification_status
  await supabase
    .from('businesses')
    .update({ verification_status: 'pending' })
    .eq('id', businessId)

  revalidatePath('/dashboard')
  revalidatePath('/admin/verification')
  return {
    success: true,
    published: false,
    message: 'Your listing changes are being reviewed. Your live listing is unchanged.',
  }
}

export async function pauseBusiness(businessId: string) {
  const { supabase, user } = await verifyBusinessOwnership(businessId)

  const { data: biz } = await supabase
    .from('businesses')
    .select('status')
    .eq('id', businessId)
    .single()

  if (!biz || biz.status !== 'published') {
    return { error: 'Only published listings can be paused' }
  }

  const { error } = await supabase
    .from('businesses')
    .update({ status: 'paused' })
    .eq('id', businessId)

  if (error) {
    return { error: 'Failed to pause listing. Please try again.' }
  }

  // Refresh search index to remove from search
  await supabase.rpc('refresh_search_index', { p_business_id: businessId })

  await logAudit(supabase, {
    action: 'listing_updated',
    entityType: 'listing',
    entityId: businessId,
    actorId: user.id,
    details: { status_change: 'published -> paused' },
  })

  revalidatePath('/dashboard')
  return { success: true }
}

export async function unpauseBusiness(businessId: string) {
  const { supabase, user } = await verifyBusinessOwnership(businessId)

  const { data: biz } = await supabase
    .from('businesses')
    .select('status, verification_status')
    .eq('id', businessId)
    .single()

  if (!biz || biz.status !== 'paused') {
    return { error: 'Only paused listings can be unpaused' }
  }

  if (biz.verification_status !== 'approved') {
    return { error: 'Your listing must be verified before unpausing' }
  }

  // Check user subscription
  const { data: userSub } = await supabase
    .from('user_subscriptions')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!userSub || !['active', 'past_due'].includes(userSub.status)) {
    return { error: 'subscription_required' }
  }

  const { error } = await supabase
    .from('businesses')
    .update({ status: 'published' })
    .eq('id', businessId)

  if (error) {
    return { error: 'Failed to unpause listing. Please try again.' }
  }

  // Refresh search index to add back to search
  await supabase.rpc('refresh_search_index', { p_business_id: businessId })

  await logAudit(supabase, {
    action: 'listing_updated',
    entityType: 'listing',
    entityId: businessId,
    actorId: user.id,
    details: { status_change: 'paused -> published' },
  })

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

export async function getMyBusinesses() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const { data } = await supabase
    .from('businesses')
    .select('id, name, slug, status, billing_status')
    .eq('owner_id', user.id)
    .eq('is_seed', false)
    .order('created_at', { ascending: false })

  return data ?? []
}

export async function getMyBusiness(selectedId?: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  // If a specific business was requested, fetch it directly (verify ownership)
  if (selectedId) {
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
      .eq('id', selectedId)
      .eq('owner_id', user.id)
      .eq('is_seed', false)
      .maybeSingle()

    if (error || !business) return null

    const location = Array.isArray(business.business_locations)
      ? business.business_locations[0] ?? null
      : business.business_locations

    return {
      ...business,
      location,
      subscription: null,
      categories: business.business_categories,
      photos: business.photos ?? [],
      testimonials: business.testimonials ?? [],
    }
  }

  const { data: businesses, error } = await supabase
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
    .eq('owner_id', user.id)
    .eq('is_seed', false)
    .order('created_at', { ascending: false })

  // Pick the best listing: prefer published+claimed, then published, then most recent
  const business = businesses?.sort((a, b) => {
    const score = (biz: typeof a) =>
      (biz.status === 'published' ? 2 : 0) + (biz.claim_status === 'claimed' ? 1 : 0)
    return score(b) - score(a)
  })[0] ?? null

  if (error || !business) {
    return null
  }

  // Flatten location (one-to-one relationship)
  const location = Array.isArray(business.business_locations)
    ? business.business_locations[0] ?? null
    : business.business_locations

  return {
    ...business,
    location,
    subscription: null,
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

  // billing_suspended listings are hidden from non-owners
  if (business.billing_status === 'billing_suspended') {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user || user.id !== business.owner_id) {
      return null
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
