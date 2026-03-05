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
import { syncBusinessBillingStatus } from '@/lib/entitlements'
import { logAudit } from '@/lib/audit'
import { getUserEntitlements } from '@/lib/entitlements'
import { createNotification } from '@/app/actions/notifications'
import { getSystemFlagsSafe, requireEmailVerified, verifyCaptcha, logAbuseEvent } from '@/lib/protection'
import { checkRateLimit, claimSubmitLimiter } from '@/lib/rate-limiter'
import { sendOTP, verifyOTP, isTwilioConfigured } from '@/lib/twilio'
import log from '@/lib/logger'

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

// ─── Sync business billing status from user entitlements ─────────────

async function ensureUserSubscription(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  _businessId: string
) {
  // Sync billing_status on all user's businesses from their entitlements.
  // If user has no subscription, they'll need to subscribe via Stripe checkout.
  await syncBusinessBillingStatus(supabase, userId)
}

// ─── Claim Business (with scoring) ──────────────────────────────────

export async function claimBusiness(
  businessId: string,
  claimData: {
    businessName: string
    phone?: string
    website?: string
    postcode?: string
    captchaToken?: string
  }
) {
  const { supabase, user } = await requireAuth()

  // ── Protection guards ──────────────────────────────────────────────
  const flags = await getSystemFlagsSafe()
  if (!flags.claims_enabled) {
    return { error: 'Claim submissions are currently disabled. Please try again later.' }
  }
  try {
    await checkRateLimit(claimSubmitLimiter, user.id, 'rate_limit_violation')
  } catch {
    return { error: 'Too many requests. Please try again later.' }
  }
  try {
    requireEmailVerified(user)
  } catch {
    return { error: 'Please verify your email address before claiming a business.' }
  }
  if (flags.captcha_required) {
    if (!claimData.captchaToken) {
      return { error: 'Please complete the captcha verification.' }
    }
    const captchaResult = await verifyCaptcha(claimData.captchaToken)
    if (!captchaResult.success) {
      await logAbuseEvent('captcha_failure', null, user.id, { context: 'claim' })
      return { error: 'Captcha verification failed. Please try again.' }
    }
  }

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

  // Check listing capacity via canonical entitlements (hard cap on total)
  const entitlements = await getUserEntitlements(supabase, user.id)
  if (!entitlements.canCreateMore) {
    return {
      error:
        entitlements.maxListings === 1
          ? 'You already have a business listing. Upgrade to Premium for multiple listings.'
          : `You have reached your limit of ${entitlements.maxListings} listings.`,
    }
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

  log.info({ businessId, userId: user.id, step, verificationMethod, score: matchScore.weighted_total }, 'claimBusiness scoring result')

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
    const { error: bizError } = await supabase
      .from('businesses')
      .update({
        owner_id: user.id,
        claim_status: 'claimed',
        is_seed: false,
        status: 'published',
        verification_status: 'approved',
      })
      .eq('id', businessId)

    if (bizError) {
      log.error({ businessId, userId: user.id, error: bizError }, 'claimBusiness: failed to transfer ownership')
      return { error: 'Claim approved but failed to transfer ownership. Contact support.' }
    }

    // Mark contacts as verified
    await supabase
      .from('business_contacts')
      .update({ verified_at: new Date().toISOString() })
      .eq('business_id', businessId)

    // Ensure user has a subscription (trial if none exists)
    await ensureUserSubscription(supabase, user.id, businessId)

    // Refresh search index so the claimed business appears in results
    await supabase.rpc('refresh_search_index', { p_business_id: businessId })

    // Reject other pending claims
    await supabase
      .from('business_claims')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
      })
      .eq('business_id', businessId)
      .eq('status', 'pending')
  } else {
    // Mark business claim_status as 'pending'
    await supabase
      .from('businesses')
      .update({ claim_status: 'pending' })
      .eq('id', businessId)
  }

  await logAudit(supabase, {
    action: 'listing_claim_submitted',
    entityType: 'listing',
    entityId: businessId,
    actorId: user.id,
    details: {
      listing_name: business.name,
      claimed_business_name: parsed.data.businessName,
      verification_method: verificationMethod,
      match_score: matchScore.weighted_total,
      result: step,
    },
  })

  revalidatePath(`/dashboard/claim/${businessId}`)
  revalidatePath('/admin/claims')
  revalidatePath('/dashboard')
  return { step, matchScore }
}

// ─── OTP Verification for Claims ─────────────────────────────────────

export async function sendClaimOTP(phone: string) {
  const { user } = await requireAuth()

  if (!isTwilioConfigured()) {
    return { skipped: true, error: null }
  }

  const result = await sendOTP(user.id, phone)
  return result
}

export async function verifyClaimOTP(phone: string, code: string) {
  const { user } = await requireAuth()

  const result = await verifyOTP(user.id, phone, code)
  return result
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
  const { supabase } = await requireAdmin()

  // Pre-flight: check claimer capacity (requires TS-side plan tier lookup)
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

  const claimerEntitlements = await getUserEntitlements(supabase, claim.claimer_id)
  if (!claimerEntitlements.canCreateMore) {
    return { error: 'Claimer has reached their listing limit. Cannot approve.' }
  }

  // Atomic DB operations via SQL function
  // Admin check enforced at SQL level (is_admin() + auth.uid())
  // Handles: claim update, ownership transfer, contact verification,
  // reject other claims, refresh search index, audit log, notification
  const { data: result, error: rpcError } = await supabase.rpc(
    'approve_business_claim' as any,
    {
      p_claim_id: claimId,
      p_admin_notes: notes || null,
    }
  )

  if (rpcError) {
    log.error({ claimId, error: rpcError }, 'approveClaim: RPC error')
    return { error: 'Failed to approve claim. Please try again.' }
  }

  if (result?.error) {
    return { error: result.error }
  }

  // Ensure claimer has a subscription (may involve Stripe — must stay in TS)
  await ensureUserSubscription(supabase, result.claimer_id, result.business_id)

  revalidatePath('/admin/claims')
  revalidatePath('/admin')
  revalidatePath('/dashboard')
  return { success: true }
}

// ─── Admin: Reject Claim ────────────────────────────────────────────

export async function rejectClaim(claimId: string, notes?: string) {
  const { supabase } = await requireAdmin()

  // Atomic DB operations via SQL function
  // Admin check enforced at SQL level (is_admin() + auth.uid())
  // Handles: claim rejection, business claim_status reset, audit log, notification
  const { data: result, error: rpcError } = await supabase.rpc(
    'reject_business_claim' as any,
    {
      p_claim_id: claimId,
      p_admin_notes: notes || null,
    }
  )

  if (rpcError) {
    log.error({ claimId, error: rpcError }, 'rejectClaim: RPC error')
    return { error: 'Failed to reject claim. Please try again.' }
  }

  if (result?.error) {
    return { error: result.error }
  }

  revalidatePath('/admin/claims')
  return { success: true }
}
