'use server'

import { createClient } from '@/lib/supabase/server'
import { MAX_PHOTOS } from '@/lib/constants'
import { extractStoragePath } from '@/lib/photo-utils'
import { revalidatePath } from 'next/cache'
import { getUserEntitlements } from '@/lib/entitlements'
import * as pwService from '@/lib/pw-service'

// ─── Helpers ────────────────────────────────────────────────────────

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
    .select('id, owner_id, slug')
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

/**
 * Sanitise a file name for use as a storage object key.
 */
function sanitiseFileName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .toLowerCase()
}

/**
 * Delete a photo file from Supabase Storage.
 */
export async function removePhotoFromStorage(url: string) {
  const supabase = await createClient()
  const storagePath = extractStoragePath(url)
  if (storagePath) {
    await supabase.storage.from('photos').remove([storagePath])
  } else {
    console.error('Failed to parse photo URL for storage deletion:', url)
  }
}

/**
 * Check if a business is published/paused (requires pending workflow).
 */
function isPublishedOrPaused(status: string): boolean {
  return status === 'published' || status === 'paused'
}

// ─── Server Actions ─────────────────────────────────────────────────

export async function getUploadUrl(businessId: string, fileName: string) {
  const { supabase, user } = await verifyBusinessOwnership(businessId)

  // Check plan tier via canonical entitlements — photos require premium
  const entitlements = await getUserEntitlements(supabase, user.id)
  if (!entitlements.canUploadPhotos) {
    return { error: 'premium_required' }
  }

  // Check current photo count (exclude pending_delete — they'll be removed on approval)
  const { count, error: countError } = await supabase
    .from('photos')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .neq('status', 'pending_delete')

  if (countError) {
    return { error: 'Failed to check photo count. Please try again.' }
  }

  if (count !== null && count >= MAX_PHOTOS) {
    return {
      error: `You can upload a maximum of ${MAX_PHOTOS} photos. Please remove one before uploading another.`,
    }
  }

  // Generate a unique storage path
  const sanitised = sanitiseFileName(fileName)
  const timestamp = Date.now()
  const storagePath = `${businessId}/${timestamp}-${sanitised}`

  // Create a signed upload URL for the 'photos' bucket
  const { data, error } = await supabase.storage
    .from('photos')
    .createSignedUploadUrl(storagePath)

  if (error) {
    return { error: 'Failed to generate upload URL. Please try again.' }
  }

  return {
    data: {
      signedUrl: data.signedUrl,
      path: storagePath,
      token: data.token,
    },
  }
}

export async function addPhoto(
  businessId: string,
  url: string,
  sortOrder: number
) {
  const { supabase, user, business } = await verifyBusinessOwnership(businessId)

  const guard = await pwService.getEditGuard(businessId)
  if (guard.underReview) {
    return { error: 'This listing is currently under review and cannot be edited.' }
  }

  // Check plan tier via canonical entitlements — photos require premium
  const entitlements = await getUserEntitlements(supabase, user.id)
  if (!entitlements.canUploadPhotos) {
    return { error: 'premium_required' }
  }

  // Check current photo count (exclude pending_delete)
  const { count, error: countError } = await supabase
    .from('photos')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .neq('status', 'pending_delete')

  if (countError) {
    return { error: 'Failed to check photo count. Please try again.' }
  }

  if (count !== null && count >= MAX_PHOTOS) {
    return {
      error: `You can have a maximum of ${MAX_PHOTOS} photos.`,
    }
  }

  // Image moderation: block explicit content at upload time
  const { moderateImages } = await import('@/lib/verification')
  const [imageResult] = await moderateImages([url])
  if (!imageResult.safe || imageResult.adult_content >= 0.5 || imageResult.violence >= 0.5) {
    if (imageResult.error_type === 'verification_unavailable') {
      // Don't delete the photo — it may be fine, verification just failed
      return { error: 'Image verification is temporarily unavailable. Please try again in a moment.' }
    }
    await removePhotoFromStorage(url)
    return { error: 'This image violates our content guidelines and cannot be uploaded.' }
  }

  // Determine status: pending_add for live listings, live for drafts
  const photoStatus = guard.isLive ? 'pending_add' : 'live'

  const { data: photo, error } = await supabase
    .from('photos')
    .insert({
      business_id: businessId,
      url,
      sort_order: sortOrder,
      status: photoStatus,
    })
    .select()
    .single()

  if (error) {
    return { error: 'Failed to save photo record. Please try again.' }
  }

  revalidatePath('/dashboard')
  revalidatePath(`/business/${business.slug}`)
  return { data: photo }
}

export async function deletePhoto(photoId: string) {
  const { supabase, user } = await getAuthenticatedUser()

  // Fetch the photo and verify ownership via the business
  const { data: photo, error: fetchError } = await supabase
    .from('photos')
    .select('id, business_id, url, status')
    .eq('id', photoId)
    .single()

  if (fetchError || !photo) {
    return { error: 'Photo not found' }
  }

  // Verify ownership of the parent business
  const { data: business, error: bizError } = await supabase
    .from('businesses')
    .select('id, owner_id, slug')
    .eq('id', photo.business_id)
    .single()

  if (bizError || !business) {
    return { error: 'Business not found' }
  }

  if (business.owner_id !== user.id) {
    return { error: 'You do not have permission to delete this photo' }
  }

  const guard = await pwService.getEditGuard(photo.business_id)
  if (guard.underReview) {
    return { error: 'This listing is currently under review and cannot be edited.' }
  }

  // If listing is live and photo is 'live':
  //   → Mark as pending_delete (will be cleaned up on approval)
  // If photo is 'pending_add' (not yet approved):
  //   → Delete immediately from DB + storage (it was never live)
  // If listing is draft:
  //   → Delete immediately from DB + storage

  if (guard.isLive && photo.status === 'live') {
    // Mark for pending deletion
    const { error: updateError } = await supabase
      .from('photos')
      .update({ status: 'pending_delete' })
      .eq('id', photoId)

    if (updateError) {
      return { error: 'Failed to mark photo for deletion. Please try again.' }
    }
  } else {
    // Delete immediately (draft listing OR pending_add photo)
    const storagePath = extractStoragePath(photo.url)
    if (storagePath) {
      await supabase.storage.from('photos').remove([storagePath])
    } else {
      console.error('Failed to parse photo URL for storage deletion:', photo.url)
    }

    const { error: deleteError } = await supabase
      .from('photos')
      .delete()
      .eq('id', photoId)

    if (deleteError) {
      return { error: 'Failed to delete photo. Please try again.' }
    }
  }

  revalidatePath('/dashboard')
  revalidatePath(`/business/${business.slug}`)
  return { success: true }
}

export async function reorderPhotos(
  businessId: string,
  photoIds: string[]
) {
  const { supabase, business } = await verifyBusinessOwnership(businessId)

  const guard = await pwService.getEditGuard(businessId)
  if (guard.underReview) {
    return { error: 'This listing is currently under review and cannot be edited.' }
  }

  // Update sort_order for each photo
  const updates = photoIds.map((photoId, index) =>
    supabase
      .from('photos')
      .update({ sort_order: index })
      .eq('id', photoId)
      .eq('business_id', businessId)
  )

  const results = await Promise.all(updates)

  const hasError = results.some((result) => result.error)
  if (hasError) {
    return { error: 'Failed to reorder photos. Please try again.' }
  }

  revalidatePath('/dashboard')
  revalidatePath(`/business/${business.slug}`)
  return { success: true }
}
