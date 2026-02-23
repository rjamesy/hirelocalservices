'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { claimSchema } from '@/lib/validations'
import {
  calculateMatchScore,
  AUTO_APPROVE_THRESHOLD,
  ADMIN_REVIEW_THRESHOLD,
} from '@/lib/claim-scoring'
import { quickBlacklistCheck } from '@/lib/blacklist'
import { TRIAL_DURATION_DAYS } from '@/lib/ranking'

async function requireAuth() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be logged in')
  return { supabase, user }
}

async function requireAdmin() {
  const { supabase, user } = await requireAuth()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    throw new Error('You must be an admin')
  }
  return { supabase, user }
}

// ─── Auto-assign trial subscription on claim ────────────────────────

async function assignTrialSubscription(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string
) {
  // Check if business already has a subscription
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('business_id', businessId)
    .maybeSingle()

  if (existing) return // Already has a subscription

  const now = new Date()
  const trialEnd = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000)

  await supabase.from('subscriptions').insert({
    business_id: businessId,
    status: 'active',
    plan: 'free_trial',
    current_period_end: trialEnd.toISOString(),
    current_period_start: now.toISOString(),
    cancel_at_period_end: false,
  })
}

// ─── Claim Business (with scoring) ──────────────────────────────────

export async function claimBusiness(
  businessId: string,
  claimData: {
    businessName: string
    phone?: string
    website?: string
    postcode?: string
  }
) {
  const { supabase, user } = await requireAuth()

  // Validate claim data
  const parsed = claimSchema.safeParse(claimData)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  // Blacklist check
  const blockedTerm = quickBlacklistCheck(parsed.data.businessName)
  if (blockedTerm) {
    return { error: `This business name contains a blocked term and cannot be claimed.` }
  }

  // Check user doesn't already have a business
  const { data: existingBiz } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (existingBiz) {
    return { error: 'You already have a business listing' }
  }

  // Fetch the seed business with location
  const { data: business, error: bizError } = await supabase
    .from('businesses')
    .select(`
      id, name, phone, website, is_seed, claim_status,
      business_locations (lat, lng, postcode)
    `)
    .eq('id', businessId)
    .single()

  if (bizError || !business) {
    return { error: 'Business not found' }
  }

  if (!business.is_seed) {
    return { error: 'This business is not available for claiming' }
  }

  if (business.claim_status === 'claimed') {
    return { error: 'This business has already been claimed' }
  }

  // Check for existing pending claim by this user
  const { data: existingClaim } = await supabase
    .from('business_claims')
    .select('id')
    .eq('business_id', businessId)
    .eq('claimer_id', user.id)
    .eq('status', 'pending')
    .maybeSingle()

  if (existingClaim) {
    return { error: 'You already have a pending claim for this business' }
  }

  // Get location for scoring
  const locations = business.business_locations as { lat: number | null; lng: number | null; postcode: string | null }[]
  const location = Array.isArray(locations) ? locations[0] : null

  // Look up claimer's postcode for geo scoring
  let claimedLat: number | null = null
  let claimedLng: number | null = null
  if (parsed.data.postcode) {
    const { data: postcodeData } = await supabase
      .from('postcodes')
      .select('lat, lng')
      .eq('postcode', parsed.data.postcode)
      .limit(1)
      .maybeSingle()
    if (postcodeData) {
      claimedLat = postcodeData.lat
      claimedLng = postcodeData.lng
    }
  }

  // Calculate match score
  const matchScore = calculateMatchScore({
    claimedName: parsed.data.businessName,
    existingName: business.name,
    claimedPhone: parsed.data.phone || null,
    existingPhone: business.phone,
    claimedWebsite: parsed.data.website || null,
    existingWebsite: business.website,
    claimedLat,
    claimedLng,
    existingLat: location?.lat ?? null,
    existingLng: location?.lng ?? null,
  })

  // Determine verification method
  let verificationMethod: string
  let step: 'approved' | 'pending_review' | 'rejected'

  if (matchScore.weighted_total >= AUTO_APPROVE_THRESHOLD) {
    // High match — check for exact phone match or email domain match for auto-approve
    const phoneExact = parsed.data.phone && business.phone &&
      matchScore.phone_score === 1

    // Check if user's auth email domain matches business website
    let emailDomainMatch = false
    if (user.email && business.website) {
      const emailDomain = user.email.split('@')[1]?.toLowerCase()
      try {
        const websiteUrl = business.website.startsWith('http')
          ? business.website
          : `https://${business.website}`
        const websiteDomain = new URL(websiteUrl).hostname
          .replace(/^www\./, '')
          .toLowerCase()
        emailDomainMatch = emailDomain === websiteDomain
      } catch {
        // URL parsing failed
      }
    }

    if (phoneExact || emailDomainMatch) {
      verificationMethod = 'auto_approved'
      step = 'approved'
    } else {
      verificationMethod = 'high_match_review'
      step = 'pending_review'
    }
  } else if (matchScore.weighted_total >= ADMIN_REVIEW_THRESHOLD) {
    verificationMethod = 'admin_review'
    step = 'pending_review'
  } else {
    verificationMethod = 'rejected_low_match'
    step = 'rejected'
  }

  if (step === 'rejected') {
    return {
      step: 'rejected' as const,
      matchScore,
      error: 'The information provided does not sufficiently match this business listing. Please verify your details and try again.',
    }
  }

  // Insert the claim
  const claimStatus = step === 'approved' ? 'approved' : 'pending'
  const { error: insertError } = await supabase
    .from('business_claims')
    .insert({
      business_id: businessId,
      claimer_id: user.id,
      status: claimStatus,
      claimed_business_name: parsed.data.businessName,
      claimed_phone: parsed.data.phone || null,
      claimed_website: parsed.data.website || null,
      claimed_email: user.email || null,
      claimed_postcode: parsed.data.postcode || null,
      match_score: matchScore as unknown as Record<string, unknown>,
      verification_method: verificationMethod,
    } as any)

  if (insertError) {
    return { error: 'Failed to submit claim. Please try again.' }
  }

  // If auto-approved, transfer ownership immediately
  if (step === 'approved') {
    await supabase
      .from('businesses')
      .update({
        owner_id: user.id,
        claim_status: 'claimed',
        is_seed: false,
      })
      .eq('id', businessId)

    // Mark contacts as verified
    await supabase
      .from('business_contacts')
      .update({ verified_at: new Date().toISOString() })
      .eq('business_id', businessId)

    // Auto-assign trial subscription if none exists
    await assignTrialSubscription(supabase, businessId)

    // Reject other pending claims
    await supabase
      .from('business_claims')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
      })
      .eq('business_id', businessId)
      .eq('status', 'pending')

    // Trigger verification pipeline
    try {
      const { runVerification } = await import('@/app/actions/verification')
      await runVerification(businessId, 'claim')
    } catch {
      // Non-blocking
    }
  } else {
    // Mark business claim_status as 'pending'
    await supabase
      .from('businesses')
      .update({ claim_status: 'pending' })
      .eq('id', businessId)
  }

  revalidatePath(`/dashboard/claim/${businessId}`)
  revalidatePath('/admin/claims')
  return { step, matchScore }
}

// ─── Legacy submitClaim (redirect to new flow) ──────────────────────

export async function submitClaim(businessId: string) {
  // Kept for backward compatibility — redirects to new claim flow
  return { error: 'Please use the new claim form to claim this business.' }
}

// ─── Admin: Get Claims ──────────────────────────────────────────────

export async function getAdminClaims(page = 1) {
  const { supabase } = await requireAdmin()

  const perPage = 20
  const from = (page - 1) * perPage
  const to = from + perPage - 1

  const { data, count, error } = await supabase
    .from('business_claims')
    .select(
      `
      *,
      businesses (id, name, slug, phone, website),
      profiles!business_claims_claimer_id_fkey (id, email)
    `,
      { count: 'exact' }
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .range(from, to)

  if (error) {
    return { data: [], totalCount: 0, page, totalPages: 0 }
  }

  const totalCount = count ?? 0
  return {
    data: data ?? [],
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / perPage),
  }
}

// ─── Admin: Approve Claim ───────────────────────────────────────────

export async function approveClaim(claimId: string, notes?: string) {
  const { supabase, user } = await requireAdmin()

  const { data: claim, error: claimError } = await supabase
    .from('business_claims')
    .select('id, business_id, claimer_id, status')
    .eq('id', claimId)
    .single()

  if (claimError || !claim) {
    return { error: 'Claim not found' }
  }

  if (claim.status !== 'pending') {
    return { error: 'Claim is not pending' }
  }

  // Update claim status
  await supabase
    .from('business_claims')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      admin_notes: notes || null,
    })
    .eq('id', claimId)

  // Transfer business ownership and mark as claimed
  await supabase
    .from('businesses')
    .update({
      owner_id: claim.claimer_id,
      claim_status: 'claimed',
      is_seed: false,
    })
    .eq('id', claim.business_id)

  // Mark contacts as verified
  await supabase
    .from('business_contacts')
    .update({ verified_at: new Date().toISOString() })
    .eq('business_id', claim.business_id)

  // Auto-assign trial subscription if none exists
  await assignTrialSubscription(supabase, claim.business_id)

  // Reject any other pending claims for this business
  await supabase
    .from('business_claims')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq('business_id', claim.business_id)
    .eq('status', 'pending')
    .neq('id', claimId)

  // Trigger verification on the business
  try {
    const { runVerification } = await import('@/app/actions/verification')
    await runVerification(claim.business_id, 'claim_approved')
  } catch {
    // Non-blocking
  }

  revalidatePath('/admin/claims')
  return { success: true }
}

// ─── Admin: Reject Claim ────────────────────────────────────────────

export async function rejectClaim(claimId: string, notes?: string) {
  const { supabase, user } = await requireAdmin()

  const { data: claim, error: claimError } = await supabase
    .from('business_claims')
    .select('id, business_id, status')
    .eq('id', claimId)
    .single()

  if (claimError || !claim) {
    return { error: 'Claim not found' }
  }

  if (claim.status !== 'pending') {
    return { error: 'Claim is not pending' }
  }

  await supabase
    .from('business_claims')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      admin_notes: notes || null,
    })
    .eq('id', claimId)

  // Reset business claim_status back to unclaimed if no other pending claims
  const { count } = await supabase
    .from('business_claims')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', claim.business_id)
    .eq('status', 'pending')

  if (!count || count === 0) {
    await supabase
      .from('businesses')
      .update({ claim_status: 'unclaimed' })
      .eq('id', claim.business_id)
  }

  revalidatePath('/admin/claims')
  return { success: true }
}
