'use server'

import { createClient } from '@/lib/supabase/server'
import { createBusinessSchema, locationSchema } from '@/lib/validations'
import { slugify } from '@/lib/utils'
import { quickBlacklistCheck } from '@/lib/blacklist'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit'
import { getSystemFlagsSafe, requireEmailVerified, verifyCaptcha, logAbuseEvent } from '@/lib/protection'
import { checkRateLimit, listingCreateLimiter } from '@/lib/rate-limiter'
import { getUserEntitlements, type Entitlements } from '@/lib/entitlements'
import { getListingEligibility } from '@/lib/search/eligibility'
import { getListingQuality, type QualityFlags } from '@/lib/listing-quality'
import * as pwService from '@/lib/pw-service'

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

  // ── Protection guards ──────────────────────────────────────────────
  const flags = await getSystemFlagsSafe()
  if (!flags.listings_enabled) {
    return { error: 'Listing creation is currently disabled. Please try again later.' }
  }
  try {
    await checkRateLimit(listingCreateLimiter, user.id, 'rejected_listing')
  } catch {
    return { error: 'Too many requests. Please try again later.' }
  }
  try {
    requireEmailVerified(user)
  } catch {
    return { error: 'Please verify your email address before creating a listing.' }
  }

  // Check listing capacity via canonical entitlements (hard cap on total drafts + published)
  const entitlements = await getUserEntitlements(supabase, user.id)
  if (!entitlements.canCreateMore) {
    return {
      error:
        entitlements.maxListings === 1
          ? 'You already have a business listing'
          : `You have reached your limit of ${entitlements.maxListings} listings.`,
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

  const parsed = createBusinessSchema(entitlements.descriptionLimit).safeParse(rawData)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  // Blacklist check
  const blockedTerm = quickBlacklistCheck(parsed.data.name)
  if (blockedTerm) {
    return { error: `Business name contains a blocked term: "${blockedTerm}". This type of business is not permitted on our platform.` }
  }

  // Generate a unique slug with retry on conflict (prevents TOCTOU race)
  let slug = slugify(parsed.data.name)
  let business: any = null

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      slug = `${slugify(parsed.data.name)}-${generateRandomSuffix()}`
    } else {
      const { data: slugExists } = await supabase
        .from('businesses')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()
      if (slugExists) {
        slug = `${slug}-${generateRandomSuffix()}`
      }
    }

    const { data, error: insertError } = await supabase
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

    if (!insertError) {
      business = data
      break
    }

    // Retry on unique constraint violation (slug collision)
    if (insertError.code === '23505' && insertError.message?.includes('slug')) {
      continue
    }

    return { error: 'Failed to create business. Please try again.' }
  }

  if (!business) {
    return { error: 'Failed to generate a unique URL for your business. Please try again.' }
  }

  // Insert business_contacts row
  await supabase.from('business_contacts').insert({
    business_id: business.id,
    phone: parsed.data.phone || null,
    email: parsed.data.email_contact || null,
    website: parsed.data.website || null,
  })

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

  // ── P/W dual-write: create W(draft, new) ────────────────────────
  await pwService.dualWrite('createBusinessDraft', () =>
    pwService.createWorking(business.id, 'new', {
      name: parsed.data.name,
      description: parsed.data.description || null,
      phone: parsed.data.phone || null,
      email_contact: parsed.data.email_contact || null,
      website: parsed.data.website || null,
      abn: parsed.data.abn || null,
    })
  )

  revalidatePath('/dashboard')
  return { data: business }
}

export async function updateBusiness(businessId: string, formData: FormData) {
  const { supabase, user } = await verifyBusinessOwnership(businessId)

  // Get entitlements for tier-specific validation
  const entitlements = await getUserEntitlements(supabase, user.id)

  const rawData = {
    name: formData.get('name') as string,
    description: formData.get('description') as string,
    phone: formData.get('phone') as string,
    email_contact: formData.get('email_contact') as string,
    website: formData.get('website') as string,
    abn: formData.get('abn') as string,
  }

  const parsed = createBusinessSchema(entitlements.descriptionLimit).safeParse(rawData)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  // Guard: block edits while under review
  const guard = await pwService.getEditGuard(businessId)
  if (guard.underReview) {
    return { error: 'This listing is currently under review and cannot be edited.' }
  }

  // Fetch slug + billing status (still needed from businesses)
  const { data: currentBiz } = await supabase
    .from('businesses')
    .select('slug, billing_status')
    .eq('id', businessId)
    .single()

  if (currentBiz?.billing_status === 'billing_suspended') {
    return { error: 'This listing is suspended due to billing. Please upgrade your plan.' }
  }

  const isLive = guard.isLive

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

    // ── P/W dual-write: update W text fields (live listing edit) ────
    await pwService.dualWrite('updateBusiness:live', () =>
      pwService.updateWorking(businessId, {
        name: parsed.data.name,
        description: parsed.data.description || null,
        phone: parsed.data.phone || null,
        email_contact: parsed.data.email_contact || null,
        website: parsed.data.website || null,
        abn: parsed.data.abn || null,
      })
    )

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

  await logAudit(supabase, {
    action: 'listing_updated',
    entityType: 'listing',
    entityId: businessId,
    actorId: user.id,
    details: { listing_name: parsed.data.name },
  })

  // ── P/W dual-write: update W text fields (draft) ─────────────────
  await pwService.dualWrite('updateBusiness:draft', () =>
    pwService.updateWorking(businessId, {
      name: parsed.data.name,
      description: parsed.data.description || null,
      phone: parsed.data.phone || null,
      email_contact: parsed.data.email_contact || null,
      website: parsed.data.website || null,
      abn: parsed.data.abn || null,
    })
  )

  revalidatePath('/dashboard')
  revalidatePath(`/business/${business.slug}`)
  return { data: business }
}

export async function updateBusinessLocation(
  businessId: string,
  formData: FormData
) {
  const { supabase } = await verifyBusinessOwnership(businessId)

  // Guard: block edits while under review
  const guard = await pwService.getEditGuard(businessId)
  if (guard.underReview) {
    return { error: 'This listing is currently under review and cannot be edited.' }
  }

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

  // ── P/W dual-write: update W location fields ─────────────────────
  await pwService.dualWrite('updateBusinessLocation', () =>
    pwService.updateWorking(businessId, {
      address_text: parsed.data.address_text || null,
      suburb: parsed.data.suburb,
      state: parsed.data.state,
      postcode: parsed.data.postcode,
      lat,
      lng,
      service_radius_km: parsed.data.service_radius_km,
    })
  )

  revalidatePath('/dashboard')
  return { success: true }
}

export async function updateBusinessCategories(
  businessId: string,
  primaryCategoryId: string,
  secondaryCategoryIds: string[]
) {
  const { supabase } = await verifyBusinessOwnership(businessId)

  // Guard: block edits while under review
  const guard = await pwService.getEditGuard(businessId)
  if (guard.underReview) {
    return { error: 'This listing is currently under review and cannot be edited.' }
  }

  if (!primaryCategoryId) {
    return { error: 'Select a primary category' }
  }

  if (secondaryCategoryIds.length > 3) {
    return { error: 'You can select up to 3 additional categories' }
  }

  // Atomic RPC: delete + insert in single DB transaction
  const { error } = await supabase.rpc('upsert_business_categories', {
    p_business_id: businessId,
    p_primary_id: primaryCategoryId,
    p_secondary_ids: secondaryCategoryIds,
  })

  if (error) {
    const msg = error.message || ''
    if (msg.includes('group category')) {
      return { error: 'Cannot select a category group. Choose a specific service.' }
    }
    if (msg.includes('same group')) {
      return { error: 'Secondary categories must be in the same group as the primary category.' }
    }
    if (msg.includes('Primary category must be set')) {
      return { error: 'Primary category must be set before adding secondary categories.' }
    }
    if (msg.includes('permission')) {
      return { error: 'You do not have permission to modify this business.' }
    }
    if (msg.includes('up to 3')) {
      return { error: 'You can select up to 3 additional categories.' }
    }
    return {
      error: process.env.NODE_ENV === 'development'
        ? `Failed to save categories: ${msg}`
        : 'Failed to save categories. Please try again.',
    }
  }

  // ── P/W dual-write: update W category fields ────────────────────
  await pwService.dualWrite('updateBusinessCategories', () =>
    pwService.updateWorking(businessId, {
      primary_category_id: primaryCategoryId,
      secondary_category_ids: secondaryCategoryIds,
    })
  )

  revalidatePath('/dashboard')
  return { success: true }
}

export async function publishChanges(businessId: string, captchaToken?: string) {
  const { supabase, user } = await verifyBusinessOwnership(businessId)

  // ── Suspension guard (defense in depth — middleware also blocks) ───
  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('suspended_at')
    .eq('id', user.id)
    .single()
  if (callerProfile?.suspended_at) {
    return { error: 'Your account has been suspended.' }
  }

  // ── Protection guard ───────────────────────────────────────────────
  const publishFlags = await getSystemFlagsSafe()
  if (!publishFlags.listings_enabled) {
    return { error: 'Listing publishing is currently disabled. Please try again later.' }
  }

  // ── CAPTCHA verification ──────────────────────────────────────────
  if (publishFlags.captcha_required) {
    if (!captchaToken) {
      return { error: 'Please complete the captcha verification.' }
    }
    const captchaResult = await verifyCaptcha(captchaToken)
    if (!captchaResult.success) {
      await logAbuseEvent('captcha_failure', null, user.id, { context: 'listing_publish' })
      return { error: 'Captcha verification failed. Please try again.' }
    }
  }

  // Check user subscription + plan tier gating via canonical gate
  const entitlements = await getUserEntitlements(supabase, user.id)

  // Block publish when subscription is past due (active but payment unresolved)
  if (!entitlements.canPublish && entitlements.isActive) {
    return { error: 'Your subscription payment is past due. Please update your payment method to publish.' }
  }

  const { computeCheckoutGate, checkPlanSufficiency } = await import('@/lib/required-plan')
  const gateResult = await computeCheckoutGate(supabase, user.id, businessId)
  const gatingError = checkPlanSufficiency(entitlements.plan, gateResult)
  if (gatingError) {
    return {
      error: gatingError.code === 'SUBSCRIPTION_REQUIRED'
        ? 'subscription_required'
        : 'upgrade_required',
      gating: {
        code: gatingError.code,
        minimumPlan: gatingError.minimumPlan,
        currentPlan: gatingError.currentPlan,
        allowedPlans: gatingError.allowedPlans,
        reasons: gatingError.reasons,
        photoCount: gateResult.photoCount,
        testimonialCount: gateResult.testimonialCount,
        otherListingsCount: gateResult.otherListingsCount,
        returnTo: gateResult.returnTo,
      },
    }
  }

  // Atomic publish lock — prevents concurrent publish attempts (TOCTOU race)
  const { data: lockAcquired } = await supabase.rpc('claim_publish_lock', {
    p_business_id: businessId,
  })
  if (!lockAcquired) {
    return { error: 'A publish is already in progress for this listing. Please wait and try again.' }
  }

  // Guard: block resubmission while under review
  const guard = await pwService.getEditGuard(businessId)
  if (guard.underReview) {
    return { error: 'This listing is currently under review and cannot be resubmitted.' }
  }

  // Fetch current business
  const { data: biz } = await supabase
    .from('businesses')
    .select(`
      id, name, description, phone, email_contact, website, abn,
      slug, pending_changes, billing_status,
      duplicate_user_choice,
      business_locations (lat, lng),
      business_contacts (phone, email)
    `)
    .eq('id', businessId)
    .single()

  if (!biz) {
    return { error: 'Business not found' }
  }

  const bizBillingStatus = (biz as any).billing_status as string
  if (['billing_suspended', 'paused_subscription_expired', 'paused_payment_failed'].includes(bizBillingStatus)) {
    return { error: 'This listing is suspended due to billing. Please update your subscription.' }
  }

  // Duplicate detection guard: require choice when strong match exists (>= 85)
  if (!(biz as any).duplicate_user_choice) {
    const dupeResult = await findPotentialDuplicates(businessId)
    const topScore = dupeResult.candidates[0]?.score ?? 0
    if (topScore >= 85) {
      return { error: 'Please review potential duplicate matches before publishing.' }
    }
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

  // ── Contact method validation: at least one required ─────────────
  const hasContactMethod = Boolean(
    contentToValidate.phone?.trim() ||
    contentToValidate.email_contact?.trim() ||
    contentToValidate.website?.trim()
  )
  if (!hasContactMethod) {
    return { error: 'At least one contact method (phone, email, or website) is required to publish.' }
  }

  // ── Blacklist expansion check: phone, website, ABN, ACN ───────────
  const blacklistFields: { value: string | null; fieldType: string; normalize: (v: string) => string }[] = [
    { value: contentToValidate.phone, fieldType: 'phone', normalize: (v) => v.replace(/\D/g, '') },
    { value: contentToValidate.website, fieldType: 'website', normalize: (v) => v.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '') },
    { value: contentToValidate.abn, fieldType: 'abn', normalize: (v) => v.replace(/\D/g, '') },
  ]

  for (const { value, fieldType, normalize } of blacklistFields) {
    if (!value || !value.trim()) continue
    const normalized = normalize(value)
    if (!normalized) continue

    const { data: blResult } = await supabase.rpc('is_blacklisted', {
      p_value: normalized,
      p_field_type: fieldType,
    })

    const row = Array.isArray(blResult) ? blResult[0] : blResult
    if (row?.is_blocked) {
      // Blacklist match → full account suspension using admin client (bypasses admin auth)
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const { internalSuspendAccount } = await import('@/app/actions/admin-accounts')
      const adminDb = createAdminClient()
      await internalSuspendAccount(
        adminDb,
        user.id,
        `Blacklist match: ${fieldType} "${normalized}" matched "${row.matched_term}" (${row.reason || 'no reason'})`,
        user.id
      )

      return { error: 'Your account has been suspended due to a policy violation.' }
    }
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

  // ─── Image moderation for pending photos ──────────────────────────
  const { moderateImages } = await import('@/lib/verification')
  const { removePhotoFromStorage } = await import('@/app/actions/photos')

  // Check for pending_add photos that need moderation
  const { data: pendingPhotos } = await supabase
    .from('photos')
    .select('id, url')
    .eq('business_id', businessId)
    .eq('status', 'pending_add')

  let imageModDecision: 'approved' | 'rejected' | null = null
  let imageModReason: string | null = null

  if (pendingPhotos && pendingPhotos.length > 0) {
    const photoUrls = pendingPhotos.map((p: { url: string }) => p.url)
    const imageResults = await moderateImages(photoUrls)

    // Check each image result
    for (let i = 0; i < imageResults.length; i++) {
      const result = imageResults[i]
      if (!result.safe || result.adult_content >= 0.5 || result.violence >= 0.5) {
        if (result.error_type === 'verification_unavailable') {
          // Transient failure — don't reject, ask user to retry
          return { error: 'Image verification is temporarily unavailable. Please try again in a moment.' }
        }
        imageModDecision = 'rejected'
        imageModReason = result.reason || `Photo ${i + 1} flagged: adult=${result.adult_content.toFixed(2)}, violence=${result.violence.toFixed(2)}`
        break
      }
    }
  }

  // If images are rejected, override decision
  // If listings_require_approval is true, override to pending regardless of AI result
  // ─── Text safety: keyword pre-filter on all content ──────────────
  const { checkExplicitContent } = await import('@/lib/verification')

  let textSafetyFail = false

  // Check business name/description
  const pubNameCheck = checkExplicitContent(contentToValidate.name)
  const pubDescCheck = checkExplicitContent(contentToValidate.description || '')
  if (pubNameCheck.flagged || pubDescCheck.flagged) textSafetyFail = true

  // Check all testimonials (pending_add + live)
  if (!textSafetyFail) {
    const { data: allTestimonials } = await supabase
      .from('testimonials')
      .select('text, author_name')
      .eq('business_id', businessId)
      .neq('status', 'pending_delete')

    for (const t of allTestimonials ?? []) {
      const check = checkExplicitContent(`${t.author_name} ${t.text}`)
      if (check.flagged) { textSafetyFail = true; break }
    }
  }

  let finalDecision = (imageModDecision === 'rejected' || textSafetyFail) ? 'rejected' : decision
  if (publishFlags.listings_require_approval && finalDecision === 'approved') {
    finalDecision = 'pending'
  }

  // Create verification job
  await supabase.from('verification_jobs').insert({
    business_id: businessId,
    status: finalDecision,
    deterministic_result: deterministic as unknown as Record<string, unknown>,
    ai_result: {
      ...(aiResult as unknown as Record<string, unknown> | null),
      image_moderation: imageModDecision ? { decision: imageModDecision, reason: imageModReason } : null,
    },
    final_decision: finalDecision,
  } as any)

  if (finalDecision === 'approved') {
    // Apply pending_changes to main columns
    // Preserve 'suspended' status — only admin can lift suspension
    const updateData: Record<string, unknown> = {
      ...contentToValidate,
      pending_changes: null,
      status: guard.visibilityStatus === 'suspended' ? 'suspended' : 'published',
      verification_status: 'approved',
    }

    await supabase.from('businesses').update(updateData).eq('id', businessId)

    // ─── Promote pending photos/testimonials ──────────────────────
    // pending_add → live
    await supabase
      .from('photos')
      .update({ status: 'live' })
      .eq('business_id', businessId)
      .eq('status', 'pending_add')

    await supabase
      .from('testimonials')
      .update({ status: 'live' })
      .eq('business_id', businessId)
      .eq('status', 'pending_add')

    // pending_delete → delete from DB + storage
    const { data: photosToDelete } = await supabase
      .from('photos')
      .select('id, url')
      .eq('business_id', businessId)
      .eq('status', 'pending_delete')

    if (photosToDelete && photosToDelete.length > 0) {
      for (const photo of photosToDelete) {
        await removePhotoFromStorage(photo.url)
      }
      await supabase
        .from('photos')
        .delete()
        .eq('business_id', businessId)
        .eq('status', 'pending_delete')
    }

    await supabase
      .from('testimonials')
      .delete()
      .eq('business_id', businessId)
      .eq('status', 'pending_delete')

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

    // ── P/W dual-write: approve W → create P snapshot ──────────────
    await pwService.dualWrite('publishChanges:approved', () =>
      pwService.approveWorking(businessId)
    )

    revalidatePath('/dashboard')
    revalidatePath(`/business/${biz.slug}`)
    return { success: true, published: true }
  }

  if (finalDecision === 'rejected') {
    // ─── Revert pending photos/testimonials on rejection ──────────
    // pending_add → delete from DB + storage (they were never live)
    const { data: pendingAddPhotos } = await supabase
      .from('photos')
      .select('id, url')
      .eq('business_id', businessId)
      .eq('status', 'pending_add')

    if (pendingAddPhotos && pendingAddPhotos.length > 0) {
      for (const photo of pendingAddPhotos) {
        await removePhotoFromStorage(photo.url)
      }
      await supabase
        .from('photos')
        .delete()
        .eq('business_id', businessId)
        .eq('status', 'pending_add')
    }

    await supabase
      .from('testimonials')
      .delete()
      .eq('business_id', businessId)
      .eq('status', 'pending_add')

    // pending_delete → revert to live (restore them)
    await supabase
      .from('photos')
      .update({ status: 'live' })
      .eq('business_id', businessId)
      .eq('status', 'pending_delete')

    await supabase
      .from('testimonials')
      .update({ status: 'live' })
      .eq('business_id', businessId)
      .eq('status', 'pending_delete')
  }

  // Pending/rejected: keep pending_changes intact, set verification_status
  await supabase
    .from('businesses')
    .update({ verification_status: finalDecision === 'rejected' ? 'rejected' : 'pending' })
    .eq('id', businessId)

  // ── P/W dual-write: submit or reject W ────────────────────────────
  if (finalDecision === 'rejected') {
    await pwService.dualWrite('publishChanges:rejected', () =>
      pwService.rejectWorking(businessId, undefined,
        imageModReason || 'AI validation rejected')
    )
  } else {
    await pwService.dualWrite('publishChanges:pending', () =>
      pwService.submitWorking(businessId)
    )
  }

  revalidatePath('/dashboard')
  revalidatePath('/admin/verification')
  return {
    success: true,
    published: false,
    verification_status: finalDecision,
    message: finalDecision === 'rejected'
      ? imageModReason
        ? `Your listing was rejected: ${imageModReason}`
        : 'Your listing changes were rejected. Please review and resubmit.'
      : 'Your listing changes are being reviewed. Your live listing is unchanged.',
  }
}

export async function pauseBusiness(businessId: string) {
  let supabase, user
  try {
    const ownership = await verifyBusinessOwnership(businessId)
    supabase = ownership.supabase
    user = ownership.user
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Permission denied' }
  }

  const guard = await pwService.getEditGuard(businessId)
  if (guard.visibilityStatus !== 'live') {
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

  // ── P/W dual-write: set P visibility to paused ──────────────────
  await pwService.dualWrite('pauseBusiness', () =>
    pwService.setVisibility(businessId, 'paused')
  )

  revalidatePath('/dashboard')
  return { success: true }
}

export async function unpauseBusiness(businessId: string) {
  let supabase, user
  try {
    const ownership = await verifyBusinessOwnership(businessId)
    supabase = ownership.supabase
    user = ownership.user
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Permission denied' }
  }

  const guard = await pwService.getEditGuard(businessId)
  if (guard.visibilityStatus !== 'paused') {
    return { error: 'Only paused listings can be unpaused' }
  }

  if (!guard.verificationOk) {
    return { error: 'Your listing must be verified before unpausing' }
  }

  // Check user subscription via canonical entitlements
  const entitlements = await getUserEntitlements(supabase, user.id)
  if (!entitlements.canPublish) {
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

  // ── P/W dual-write: set P visibility to live ────────────────────
  await pwService.dualWrite('unpauseBusiness', () =>
    pwService.setVisibility(businessId, 'live')
  )

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

function hasValidLocation(
  locations?: { postcode?: string | null; suburb?: string | null; state?: string | null }[]
): boolean {
  if (!locations || locations.length === 0) return false
  return locations.some(l => l.postcode || (l.suburb && l.state))
}

export async function getMyBusinesses() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  // Identity fields from businesses table (pending_changes kept for legacy UI compat)
  const { data } = await supabase
    .from('businesses')
    .select('id, slug, billing_status, deleted_at, is_seed, suspended_reason, pending_changes')
    .eq('owner_id', user.id)
    .eq('is_seed', false)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (!data || data.length === 0) return []

  // Fetch W + P for each business in parallel
  const pwStates = await Promise.all(data.map(async (b) => {
    const [w, p] = await Promise.all([
      pwService.getActiveWorkingTyped(b.id),
      pwService.getCurrentPublishedTyped(b.id),
    ])
    return { w, p }
  }))

  const [entitlements, systemFlags] = await Promise.all([
    getUserEntitlements(supabase, user.id),
    getSystemFlagsSafe(),
  ])

  const qualityFlags: QualityFlags = {
    canPublish: entitlements.canPublish,
    isActive: entitlements.isActive,
    effectiveState: entitlements.effectiveState,
    reasonCodes: entitlements.reasonCodes,
    listingsEnabled: systemFlags.listings_enabled,
  }

  return data.map((b, i) => {
    const { w, p } = pwStates[i]
    const source = w ?? p // W first, fallback to P
    const derived = pwService.deriveStatus(p, w, { deleted_at: b.deleted_at, billing_status: b.billing_status })

    // Content from W/P
    const name = source?.name ?? ''
    const description = source?.description ?? null
    const phone = source?.phone ?? null
    const emailContact = source?.email_contact ?? null
    const website = source?.website ?? null
    const suburb = source?.suburb ?? null
    const state = source?.state ?? null

    // Categories from W/P
    let hasCategories = false
    if (w) {
      hasCategories = !!w.primary_category_id || (w.secondary_category_ids ?? []).length > 0
    } else if (p) {
      hasCategories = (p.category_ids ?? []).length > 0
    }

    // Location check (equivalent to old hasValidLocation)
    const hasLocation = !!(source?.postcode || (source?.suburb && source?.state))

    return {
      id: b.id,
      name,
      slug: b.slug,
      status: derived.effectiveStatus,
      suburb,
      state,
      verification_status: derived.effectiveVerification,
      pending_changes: b.pending_changes,
      hasPendingChanges: derived.hasPendingChanges,
      suspended_reason: b.suspended_reason ?? null,
      quality: getListingQuality({
        name,
        description,
        phone,
        email_contact: emailContact,
        website,
        isSuspended: derived.effectiveStatus === 'suspended',
        suspendedReason: b.suspended_reason ?? null,
        isUnderReview: derived.effectiveVerification === 'pending',
        isRejected: derived.effectiveVerification === 'rejected',
        hasPendingChanges: derived.hasPendingChanges,
        deleted_at: b.deleted_at,
        hasCategories,
        hasLocation,
        isDraft: derived.effectiveStatus === 'draft',
      }, qualityFlags),
    }
  })
}

// ─── Duplicate Detection ─────────────────────────────────────────────

export async function findPotentialDuplicates(businessId: string) {
  const { supabase } = await verifyBusinessOwnership(businessId)

  // Fetch the user's business with location
  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name, business_locations (suburb, state, postcode, lat, lng)')
    .eq('id', businessId)
    .single()

  if (!biz) return { candidates: [] }

  const loc = Array.isArray(biz.business_locations)
    ? biz.business_locations[0]
    : biz.business_locations
  const userSuburb = loc?.suburb ?? null
  const userPostcode = loc?.postcode ?? null

  // Query nearby candidates from the search index
  const { data: nearby } = await supabase
    .from('business_search_index')
    .select('business_id, name, suburb, state, postcode')
    .neq('business_id', businessId)
    .limit(200)

  if (!nearby || nearby.length === 0) return { candidates: [] }

  const { fuzzyNameScore } = await import('@/lib/claim-scoring')

  type ScoredCandidate = {
    id: string
    name: string
    suburb: string | null
    state: string | null
    postcode: string | null
    score: number
    matchReasons: string[]
  }

  const scored: ScoredCandidate[] = []

  for (const c of nearby) {
    const nameScore = fuzzyNameScore(biz.name, c.name) // 0-1
    const reasons: string[] = []
    let bonus = 0

    if (nameScore >= 0.5) reasons.push('name_similarity')

    // Suburb + postcode match bonus
    if (userSuburb && c.suburb && userSuburb.toLowerCase() === c.suburb.toLowerCase()) {
      bonus += 0.15
      reasons.push('suburb_match')
    }
    if (userPostcode && c.postcode && userPostcode === c.postcode) {
      bonus += 0.10
      reasons.push('postcode_match')
    }

    // Same-area bonus when both suburb and postcode match
    if (userSuburb && c.suburb && userPostcode && c.postcode
        && userSuburb.toLowerCase() === c.suburb.toLowerCase()
        && userPostcode === c.postcode) {
      bonus += 0.10
      reasons.push('same_area')
    }

    const rawScore = nameScore * 0.5 + bonus
    const finalScore = Math.round(Math.min(rawScore / 0.75, 1.0) * 100) // normalize to 0-100

    if (finalScore >= 70) {
      scored.push({
        id: c.business_id,
        name: c.name,
        suburb: c.suburb,
        state: c.state,
        postcode: c.postcode,
        score: finalScore,
        matchReasons: reasons,
      })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return { candidates: scored.slice(0, 3) }
}

export async function saveDuplicateChoice(
  businessId: string,
  choice: 'matched' | 'not_matched',
  matchedBusinessId?: string,
  confidence?: number,
  candidatesJson?: Record<string, unknown>[]
) {
  const { supabase } = await verifyBusinessOwnership(businessId)

  const update: Record<string, unknown> = {
    duplicate_user_choice: choice,
    duplicate_candidates_json: candidatesJson ?? null,
  }

  if (choice === 'matched' && matchedBusinessId) {
    update.duplicate_of_business_id = matchedBusinessId
    update.duplicate_confidence = confidence ?? null
  } else {
    update.duplicate_of_business_id = null
    update.duplicate_confidence = null
  }

  const { error } = await supabase
    .from('businesses')
    .update(update)
    .eq('id', businessId)

  if (error) return { error: 'Failed to save duplicate choice.' }
  return { success: true }
}

export async function softDeleteBusiness(businessId: string) {
  let supabase, user
  try {
    const ownership = await verifyBusinessOwnership(businessId)
    supabase = ownership.supabase
    user = ownership.user
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Permission denied' }
  }

  const { data: business, error: fetchError } = await supabase
    .from('businesses')
    .select('id, slug, name, status, deleted_at')
    .eq('id', businessId)
    .single()

  if (fetchError || !business) {
    return { error: 'Business not found' }
  }

  if (business.deleted_at) {
    return { error: 'Business is already deleted' }
  }

  const now = new Date().toISOString()

  const { error } = await supabase
    .from('businesses')
    .update({
      status: 'deleted',
      deleted_at: now,
    })
    .eq('id', businessId)

  if (error) {
    return { error: 'Failed to delete business. Please try again.' }
  }

  // Refresh search index to remove from results
  await supabase.rpc('refresh_search_index', { p_business_id: businessId })

  await logAudit(supabase, {
    action: 'listing_deleted',
    entityType: 'listing',
    entityId: businessId,
    actorId: user.id,
    details: {
      listing_name: business.name,
      before_state: { status: business.status },
      after_state: { status: 'deleted', deleted_at: now },
    },
  })

  // ── P/W dual-write: archive active W ─────────────────────────────
  await pwService.dualWrite('softDeleteBusiness', () =>
    pwService.archiveWorking(businessId)
  )

  revalidatePath('/dashboard')
  if (business.slug) revalidatePath(`/business/${business.slug}`)
  return { success: true }
}

export async function getListingsPageData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { businesses: [], canCreateMore: false, entitlements: null }

  const [businesses, entitlements] = await Promise.all([
    getMyBusinesses(),
    getUserEntitlements(supabase, user.id),
  ])

  // Allow draft creation without subscription — gate is at submit/publish only.
  // Still enforce listing slot limit (1 for unsub/basic, 10 for premium).
  const canCreateMore = businesses.length < entitlements.maxListings

  return { businesses, canCreateMore, entitlements }
}

export async function getMyEntitlements(): Promise<Entitlements | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return getUserEntitlements(supabase, user.id)
}

export async function getMyBusiness(selectedId?: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  // Keep existing query with relational joins (categories, photos, testimonials)
  let business: any = null

  if (selectedId) {
    const { data, error } = await supabase
      .from('businesses')
      .select(
        `
        *,
        business_locations (*),
        business_categories (
          category_id,
          is_primary,
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

    if (error || !data) return null
    business = data
  } else {
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
    business = businesses?.sort((a: any, b: any) => {
      const score = (biz: any) =>
        (biz.status === 'published' ? 2 : 0) + (biz.claim_status === 'claimed' ? 1 : 0)
      return score(b) - score(a)
    })[0] ?? null

    if (error || !business) return null
  }

  // Fetch W + P for content overlay
  const [w, p] = await Promise.all([
    pwService.getActiveWorkingTyped(business.id),
    pwService.getCurrentPublishedTyped(business.id),
  ])
  const source = w ?? p
  const derived = pwService.deriveStatus(p, w, {
    deleted_at: business.deleted_at,
    billing_status: business.billing_status,
  })

  // Flatten location: prefer W/P, fallback to relational join
  const location = source && (source.suburb || source.state || source.postcode)
    ? {
        suburb: source.suburb,
        state: source.state,
        postcode: source.postcode,
        address_text: source.address_text,
        service_radius_km: source.service_radius_km,
      }
    : Array.isArray(business.business_locations)
      ? business.business_locations[0] ?? null
      : business.business_locations

  return {
    ...business,
    // Override content from W/P (if available), fallback to businesses table
    name: source?.name ?? business.name,
    description: source?.description ?? business.description,
    phone: source?.phone ?? business.phone,
    email_contact: source?.email_contact ?? business.email_contact,
    website: source?.website ?? business.website,
    abn: source?.abn ?? business.abn,
    // Override status from deriveStatus
    status: derived.effectiveStatus,
    verification_status: derived.effectiveVerification,
    // Preserve relational data
    location,
    subscription: null,
    categories: business.business_categories,
    photos: business.photos ?? [],
    testimonials: business.testimonials ?? [],
  }
}

export async function getBusinessBySlug(slug: string) {
  const supabase = await createClient()

  // Resolve slug → business identity (identity fields only)
  const { data: biz, error } = await supabase
    .from('businesses')
    .select('id, owner_id, slug, billing_status, deleted_at, is_seed, claim_status, listing_source')
    .eq('slug', slug)
    .maybeSingle()

  if (error || !biz) return null

  // Determine viewer identity early (needed for W fallback)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isOwner = !!user && user.id === biz.owner_id

  let isAdmin = false
  if (user && !isOwner) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    isAdmin = profile?.role === 'admin'
  }

  // Fetch current published listing (P) — content source
  const p = await pwService.getCurrentPublishedTyped(biz.id)

  // Admin/owner preview: fall back to Working listing when no P exists
  if (!p && (isAdmin || isOwner)) {
    const w = await pwService.getActiveWorkingTyped(biz.id)
    if (!w) return null

    // Build category_ids from W's primary + secondary
    const catIds = [w.primary_category_id, ...w.secondary_category_ids].filter(Boolean) as string[]
    let catSlugMap = new Map<string, string>()
    let catNameMap = new Map<string, string>()
    if (catIds.length > 0) {
      const { data: catRows } = await supabase.from('categories').select('id, name, slug').in('id', catIds)
      for (const c of catRows ?? []) {
        catSlugMap.set(c.id, c.slug)
        catNameMap.set(c.id, c.name)
      }
    }
    const categories = catIds.map((catId: string) => ({
      category_id: catId,
      is_primary: catId === w.primary_category_id,
      categories: { id: catId, name: catNameMap.get(catId) ?? '', slug: catSlugMap.get(catId) ?? '' },
    }))

    // Fetch photos from photos table
    const { data: photoRows } = await supabase
      .from('photos')
      .select('id, url, sort_order')
      .eq('business_id', biz.id)
      .neq('status', 'pending_delete')
      .order('sort_order')
    const photos = (photoRows ?? []) as Array<{ id: string; url: string; sort_order: number }>

    // Fetch testimonials from testimonials table
    const { data: testimonialRows } = await supabase
      .from('testimonials')
      .select('id, author_name, text, rating, created_at')
      .eq('business_id', biz.id)
      .neq('status', 'pending_delete')
      .order('created_at', { ascending: false })
    const testimonials = (testimonialRows ?? []) as Array<{ id: string; author_name: string; text: string; rating: number; created_at: string }>

    const avgRating =
      testimonials.length > 0
        ? Math.round(
            (testimonials.reduce((sum: number, t: { rating: number }) => sum + t.rating, 0) /
              testimonials.length) * 10
          ) / 10
        : null

    const location = (w.suburb || w.state || w.postcode)
      ? { suburb: w.suburb, state: w.state, postcode: w.postcode, address_text: w.address_text, service_radius_km: w.service_radius_km, lat: w.lat, lng: w.lng }
      : null

    return {
      id: biz.id,
      owner_id: biz.owner_id,
      name: w.name,
      slug: biz.slug,
      description: w.description,
      phone: w.phone,
      email_contact: w.email_contact,
      website: w.website,
      abn: w.abn,
      status: 'under_review' as const,
      verification_status: 'pending' as const,
      billing_status: biz.billing_status,
      is_seed: biz.is_seed,
      claim_status: biz.claim_status,
      listing_source: biz.listing_source,
      deleted_at: biz.deleted_at,
      location,
      categories,
      photos,
      testimonials,
      avgRating,
      reviewCount: testimonials.length,
      isAdminPreview: true,
    }
  }

  if (!p) return null

  // Visibility checks for non-owner, non-admin
  if (!isOwner && !isAdmin) {
    if (p.visibility_status !== 'live') return null
    // Existing eligibility check (reads old businesses columns via dual-write)
    const eligibility = await getListingEligibility(supabase, biz.id)
    if (!eligibility.visiblePublic) return null
  }

  // Photos and testimonials from P snapshots (already live-only)
  const photos = (p.photos_snapshot ?? []) as Array<{ id: string; url: string; sort_order: number; [k: string]: unknown }>
  const testimonials = (p.testimonials_snapshot ?? []) as Array<{ id: string; author_name: string; text: string; rating: number; created_at: string; [k: string]: unknown }>

  // Calculate average rating from snapshot testimonials
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

  // Location from P denormalized fields
  const location = (p.suburb || p.state || p.postcode)
    ? { suburb: p.suburb, state: p.state, postcode: p.postcode, address_text: p.address_text, service_radius_km: p.service_radius_km, lat: p.lat, lng: p.lng }
    : null

  // Categories from P arrays — resolve slugs for breadcrumb links
  const catIds = p.category_ids ?? []
  let catSlugMap = new Map<string, string>()
  if (catIds.length > 0) {
    const { data: catRows } = await supabase.from('categories').select('id, slug').in('id', catIds)
    for (const c of catRows ?? []) catSlugMap.set(c.id, c.slug)
  }
  const categories = catIds.map((catId: string, i: number) => ({
    category_id: catId,
    is_primary: catId === p.primary_category_id,
    categories: { id: catId, name: (p.category_names ?? [])[i] ?? '', slug: catSlugMap.get(catId) ?? '' },
  }))

  return {
    id: biz.id,
    owner_id: biz.owner_id,
    name: p.name,
    slug: biz.slug,
    description: p.description,
    phone: p.phone,
    email_contact: p.email_contact,
    website: p.website,
    abn: p.abn,
    status: p.visibility_status === 'live' ? 'published' : p.visibility_status,
    verification_status: 'approved' as const,
    billing_status: biz.billing_status,
    is_seed: biz.is_seed,
    claim_status: biz.claim_status,
    listing_source: biz.listing_source,
    deleted_at: biz.deleted_at,
    location,
    categories,
    photos: [...photos].sort(
      (a: { sort_order: number }, b: { sort_order: number }) =>
        a.sort_order - b.sort_order
    ),
    testimonials,
    avgRating,
    reviewCount: testimonials.length,
    isAdminPreview: false,
  }
}
