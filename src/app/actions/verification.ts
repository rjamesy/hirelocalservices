'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit'
import {
  runDeterministicChecks,
  runAIContentReview,
  makeVerificationDecision,
} from '@/lib/verification'
import { createNotification } from '@/app/actions/notifications'

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
      id, name, slug, description, phone, email_contact, website, abn,
      listing_source, verification_status, created_at, pending_changes,
      verification_jobs (
        id, deterministic_result, ai_result, final_decision, created_at
      ),
      photos (id, url, sort_order, status),
      testimonials (id, author_name, text, rating, status)
    `,
      { count: 'exact' }
    )
    .eq('verification_status', 'pending')
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
  const { removePhotoFromStorage } = await import('@/app/actions/photos')

  // Fetch business with pending_changes
  const { data: biz } = await supabase
    .from('businesses')
    .select('id, slug, pending_changes')
    .eq('id', businessId)
    .single()

  // If there are pending_changes, apply them to main columns
  if (biz?.pending_changes) {
    const pending = biz.pending_changes as Record<string, unknown>
    const updateData: Record<string, unknown> = {
      verification_status: 'approved',
      status: 'published',
      pending_changes: null,
    }

    // Merge pending fields into main columns
    if (pending.name !== undefined) updateData.name = pending.name
    if (pending.description !== undefined) updateData.description = pending.description
    if (pending.phone !== undefined) updateData.phone = pending.phone
    if (pending.email_contact !== undefined) updateData.email_contact = pending.email_contact
    if (pending.website !== undefined) updateData.website = pending.website
    if (pending.abn !== undefined) updateData.abn = pending.abn

    await supabase.from('businesses').update(updateData).eq('id', businessId)

    // Sync business_contacts with new values
    await supabase
      .from('business_contacts')
      .upsert({
        business_id: businessId,
        phone: (pending.phone as string) || null,
        email: (pending.email_contact as string) || null,
        website: (pending.website as string) || null,
      }, { onConflict: 'business_id' })

    // Refresh search index
    await supabase.rpc('refresh_search_index', { p_business_id: businessId })
  } else {
    // No pending changes — just approve
    await supabase
      .from('businesses')
      .update({ verification_status: 'approved', status: 'published' })
      .eq('id', businessId)

    // Refresh search index
    await supabase.rpc('refresh_search_index', { p_business_id: businessId })
  }

  // ─── Promote pending photos/testimonials on approval ──────────
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

  await logAudit(supabase, {
    action: 'verification_completed',
    entityType: 'listing',
    entityId: businessId,
    actorId: user.id,
    details: { decision: 'approved', admin_notes: notes || null },
  })

  // Notify owner
  const { data: bizOwner } = await supabase
    .from('businesses')
    .select('owner_id, name')
    .eq('id', businessId)
    .single()

  if (bizOwner?.owner_id) {
    await createNotification(supabase, {
      userId: bizOwner.owner_id,
      type: 'verification_approved',
      title: 'Listing Approved',
      message: `Your listing "${bizOwner.name}" has been approved and is now live.`,
      metadata: { businessId },
    })
  }

  revalidatePath('/admin/verification')
  revalidatePath('/admin')
  revalidatePath('/dashboard')
  if (biz?.slug) revalidatePath(`/business/${biz.slug}`)
  return { success: true }
}

export async function adminRejectVerification(
  businessId: string,
  notes?: string
) {
  const { supabase, user } = await requireAdmin()
  const { removePhotoFromStorage } = await import('@/app/actions/photos')

  // Set rejected — keep pending_changes intact so user can edit and re-submit
  await supabase
    .from('businesses')
    .update({ verification_status: 'rejected' })
    .eq('id', businessId)

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

  // pending_delete → revert to live
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

  await logAudit(supabase, {
    action: 'verification_completed',
    entityType: 'listing',
    entityId: businessId,
    actorId: user.id,
    details: { decision: 'rejected', admin_notes: notes || null },
  })

  // Notify owner
  const { data: rejBizOwner } = await supabase
    .from('businesses')
    .select('owner_id, name')
    .eq('id', businessId)
    .single()

  if (rejBizOwner?.owner_id) {
    await createNotification(supabase, {
      userId: rejBizOwner.owner_id,
      type: 'verification_rejected',
      title: 'Listing Rejected',
      message: `Your listing "${rejBizOwner.name}" has been rejected.${notes ? ` Notes: ${notes}` : ' Please review and resubmit.'}`,
      metadata: { businessId, notes },
    })
  }

  revalidatePath('/admin/verification')
  revalidatePath('/admin')
  return { success: true }
}

// ─── Admin: Bulk Verify Seeds ───────────────────────────────────────

export async function bulkVerifySeeds() {
  const { supabase, user } = await requireAdmin()

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

  await logAudit(supabase, {
    action: 'verification_completed',
    entityType: 'listing',
    entityId: 'bulk',
    actorId: user.id,
    details: { bulk_verify_seeds: true, count: ids.length },
  })

  revalidatePath('/admin')
  return { count: ids.length }
}
