'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getMyBusiness, getMyBusinesses, getUserPlan } from '@/app/actions/business'
import { addPhoto, deletePhoto, reorderPhotos, getUploadUrl } from '@/app/actions/photos'
import { MAX_PHOTOS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import LoadingSpinner from '@/components/LoadingSpinner'
import PhotoUploader from '@/components/PhotoUploader'
import BusinessSelector from '@/components/BusinessSelector'

// ─── Types ─────────────────────────────────────────────────────────────

interface Photo {
  id: string
  url: string
  sort_order: number
}

// ─── Toast Component ───────────────────────────────────────────────────

function Toast({
  message,
  type,
  onClose,
}: {
  message: string
  type: 'success' | 'error'
  onClose: () => void
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg',
        type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
      )}
    >
      {message}
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────

function PhotosContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bid = searchParams.get('bid')

  const [loading, setLoading] = useState(true)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [reordering, setReordering] = useState(false)
  const [canUploadPhotos, setCanUploadPhotos] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [allBusinesses, setAllBusinesses] = useState<
    { id: string; name: string; status: string; billing_status: string }[]
  >([])
  const [showSelector, setShowSelector] = useState(false)

  // ─── Fetch photos on mount ──────────────────────────────────────

  const fetchPhotos = useCallback(async () => {
    try {
      setLoading(true)

      // If no bid, check for multiple businesses
      if (!bid) {
        const businesses = await getMyBusinesses()
        if (businesses.length > 1) {
          setAllBusinesses(businesses)
          setShowSelector(true)
          setLoading(false)
          return
        }
      }

      const business = await getMyBusiness(bid ?? undefined)

      if (!business) {
        setBusinessId(null)
        setPhotos([])
        return
      }

      setBusinessId(business.id)

      // Check plan tier for photo access
      const plan = await getUserPlan()
      setCanUploadPhotos(plan === 'premium' || plan === 'premium_annual')

      const sortedPhotos = [...(business.photos ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order
      )
      setPhotos(sortedPhotos as Photo[])
    } catch {
      setToast({ message: 'Failed to load photos.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [bid])

  useEffect(() => {
    fetchPhotos()
  }, [fetchPhotos])

  // ─── Upload handler ─────────────────────────────────────────────

  async function handleUpload(file: File) {
    if (!businessId) return

    if (photos.length >= MAX_PHOTOS) {
      setToast({ message: `You can have a maximum of ${MAX_PHOTOS} photos.`, type: 'error' })
      return
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setToast({ message: 'Only JPEG, PNG, and WebP images are allowed.', type: 'error' })
      return
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      setToast({ message: 'File must be smaller than 5MB.', type: 'error' })
      return
    }

    setUploading(true)
    try {
      // Get a signed upload URL from the server
      const uploadResult = await getUploadUrl(businessId, file.name)

      if ('error' in uploadResult) {
        setToast({ message: typeof uploadResult.error === 'string' ? uploadResult.error : 'Failed to get upload URL.', type: 'error' })
        return
      }

      // Upload the file to the signed URL
      const uploadResponse = await fetch(uploadResult.data.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })

      if (!uploadResponse.ok) {
        setToast({ message: 'Failed to upload file. Please try again.', type: 'error' })
        return
      }

      // Build the public URL from the storage path
      const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/photos/${uploadResult.data.path}`

      // Register the photo in the database
      const newSortOrder = photos.length > 0
        ? Math.max(...photos.map((p) => p.sort_order)) + 1
        : 0

      const photoResult = await addPhoto(businessId, publicUrl, newSortOrder)

      if ('error' in photoResult) {
        setToast({ message: typeof photoResult.error === 'string' ? photoResult.error : 'Failed to save photo.', type: 'error' })
        return
      }

      setToast({ message: 'Photo uploaded successfully.', type: 'success' })
      await fetchPhotos()
    } catch {
      setToast({ message: 'An unexpected error occurred during upload.', type: 'error' })
    } finally {
      setUploading(false)
    }
  }

  // ─── Delete handler ─────────────────────────────────────────────

  async function handleDelete(photoId: string) {
    if (!businessId) return

    const confirmed = window.confirm('Are you sure you want to delete this photo?')
    if (!confirmed) return

    setDeletingId(photoId)
    try {
      const result = await deletePhoto(photoId)

      if ('error' in result) {
        setToast({ message: typeof result.error === 'string' ? result.error : 'Failed to delete photo.', type: 'error' })
        return
      }

      setPhotos((prev) => prev.filter((p) => p.id !== photoId))
      setToast({ message: 'Photo deleted.', type: 'success' })
    } catch {
      setToast({ message: 'An unexpected error occurred.', type: 'error' })
    } finally {
      setDeletingId(null)
    }
  }

  // ─── Reorder handlers ──────────────────────────────────────────

  async function handleMoveUp(index: number) {
    if (index === 0 || !businessId) return
    await swapPhotos(index, index - 1)
  }

  async function handleMoveDown(index: number) {
    if (index === photos.length - 1 || !businessId) return
    await swapPhotos(index, index + 1)
  }

  async function swapPhotos(indexA: number, indexB: number) {
    if (!businessId) return

    setReordering(true)
    try {
      const newPhotos = [...photos]
      const temp = newPhotos[indexA]
      newPhotos[indexA] = newPhotos[indexB]
      newPhotos[indexB] = temp

      // Update sort orders
      const reorderedPhotos = newPhotos.map((p, i) => ({
        ...p,
        sort_order: i,
      }))

      setPhotos(reorderedPhotos)

      // Save new order to server
      const photoIds = reorderedPhotos.map((p) => p.id)
      const result = await reorderPhotos(businessId, photoIds)

      if ('error' in result) {
        // Revert on error
        await fetchPhotos()
        setToast({ message: typeof result.error === 'string' ? result.error : 'Failed to reorder photos.', type: 'error' })
        return
      }
    } catch {
      await fetchPhotos()
      setToast({ message: 'An unexpected error occurred.', type: 'error' })
    } finally {
      setReordering(false)
    }
  }

  // ─── Loading state ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  // ─── Business selector for multi-listing users ─────────────────

  if (showSelector) {
    return (
      <BusinessSelector
        businesses={allBusinesses}
        onSelect={(id) => router.push(`/dashboard/photos?bid=${id}`)}
        title="Photos"
        subtitle="Choose a listing to manage photos for."
      />
    )
  }

  // ─── No business ────────────────────────────────────────────────

  if (!businessId) {
    return (
      <div className="mx-auto max-w-2xl text-center py-12">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21z" />
        </svg>
        <h2 className="mt-4 text-lg font-semibold text-gray-900">No Business Listing</h2>
        <p className="mt-2 text-sm text-gray-500">
          Create a business listing first before adding photos.
        </p>
        <a
          href="/dashboard/listing"
          className="mt-4 inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          Create Listing
        </a>
      </div>
    )
  }

  // ─── Premium required ───────────────────────────────────────────

  if (!canUploadPhotos) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900">Photos</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload photos to showcase your work and attract more customers.
        </p>

        <div className="mt-8 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-brand-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21z" />
          </svg>
          <h3 className="mt-4 text-lg font-semibold text-brand-900">Premium Feature</h3>
          <p className="mt-2 text-sm text-brand-700">
            Photo galleries are available on Premium plans. Upgrade to showcase your work with up to 10 photos.
          </p>
          <a
            href="/dashboard/billing"
            className="mt-6 inline-flex items-center rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            Upgrade to Premium
          </a>
        </div>

        {/* Toast */}
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </div>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Photos</h1>
          <p className="mt-1 text-sm text-gray-500">
            {photos.length} of {MAX_PHOTOS} photos
          </p>
        </div>
      </div>

      {/* Upload area */}
      {photos.length < MAX_PHOTOS && (
        <div className="mt-6">
          <PhotoUploader
            onUpload={handleUpload}
            uploading={uploading}
            maxPhotos={MAX_PHOTOS}
            currentCount={photos.length}
          />
        </div>
      )}

      {photos.length >= MAX_PHOTOS && (
        <div className="mt-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-sm text-yellow-800">
            You have reached the maximum of {MAX_PHOTOS} photos. Delete a photo to upload a new one.
          </p>
        </div>
      )}

      {/* Photos grid */}
      {photos.length === 0 ? (
        <div className="mt-8 rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21z" />
          </svg>
          <h3 className="mt-3 text-sm font-semibold text-gray-900">No photos yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Upload photos to showcase your work and attract more customers.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white"
            >
              {/* Photo */}
              <div className="aspect-[4/3] overflow-hidden bg-gray-100">
                <img
                  src={photo.url}
                  alt={`Photo ${index + 1}`}
                  className="h-full w-full object-cover"
                />
              </div>

              {/* Overlay controls */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                {/* Move up */}
                <button
                  type="button"
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0 || reordering}
                  className={cn(
                    'rounded-lg bg-white p-2 text-gray-700 shadow-sm hover:bg-gray-100 transition-colors',
                    index === 0 ? 'opacity-50 cursor-not-allowed' : ''
                  )}
                  title="Move up"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                  </svg>
                </button>

                {/* Move down */}
                <button
                  type="button"
                  onClick={() => handleMoveDown(index)}
                  disabled={index === photos.length - 1 || reordering}
                  className={cn(
                    'rounded-lg bg-white p-2 text-gray-700 shadow-sm hover:bg-gray-100 transition-colors',
                    index === photos.length - 1 ? 'opacity-50 cursor-not-allowed' : ''
                  )}
                  title="Move down"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => handleDelete(photo.id)}
                  disabled={deletingId === photo.id}
                  className="rounded-lg bg-red-600 p-2 text-white shadow-sm hover:bg-red-700 transition-colors"
                  title="Delete photo"
                >
                  {deletingId === photo.id ? (
                    <LoadingSpinner />
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Sort order badge */}
              <div className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
                {index + 1}
              </div>

              {/* First photo badge */}
              {index === 0 && (
                <div className="absolute top-2 right-2 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-medium text-white">
                  Cover
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}

export default function PhotosPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <PhotosContent />
    </Suspense>
  )
}
