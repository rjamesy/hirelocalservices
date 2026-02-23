'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  runDeterministicChecks,
  runAIContentReview,
  makeVerificationDecision,
} from '@/lib/verification'

// ─── Helpers ────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be logged in')

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

// ─── Run Verification Pipeline ──────────────────────────────────────

export async function runVerification(
  businessId: string,
  _trigger: string
) {
  const supabase = await createClient()

  // Fetch business details
  const { data: business, error: bizError } = await supabase
    .from('businesses')
    .select(`
      id, name, description, phone, email_contact,
      business_locations (lat, lng),
      business_contacts (phone, email)
    `)
    .eq('id', businessId)
    .single()

  if (bizError || !business) return

  const rawLocations = business.business_locations as any
  const location = Array.isArray(rawLocations) ? rawLocations[0] : rawLocations
  const rawContacts = business.business_contacts as any
  const contact = Array.isArray(rawContacts) ? rawContacts[0] : rawContacts

  // Fetch nearby businesses for duplicate check (within same general area)
  const { data: nearbyBusinesses } = await supabase
    .from('businesses')
    .select('name, business_locations (lat, lng)')
    .neq('id', businessId)
    .limit(100)

  const existingForCheck = (nearbyBusinesses ?? []).map((b: any) => {
    const loc = Array.isArray(b.business_locations) ? b.business_locations[0] : null
    return {
      name: b.name,
      lat: loc?.lat ?? null,
      lng: loc?.lng ?? null,
    }
  })

  // Run deterministic checks
  const deterministic = runDeterministicChecks(
    {
      name: business.name,
      description: business.description,
      phone: contact?.phone ?? business.phone,
      email: contact?.email ?? business.email_contact,
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
    },
    existingForCheck
  )

  // Run AI review (graceful degradation if no API key)
  const aiResult = await runAIContentReview({
    name: business.name,
    description: business.description,
    phone: contact?.phone ?? business.phone,
    email: contact?.email ?? business.email_contact,
    lat: location?.lat ?? null,
    lng: location?.lng ?? null,
  })

  // Make decision
  const decision = makeVerificationDecision(deterministic, aiResult, business.name, business.description)

  // Create verification job
  await supabase.from('verification_jobs').insert({
    business_id: businessId,
    status: decision,
    deterministic_result: deterministic as unknown as Record<string, unknown>,
    ai_result: aiResult as unknown as Record<string, unknown> | null,
    final_decision: decision,
  } as any)

  // Update business verification status
  await supabase
    .from('businesses')
    .update({ verification_status: decision })
    .eq('id', businessId)

  revalidatePath('/admin/verification')
}

// ─── Admin: Get Verification Queue ──────────────────────────────────

export async function getAdminVerificationQueue(page = 1) {
  const { supabase } = await requireAdmin()

  const perPage = 20
  const from = (page - 1) * perPage
  const to = from + perPage - 1

  const { data, count, error } = await supabase
    .from('businesses')
    .select(
      `
      id, name, slug, listing_source, verification_status, created_at,
      verification_jobs (
        id, deterministic_result, ai_result, final_decision, created_at
      )
    `,
      { count: 'exact' }
    )
    .eq('verification_status', 'review')
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

// ─── Admin: Review Verification ─────────────────────────────────────

export async function adminReviewVerification(
  jobId: string,
  decision: 'approved' | 'rejected',
  notes?: string
) {
  const { supabase, user } = await requireAdmin()

  // Get the verification job
  const { data: job, error: jobError } = await supabase
    .from('verification_jobs')
    .select('id, business_id')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return { error: 'Verification job not found' }
  }

  // Update the job
  await supabase
    .from('verification_jobs')
    .update({
      status: decision,
      final_decision: decision,
      reviewer_id: user.id,
    })
    .eq('id', jobId)

  // Create admin review record
  await supabase.from('admin_reviews').insert({
    verification_job_id: jobId,
    reviewer_id: user.id,
    decision,
    notes: notes || null,
  })

  // Update business verification status
  await supabase
    .from('businesses')
    .update({ verification_status: decision })
    .eq('id', job.business_id)

  revalidatePath('/admin/verification')
  revalidatePath('/admin')
  return { success: true }
}

// ─── Admin: Approve/Reject Verification by Business ID ──────────────

export async function adminApproveVerification(
  businessId: string,
  notes?: string
) {
  const { supabase, user } = await requireAdmin()

  // Update business
  await supabase
    .from('businesses')
    .update({ verification_status: 'approved' })
    .eq('id', businessId)

  // Create admin review if there's a verification job
  const { data: latestJob } = await supabase
    .from('verification_jobs')
    .select('id')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestJob) {
    await supabase
      .from('verification_jobs')
      .update({ status: 'approved', final_decision: 'approved', reviewer_id: user.id })
      .eq('id', latestJob.id)

    await supabase.from('admin_reviews').insert({
      verification_job_id: latestJob.id,
      reviewer_id: user.id,
      decision: 'approved',
      notes: notes || null,
    })
  }

  revalidatePath('/admin/verification')
  revalidatePath('/admin')
  return { success: true }
}

export async function adminRejectVerification(
  businessId: string,
  notes?: string
) {
  const { supabase, user } = await requireAdmin()

  await supabase
    .from('businesses')
    .update({ verification_status: 'rejected' })
    .eq('id', businessId)

  const { data: latestJob } = await supabase
    .from('verification_jobs')
    .select('id')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestJob) {
    await supabase
      .from('verification_jobs')
      .update({ status: 'rejected', final_decision: 'rejected', reviewer_id: user.id })
      .eq('id', latestJob.id)

    await supabase.from('admin_reviews').insert({
      verification_job_id: latestJob.id,
      reviewer_id: user.id,
      decision: 'rejected',
      notes: notes || null,
    })
  }

  revalidatePath('/admin/verification')
  revalidatePath('/admin')
  return { success: true }
}

// ─── Admin: Bulk Verify Seeds ───────────────────────────────────────

export async function bulkVerifySeeds() {
  const { supabase } = await requireAdmin()

  // Approve all OSM seeds that aren't already approved
  const { data: seeds } = await supabase
    .from('businesses')
    .select('id')
    .eq('listing_source', 'osm')
    .neq('verification_status', 'approved')

  if (!seeds || seeds.length === 0) {
    return { count: 0 }
  }

  const ids = seeds.map((s) => s.id)

  await supabase
    .from('businesses')
    .update({ verification_status: 'approved' })
    .in('id', ids)

  revalidatePath('/admin')
  return { count: ids.length }
}
