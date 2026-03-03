'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  createBusinessDraft,
  updateBusiness,
  updateBusinessLocation,
  updateBusinessCategories,
  publishChanges,
  getMyBusiness,
  getListingsPageData,
  getMyEntitlements,
  findPotentialDuplicates,
  saveDuplicateChoice,
} from '@/app/actions/business'
import type { DuplicateCandidate } from '@/lib/types'
import { createBusinessSchema, locationSchema } from '@/lib/validations'
import { AU_STATES, RADIUS_OPTIONS, MAX_PHOTOS, MAX_TESTIMONIALS, BUSINESS_NAME_MAX } from '@/lib/constants'
import type { Entitlements } from '@/lib/entitlements'
import type { QualityResult } from '@/lib/listing-quality'
import { cn, formatPhone } from '@/lib/utils'
import LoadingSpinner from '@/components/LoadingSpinner'
import ListingsCommandCenter from '@/components/ListingsCommandCenter'
import CategoryPicker from '@/components/CategoryPicker'
import PhotoUploader from '@/components/PhotoUploader'
import TestimonialForm from '@/components/TestimonialForm'
import TestimonialCard from '@/components/TestimonialCard'
import { addPhoto, deletePhoto, reorderPhotos, getUploadUrl } from '@/app/actions/photos'
import { addTestimonial, deleteTestimonial } from '@/app/actions/testimonials'
import { getPublicProtectionFlags } from '@/app/actions/protection'
import TurnstileWidget from '@/components/TurnstileWidget'

// ─── Types ─────────────────────────────────────────────────────────────

interface Category {
  id: string
  name: string
  slug: string
  parent_id: string | null
  synonyms?: string[]
  keywords?: string[]
  sort_order?: number
}

interface PendingChanges {
  name?: string
  description?: string | null
  phone?: string | null
  email_contact?: string | null
  website?: string | null
  abn?: string | null
}

interface BusinessData {
  id: string
  name: string
  slug: string
  description: string | null
  phone: string | null
  email_contact: string | null
  website: string | null
  abn: string | null
  status?: string
  verification_status?: string
  pending_changes?: PendingChanges | null
  location: {
    suburb: string
    state: string
    postcode: string
    address_text: string | null
    service_radius_km: number
  } | null
  categories: Array<{
    category_id: string
    categories?: Category
  }>
  photos: Array<{ id: string; url: string; sort_order: number; status?: string }>
  testimonials: Array<{
    id: string
    author_name: string
    text: string
    rating: number
    status?: string
  }>
  billing_status?: string
  duplicate_user_choice?: 'matched' | 'not_matched' | 'unknown' | null
  duplicate_of_business_id?: string | null
  duplicate_confidence?: number | null
}

type FieldErrors = Record<string, string[] | undefined>

// ─── Steps ─────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Business Details' },
  { id: 2, label: 'Categories' },
  { id: 3, label: 'Location' },
  { id: 4, label: 'Photos' },
  { id: 5, label: 'Testimonials' },
  { id: 6, label: 'Preview' },
] as const

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
        'fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg transition-all',
        type === 'success'
          ? 'bg-green-600 text-white'
          : 'bg-red-600 text-white'
      )}
    >
      {type === 'success' ? (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      ) : (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
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

function ListingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bid = searchParams.get('bid')
  const stepParam = searchParams.get('step')

  // Multi-business command center state
  const [allBusinesses, setAllBusinesses] = useState<
    { id: string; name: string; slug: string; status: string; suburb?: string | null; state?: string | null; quality?: QualityResult; verification_status?: string; pending_changes?: unknown | null; suspended_reason?: string | null }[]
  >([])
  const [canCreateMore, setCanCreateMore] = useState(false)
  const [showCommandCenter, setShowCommandCenter] = useState(false)

  // Global state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [business, setBusiness] = useState<BusinessData | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [toast, setToast] = useState<{
    message: string
    type: 'success' | 'error'
  } | null>(null)

  // CAPTCHA for publish
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaRequired, setCaptchaRequired] = useState(false)

  // Publish rejection state
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishDisabled, setPublishDisabled] = useState(false)
  const [upgradeGating, setUpgradeGating] = useState<{
    code: string
    minimumPlan: string
    currentPlan: string | null
    allowedPlans: string[]
    photoCount: number
    testimonialCount: number
    returnTo: string
  } | null>(null)

  // Duplicate detection state
  const [dupeCandidates, setDupeCandidates] = useState<DuplicateCandidate[]>([])
  const [dupeLoading, setDupeLoading] = useState(false)
  const [dupeChoice, setDupeChoice] = useState<'matched' | 'not_matched' | null>(null)
  const [dupeMatchedId, setDupeMatchedId] = useState<string | null>(null)
  const [dupeSaving, setDupeSaving] = useState(false)

  // Step 1: Business details
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [emailContact, setEmailContact] = useState('')
  const [description, setDescription] = useState('')
  const [abn, setAbn] = useState('')
  const [step1Errors, setStep1Errors] = useState<FieldErrors>({})

  // Step 2: Categories
  const [primaryCategory, setPrimaryCategory] = useState<string | null>(null)
  const [secondaryCategories, setSecondaryCategories] = useState<string[]>([])
  const [step2Error, setStep2Error] = useState<string | null>(null)

  // Step 3: Location
  const [suburb, setSuburb] = useState('')
  const [state, setState] = useState('')
  const [postcode, setPostcode] = useState('')
  const [serviceRadius, setServiceRadius] = useState(25)
  const [step3Errors, setStep3Errors] = useState<FieldErrors>({})

  // Step 4: Photos
  const [photos, setPhotos] = useState<{ id: string; url: string; sort_order: number; status?: string }[]>([])
  const [uploadStatus, setUploadStatus] = useState<'uploading' | 'validating' | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null)
  const [reordering, setReordering] = useState(false)

  // Step 5: Testimonials
  const [testimonials, setTestimonials] = useState<{ id: string; author_name: string; text: string; rating: number; created_at: string; status?: string }[]>([])
  const [submittingTestimonial, setSubmittingTestimonial] = useState(false)
  const [deletingTestimonialId, setDeletingTestimonialId] = useState<string | null>(null)

  // Plan-based limits via canonical entitlements
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null)
  const descLimit = entitlements?.descriptionLimit ?? 250
  const canUploadPhotos = entitlements?.canUploadPhotos ?? false
  const canAddTestimonials = entitlements?.canAddTestimonials ?? false

  const isBillingSuspended = business?.billing_status === 'billing_suspended'
  const isUnderReview = business?.verification_status === 'pending' && business?.status !== 'draft'

  // ─── Fetch data on mount ─────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setShowCommandCenter(false)

      // bid=new: start fresh editor (check canCreateMore first)
      if (bid === 'new') {
        const pageData = await getListingsPageData()
        if (!pageData.canCreateMore) {
          setToast({ message: "You've reached your listing limit.", type: 'error' })
          router.push('/dashboard/billing')
          return
        }
        // Fall through to load editor with no business
        const [categoriesRes, ent] = await Promise.all([
          fetch('/api/categories').then((res) => (res.ok ? res.json() : [])),
          getMyEntitlements(),
        ])
        setEntitlements(ent)
        if (categoriesRes && Array.isArray(categoriesRes)) setCategories(categoriesRes)
        setLoading(false)
        return
      }

      // No bid: always show command center
      if (!bid) {
        const pageData = await getListingsPageData()
        setAllBusinesses(pageData.businesses)
        setCanCreateMore(pageData.canCreateMore)
        setShowCommandCenter(true)
        setLoading(false)
        return
      }

      // Fetch business, categories, and entitlements in parallel
      const [businessData, categoriesRes, ent] = await Promise.all([
        getMyBusiness(bid ?? undefined),
        fetch('/api/categories').then((res) =>
          res.ok ? res.json() : []
        ),
        getMyEntitlements(),
      ])

      setEntitlements(ent)

      if (categoriesRes && Array.isArray(categoriesRes)) {
        setCategories(categoriesRes)
      }

      if (businessData) {
        const biz = businessData as unknown as BusinessData
        setBusiness(biz)

        // Pre-fill step 1: overlay pending_changes on top of live values
        const pc = biz.pending_changes
        setName(pc?.name ?? biz.name ?? '')
        setPhone(pc?.phone ?? biz.phone ?? '')
        setWebsite(pc?.website ?? biz.website ?? '')
        setEmailContact(pc?.email_contact ?? biz.email_contact ?? '')
        setDescription(pc?.description ?? biz.description ?? '')
        setAbn(pc?.abn ?? biz.abn ?? '')

        // Pre-fill step 2
        if (biz.categories) {
          const primary = biz.categories.find((c: any) => c.is_primary)
          if (primary) setPrimaryCategory(primary.category_id)
          setSecondaryCategories(
            biz.categories.filter((c: any) => !c.is_primary).map((c: any) => c.category_id)
          )
        }

        // Pre-fill step 3
        if (biz.location) {
          setSuburb(biz.location.suburb ?? '')
          setState(biz.location.state ?? '')
          setPostcode(biz.location.postcode ?? '')
          setServiceRadius(biz.location.service_radius_km ?? 25)
        }

        // Pre-fill step 4: Photos
        if (biz.photos) {
          setPhotos([...biz.photos].sort((a, b) => a.sort_order - b.sort_order))
        }

        // Pre-fill step 5: Testimonials
        if (biz.testimonials) {
          setTestimonials(biz.testimonials as typeof testimonials)
        }

        // Lock to preview step if under review
        if (biz.verification_status === 'pending' && biz.status !== 'draft') {
          setCurrentStep(6)
        } else if (stepParam) {
          // Deep-link to a specific step if ?step= param is present
          const stepNum = parseInt(stepParam, 10)
          if (stepNum >= 1 && stepNum <= 6) {
            setCurrentStep(stepNum)
          }
        }
      }
    } catch {
      setToast({ message: 'Failed to load data. Please refresh.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [bid, stepParam])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    getPublicProtectionFlags().then((flags) => {
      setCaptchaRequired(flags.captcha_required)
    })
  }, [])

  // ─── Step 1: Save business details ───────────────────────────────

  async function saveStep1() {
    setStep1Errors({})

    const parsed = createBusinessSchema(descLimit).safeParse({
      name,
      phone,
      website,
      email_contact: emailContact,
      description,
      abn,
    })

    if (!parsed.success) {
      setStep1Errors(parsed.error.flatten().fieldErrors as FieldErrors)
      return false
    }

    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('name', name)
      formData.append('phone', phone)
      formData.append('website', website)
      formData.append('email_contact', emailContact)
      formData.append('description', description)
      formData.append('abn', abn)

      if (business) {
        // Update existing
        const result = await updateBusiness(business.id, formData)
        if (result.error) {
          if (typeof result.error === 'string') {
            setToast({ message: result.error, type: 'error' })
          } else {
            setStep1Errors(result.error as FieldErrors)
          }
          return false
        }
        if (result.data) {
          setBusiness((prev) => (prev ? { ...prev, ...result.data } : prev))
        }
      } else {
        // Create new draft
        const result = await createBusinessDraft(formData)
        if (result.error) {
          if (typeof result.error === 'string') {
            setToast({ message: result.error, type: 'error' })
          } else {
            setStep1Errors(result.error as FieldErrors)
          }
          return false
        }
        if (result.data) {
          setBusiness(result.data as unknown as BusinessData)
        }
      }

      const isLive = business && (business.status === 'published' || business.status === 'paused')
      setToast({
        message: isLive ? 'Draft saved. Publish when ready.' : 'Business details saved.',
        type: 'success',
      })
      setPublishError(null)
      setPublishDisabled(false)
      return true
    } catch {
      setToast({ message: 'An unexpected error occurred.', type: 'error' })
      return false
    } finally {
      setSaving(false)
    }
  }

  // ─── Step 2: Save categories ─────────────────────────────────────

  async function saveStep2() {
    setStep2Error(null)

    const scrollToStep2Error = () => {
      requestAnimationFrame(() => {
        document.getElementById('step2-footer-error')?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      })
    }

    if (!primaryCategory) {
      setStep2Error('Select a primary category.')
      scrollToStep2Error()
      return false
    }

    if (secondaryCategories.length > 3) {
      setStep2Error('You can select up to 3 additional categories.')
      scrollToStep2Error()
      return false
    }

    if (!business) {
      setStep2Error('Please save your business details first.')
      scrollToStep2Error()
      return false
    }

    setSaving(true)
    try {
      const result = await updateBusinessCategories(
        business.id,
        primaryCategory,
        secondaryCategories
      )
      if (result.error) {
        setStep2Error(typeof result.error === 'string' ? result.error : 'Failed to save categories.')
        scrollToStep2Error()
        return false
      }

      setToast({ message: 'Categories saved.', type: 'success' })
      setPublishError(null)
      setPublishDisabled(false)
      return true
    } catch {
      setToast({ message: 'An unexpected error occurred.', type: 'error' })
      return false
    } finally {
      setSaving(false)
    }
  }

  // ─── Step 3: Save location ──────────────────────────────────────

  async function saveStep3() {
    setStep3Errors({})

    const parsed = locationSchema.safeParse({
      suburb,
      state,
      postcode,
      service_radius_km: serviceRadius,
    })

    if (!parsed.success) {
      setStep3Errors(parsed.error.flatten().fieldErrors as FieldErrors)
      return false
    }

    if (!business) {
      setToast({ message: 'Please save your business details first.', type: 'error' })
      return false
    }

    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('suburb', suburb)
      formData.append('state', state)
      formData.append('postcode', postcode)
      formData.append('service_radius_km', String(serviceRadius))

      const result = await updateBusinessLocation(business.id, formData)
      if (result.error) {
        if (typeof result.error === 'string') {
          setToast({ message: result.error, type: 'error' })
        } else {
          setStep3Errors(result.error as FieldErrors)
        }
        return false
      }

      setToast({ message: 'Location saved.', type: 'success' })
      setPublishError(null)
      setPublishDisabled(false)
      return true
    } catch {
      setToast({ message: 'An unexpected error occurred.', type: 'error' })
      return false
    } finally {
      setSaving(false)
    }
  }

  // ─── Step 4: Photo handlers ─────────────────────────────────────

  async function handlePhotoUpload(file: File) {
    if (!business) return

    if (photos.length >= MAX_PHOTOS) {
      setToast({ message: `Maximum of ${MAX_PHOTOS} photos reached.`, type: 'error' })
      return
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setToast({ message: 'Only JPEG, PNG, and WebP images are allowed.', type: 'error' })
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setToast({ message: 'File must be smaller than 5MB.', type: 'error' })
      return
    }

    setUploadStatus('uploading')
    setUploadProgress(0)
    try {
      const uploadResult = await getUploadUrl(business.id, file.name)
      if ('error' in uploadResult) {
        setToast({ message: typeof uploadResult.error === 'string' ? uploadResult.error : 'Failed to get upload URL.', type: 'error' })
        return
      }

      // Use XMLHttpRequest for upload progress tracking
      const uploadOk = await new Promise<boolean>((resolve) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100))
          }
        })
        xhr.addEventListener('load', () => resolve(xhr.status >= 200 && xhr.status < 300))
        xhr.addEventListener('error', () => resolve(false))
        xhr.addEventListener('abort', () => resolve(false))
        xhr.open('PUT', uploadResult.data.signedUrl)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.send(file)
      })

      if (!uploadOk) {
        setToast({ message: 'Failed to upload file.', type: 'error' })
        return
      }

      setUploadStatus('validating')

      const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/photos/${uploadResult.data.path}`
      const newSortOrder = photos.length > 0 ? Math.max(...photos.map((p) => p.sort_order)) + 1 : 0

      const photoResult = await addPhoto(business.id, publicUrl, newSortOrder)
      if ('error' in photoResult) {
        setToast({ message: typeof photoResult.error === 'string' ? photoResult.error : 'Failed to save photo.', type: 'error' })
        return
      }

      // Refresh business data to get updated photos
      const refreshed = await getMyBusiness(business.id)
      if (refreshed?.photos) {
        setPhotos([...refreshed.photos].sort((a, b) => a.sort_order - b.sort_order))
      }
      setToast({ message: 'Photo uploaded.', type: 'success' })
    } catch {
      setToast({ message: 'An unexpected error occurred during upload.', type: 'error' })
    } finally {
      setUploadStatus(null)
    }
  }

  async function handlePhotoDelete(photoId: string) {
    if (!business) return
    const confirmed = window.confirm('Delete this photo?')
    if (!confirmed) return

    setDeletingPhotoId(photoId)
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
      setDeletingPhotoId(null)
    }
  }

  async function handlePhotoMove(index: number, direction: 'up' | 'down') {
    if (!business) return
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= photos.length) return

    setReordering(true)
    try {
      const newPhotos = [...photos]
      const temp = newPhotos[index]
      newPhotos[index] = newPhotos[targetIndex]
      newPhotos[targetIndex] = temp
      const reordered = newPhotos.map((p, i) => ({ ...p, sort_order: i }))
      setPhotos(reordered)

      const result = await reorderPhotos(business.id, reordered.map((p) => p.id))
      if ('error' in result) {
        // Revert
        const refreshed = await getMyBusiness(business.id)
        if (refreshed?.photos) setPhotos([...refreshed.photos].sort((a, b) => a.sort_order - b.sort_order))
        setToast({ message: 'Failed to reorder photos.', type: 'error' })
      }
    } catch {
      setToast({ message: 'An unexpected error occurred.', type: 'error' })
    } finally {
      setReordering(false)
    }
  }

  // ─── Step 5: Testimonial handlers ─────────────────────────────────

  async function handleAddTestimonial(data: { author_name: string; text: string; rating: number }) {
    if (!business) return

    if (testimonials.length >= MAX_TESTIMONIALS) {
      setToast({ message: `Maximum of ${MAX_TESTIMONIALS} testimonials reached.`, type: 'error' })
      return
    }

    setSubmittingTestimonial(true)
    try {
      const formData = new FormData()
      formData.set('author_name', data.author_name)
      formData.set('text', data.text)
      formData.set('rating', String(data.rating))
      const result = await addTestimonial(business.id, formData)

      if ('error' in result) {
        setToast({ message: typeof result.error === 'string' ? result.error : 'Failed to add testimonial.', type: 'error' })
        return
      }

      // Refresh
      const refreshed = await getMyBusiness(business.id)
      if (refreshed?.testimonials) {
        setTestimonials(refreshed.testimonials as typeof testimonials)
      }
      setToast({ message: 'Testimonial added.', type: 'success' })
    } catch {
      setToast({ message: 'An unexpected error occurred.', type: 'error' })
    } finally {
      setSubmittingTestimonial(false)
    }
  }

  async function handleDeleteTestimonial(testimonialId: string) {
    if (!business) return
    const confirmed = window.confirm('Delete this testimonial?')
    if (!confirmed) return

    setDeletingTestimonialId(testimonialId)
    try {
      const result = await deleteTestimonial(testimonialId)
      if ('error' in result) {
        setToast({ message: typeof result.error === 'string' ? result.error : 'Failed to delete testimonial.', type: 'error' })
        return
      }
      setTestimonials((prev) => prev.filter((t) => t.id !== testimonialId))
      setToast({ message: 'Testimonial deleted.', type: 'success' })
    } catch {
      setToast({ message: 'An unexpected error occurred.', type: 'error' })
    } finally {
      setDeletingTestimonialId(null)
    }
  }

  // ─── Duplicate detection on step 6 ───────────────────────────────

  useEffect(() => {
    if (currentStep !== 6 || !business || isUnderReview) return
    // Skip if already has a saved choice
    if (business.duplicate_user_choice) {
      setDupeChoice(business.duplicate_user_choice === 'matched' ? 'matched' : 'not_matched')
      setDupeMatchedId(business.duplicate_of_business_id ?? null)
      return
    }
    let cancelled = false
    setDupeLoading(true)
    findPotentialDuplicates(business.id).then((result) => {
      if (cancelled) return
      setDupeCandidates(result.candidates)
      setDupeLoading(false)
    }).catch(() => {
      if (!cancelled) setDupeLoading(false)
    })
    return () => { cancelled = true }
  }, [currentStep, business, isUnderReview])

  // Handle post-checkout return (redirect back from Stripe after subscribing/upgrading)
  useEffect(() => {
    const sessionId = searchParams.get('session_id')
    if (sessionId) {
      setToast({ message: 'Subscription activated! You can now submit your listing.', type: 'success' })
      setUpgradeGating(null)
      setPublishError(null)
      setPublishDisabled(false)
      // Clean URL, keep bid + step so fetchData reloads correctly
      window.history.replaceState({}, '', `/dashboard/listing${bid ? `?bid=${bid}&step=6` : ''}`)
      // Re-fetch to reconcile subscription state (entitlements, billing_status)
      fetchData()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleDupeSelect(choice: 'matched' | 'not_matched', matchedId?: string) {
    if (!business) return
    setDupeSaving(true)
    const matchedCandidate = dupeCandidates.find(c => c.id === matchedId)
    const result = await saveDuplicateChoice(
      business.id,
      choice,
      matchedId,
      matchedCandidate?.score,
      dupeCandidates as unknown as Record<string, unknown>[]
    )
    if (!('error' in result)) {
      setDupeChoice(choice)
      setDupeMatchedId(matchedId ?? null)
      setBusiness(prev => prev ? { ...prev, duplicate_user_choice: choice, duplicate_of_business_id: matchedId ?? null } : prev)
    }
    setDupeSaving(false)
  }

  const dupeRequiresChoice = dupeCandidates.some(c => c.score >= 85) && !dupeChoice

  // ─── Step navigation ────────────────────────────────────────────

  async function handleNext() {
    if (isUnderReview) return
    let success = false
    if (currentStep === 1) success = await saveStep1()
    else if (currentStep === 2) success = await saveStep2()
    else if (currentStep === 3) success = await saveStep3()
    else success = true // Steps 4, 5 save immediately on upload/add/delete

    if (success && currentStep < 6) {
      setCurrentStep((prev) => prev + 1)
    }
  }

  function handleBack() {
    if (isUnderReview) return
    if (currentStep > 1) {
      if (currentStep === 6) { setPublishError(null); setPublishDisabled(false) }
      setCurrentStep((prev) => prev - 1)
    }
  }

  // ─── Publish ─────────────────────────────────────────────────────

  async function handlePublish() {
    if (!business || publishDisabled) return
    if (isBillingSuspended) {
      setToast({
        message: 'Your billing is suspended. Please upgrade your plan first.',
        type: 'error',
      })
      return
    }

    // ── Client-side subscription gate ──────────────────────────────────
    // If user has no active subscription, redirect to billing before calling the server.
    if (!entitlements?.isActive) {
      const activePhotos = photos.filter(p => p.status !== 'pending_delete').length
      const activeTestimonials = testimonials.filter(t => t.status !== 'pending_delete').length
      const requiredPlan = (activePhotos > 0 || activeTestimonials > 0) ? 'premium' : 'basic'
      const returnTo = `/dashboard/listing?bid=${business.id}&step=6`
      router.push(
        `/dashboard/billing?returnTo=${encodeURIComponent(returnTo)}&requiredPlan=${requiredPlan}`
      )
      return
    }

    setSaving(true)
    try {
      const result = await publishChanges(business.id, captchaToken ?? undefined)
      if ('error' in result && result.error) {
        if (result.error === 'subscription_required') {
          // Fallback: server also caught it (e.g. subscription expired between page load and click)
          const activePhotos = photos.filter(p => p.status !== 'pending_delete').length
          const activeTestimonials = testimonials.filter(t => t.status !== 'pending_delete').length
          const requiredPlan = (activePhotos > 0 || activeTestimonials > 0) ? 'premium' : 'basic'
          const returnTo = `/dashboard/listing?bid=${business.id}&step=6`
          router.push(
            `/dashboard/billing?returnTo=${encodeURIComponent(returnTo)}&requiredPlan=${requiredPlan}`
          )
          return
        }
        if (result.error === 'upgrade_required' && 'gating' in result) {
          const g = (result as any).gating as {
            code: string; minimumPlan: string; currentPlan: string | null
            allowedPlans: string[]; photoCount: number; testimonialCount: number
            returnTo: string
          }
          const parts: string[] = []
          if (g.photoCount > 0) parts.push(`${g.photoCount} photo${g.photoCount > 1 ? 's' : ''}`)
          if (g.testimonialCount > 0) parts.push(`${g.testimonialCount} testimonial${g.testimonialCount > 1 ? 's' : ''}`)
          setPublishError(
            `Your listing has ${parts.join(' and ')}, which requires a Premium plan. ` +
            `Your current plan is Basic. Please upgrade to publish.`
          )
          setUpgradeGating(g)
          return
        }
        setPublishError(typeof result.error === 'string' ? result.error : 'Failed to publish.')
        setPublishDisabled(true)
        return
      }

      if ('published' in result && result.published) {
        setToast({ message: 'Your listing is now live!', type: 'success' })
        router.push('/dashboard')
      } else {
        // AI validation sent to review or rejected by safety
        const isRejected = result.verification_status === 'rejected'
        if (isRejected) {
          setPublishError(result.message || 'Your listing was rejected. Please fix the issues and try again.')
          setPublishDisabled(true)
          setBusiness((prev) => prev ? { ...prev, verification_status: 'rejected' } : prev)
        } else {
          // pending — show success toast
          setToast({
            message: result.message || 'Your changes are being reviewed. Your live listing is unchanged.',
            type: 'success',
          })
          setBusiness((prev) => prev ? { ...prev, verification_status: result.verification_status || 'pending' } : prev)
        }
      }
    } catch {
      setToast({ message: 'An unexpected error occurred.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  // ─── Render helpers ──────────────────────────────────────────────

  function renderFieldError(errors: FieldErrors, field: string) {
    const fieldErrors = errors[field]
    if (!fieldErrors || fieldErrors.length === 0) return null
    return (
      <p className="mt-1 text-sm text-red-600">{fieldErrors[0]}</p>
    )
  }

  // ─── Loading state ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  // ─── Listings command center ────────────────────────────────────

  if (showCommandCenter) {
    const filterParam = searchParams.get('filter') as 'action_needed' | undefined
    return (
      <ListingsCommandCenter
        businesses={allBusinesses}
        canCreateMore={canCreateMore}
        initialFilter={filterParam || undefined}
      />
    )
  }

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl">
      <h1 data-testid="listing-heading" className="text-2xl font-bold text-gray-900">
        {business ? 'Edit Your Listing' : 'Create Your Listing'}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        {business
          ? 'Update your business details below.'
          : 'Fill in your business details to get started.'}
      </p>

      {isBillingSuspended && (
        <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-orange-800">Billing suspended</h3>
              <p className="mt-1 text-sm text-orange-700">
                Your trial has expired. Upgrade to a paid plan to publish and edit your listing.
              </p>
              <a
                href="/dashboard/billing"
                className="mt-2 inline-flex items-center rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 transition-colors"
              >
                Upgrade Plan
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Steps indicator */}
      <nav className="mt-8" aria-label="Progress">
        <ol className="flex items-center">
          {STEPS.map((step, index) => (
            <li
              key={step.id}
              className={cn(
                'relative',
                index !== STEPS.length - 1 ? 'flex-1 pr-8' : ''
              )}
            >
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    // Block step navigation when under review
                    if (isUnderReview) return
                    // Only allow jumping to completed steps or current
                    if (step.id <= currentStep) {
                      if (currentStep === 6 && step.id < 6) { setPublishError(null); setPublishDisabled(false) }
                      setCurrentStep(step.id)
                    }
                  }}
                  className={cn(
                    'relative flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors',
                    step.id < currentStep
                      ? 'bg-brand-600 text-white hover:bg-brand-700'
                      : step.id === currentStep
                        ? 'border-2 border-brand-600 bg-white text-brand-600'
                        : 'border-2 border-gray-300 bg-white text-gray-500'
                  )}
                >
                  {step.id < currentStep ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    step.id
                  )}
                </button>
                {index !== STEPS.length - 1 && (
                  <div
                    className={cn(
                      'ml-4 h-0.5 flex-1',
                      step.id < currentStep ? 'bg-brand-600' : 'bg-gray-200'
                    )}
                  />
                )}
              </div>
              <span
                className={cn(
                  'absolute -bottom-6 left-0 text-xs font-medium whitespace-nowrap',
                  step.id <= currentStep ? 'text-brand-600' : 'text-gray-500'
                )}
              >
                {step.label}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      {/* Step content */}
      <div className="mt-14 rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
        {/* ── Step 1: Business Details ─────────────────────────── */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Business Details</h2>
              <p className="mt-1 text-sm text-gray-500">
                Basic information about your business.
              </p>
            </div>

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Business Name <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                data-testid="listing-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={BUSINESS_NAME_MAX}
                className={cn(
                  'mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors',
                  step1Errors.name ? 'border-red-300' : 'border-gray-300'
                )}
                placeholder="e.g. Smith's Plumbing"
              />
              <p className="mt-1 text-xs text-gray-400">
                {name.length}/{BUSINESS_NAME_MAX} characters
              </p>
              {renderFieldError(step1Errors, 'name')}
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                id="description"
                data-testid="listing-description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={descLimit}
                className={cn(
                  'mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors',
                  step1Errors.description ? 'border-red-300' : 'border-gray-300'
                )}
                placeholder="Describe your business, services, experience..."
              />
              <p className={cn(
                'mt-1 text-xs',
                description.length >= descLimit ? 'text-red-500' : 'text-gray-400'
              )}>
                {description.length}/{descLimit} characters
              </p>
              {entitlements?.plan !== 'premium_annual' && description.length >= descLimit * 0.9 && (
                <p className="mt-1 text-xs text-brand-600">
                  Need more space? <a href="/dashboard/billing" className="underline">Upgrade your plan</a> for a higher description limit.
                </p>
              )}
              {renderFieldError(step1Errors, 'description')}
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                  Phone
                </label>
                <input
                  id="phone"
                  type="tel"
                  data-testid="listing-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={cn(
                    'mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors',
                    step1Errors.phone ? 'border-red-300' : 'border-gray-300'
                  )}
                  placeholder="04XX XXX XXX"
                />
                {renderFieldError(step1Errors, 'phone')}
              </div>

              <div>
                <label htmlFor="email_contact" className="block text-sm font-medium text-gray-700">
                  Contact Email
                </label>
                <input
                  id="email_contact"
                  type="email"
                  data-testid="listing-email"
                  value={emailContact}
                  onChange={(e) => setEmailContact(e.target.value)}
                  className={cn(
                    'mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors',
                    step1Errors.email_contact ? 'border-red-300' : 'border-gray-300'
                  )}
                  placeholder="hello@yourbusiness.com.au"
                />
                {renderFieldError(step1Errors, 'email_contact')}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="website" className="block text-sm font-medium text-gray-700">
                  Website
                </label>
                <input
                  id="website"
                  type="url"
                  data-testid="listing-website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className={cn(
                    'mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors',
                    step1Errors.website ? 'border-red-300' : 'border-gray-300'
                  )}
                  placeholder="https://yourbusiness.com.au"
                />
                {renderFieldError(step1Errors, 'website')}
              </div>

              <div>
                <label htmlFor="abn" className="block text-sm font-medium text-gray-700">
                  ABN <span className="text-xs text-gray-400">(optional)</span>
                </label>
                <input
                  id="abn"
                  type="text"
                  value={abn}
                  onChange={(e) => setAbn(e.target.value)}
                  className={cn(
                    'mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors',
                    step1Errors.abn ? 'border-red-300' : 'border-gray-300'
                  )}
                  placeholder="11 digit ABN"
                  maxLength={11}
                />
                {renderFieldError(step1Errors, 'abn')}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Categories ───────────────────────────────── */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Categories</h2>
              <p className="mt-1 text-sm text-gray-500">
                Search for your primary service, then optionally add related services from the same group.
              </p>
            </div>

            {categories.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
                <p className="text-sm text-gray-500">
                  No categories available. They will be loaded shortly.
                </p>
              </div>
            ) : (
              <CategoryPicker
                categories={categories}
                primaryCategory={primaryCategory}
                secondaryCategories={secondaryCategories}
                onPrimaryChange={(id) => {
                  setPrimaryCategory(id)
                  if (!id) setSecondaryCategories([])
                }}
                onSecondaryChange={setSecondaryCategories}
                error={step2Error}
              />
            )}
          </div>
        )}

        {/* ── Step 3: Location ─────────────────────────────────── */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Service Location</h2>
              <p className="mt-1 text-sm text-gray-500">
                Where are you based and how far do you service?
              </p>
            </div>

            <div>
              <label htmlFor="suburb" className="block text-sm font-medium text-gray-700">
                Suburb <span className="text-red-500">*</span>
              </label>
              <input
                id="suburb"
                type="text"
                value={suburb}
                onChange={(e) => setSuburb(e.target.value)}
                className={cn(
                  'mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors',
                  step3Errors.suburb ? 'border-red-300' : 'border-gray-300'
                )}
                placeholder="e.g. Surry Hills"
              />
              {renderFieldError(step3Errors, 'suburb')}
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="state" className="block text-sm font-medium text-gray-700">
                  State / Territory <span className="text-red-500">*</span>
                </label>
                <select
                  id="state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className={cn(
                    'mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors',
                    step3Errors.state ? 'border-red-300' : 'border-gray-300'
                  )}
                >
                  <option value="">Select state...</option>
                  {AU_STATES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {renderFieldError(step3Errors, 'state')}
              </div>

              <div>
                <label htmlFor="postcode" className="block text-sm font-medium text-gray-700">
                  Postcode <span className="text-red-500">*</span>
                </label>
                <input
                  id="postcode"
                  type="text"
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  className={cn(
                    'mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors',
                    step3Errors.postcode ? 'border-red-300' : 'border-gray-300'
                  )}
                  placeholder="e.g. 2010"
                  maxLength={4}
                />
                {renderFieldError(step3Errors, 'postcode')}
              </div>
            </div>

            <div>
              <label htmlFor="service_radius" className="block text-sm font-medium text-gray-700">
                Service Radius
              </label>
              <select
                id="service_radius"
                value={serviceRadius}
                onChange={(e) => setServiceRadius(Number(e.target.value))}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors"
              >
                {RADIUS_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">
                How far from your base suburb are you willing to travel?
              </p>
            </div>
          </div>
        )}

        {/* ── Step 4: Photos ──────────────────────────────────── */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Photos</h2>
              <p className="mt-1 text-sm text-gray-500">
                Showcase your work with photos to attract more customers.
              </p>
            </div>

            {(() => {
              // Filter out pending_delete photos from visible list
              const visiblePhotos = photos.filter(p => p.status !== 'pending_delete')
              const hasPendingChanges = photos.some(p => p.status === 'pending_add' || p.status === 'pending_delete')

              return (
              <>
                <p className="text-sm text-gray-700">
                  {visiblePhotos.length} photo{visiblePhotos.length !== 1 ? 's' : ''}, {MAX_PHOTOS - visiblePhotos.length} upload{MAX_PHOTOS - visiblePhotos.length !== 1 ? 's' : ''} remaining
                </p>

                {hasPendingChanges && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm text-amber-800">
                      You have pending photo changes. Publish your listing to submit them for review.
                    </p>
                  </div>
                )}

                {visiblePhotos.length < MAX_PHOTOS && (
                  <PhotoUploader
                    onUpload={handlePhotoUpload}
                    uploadStatus={uploadStatus}
                    uploadProgress={uploadProgress}
                    maxPhotos={MAX_PHOTOS}
                    currentCount={visiblePhotos.length}
                  />
                )}

                {visiblePhotos.length >= MAX_PHOTOS && (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                    <p className="text-sm text-yellow-800">
                      Maximum of {MAX_PHOTOS} photos reached. Delete a photo to upload a new one.
                    </p>
                  </div>
                )}

                {visiblePhotos.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-gray-300 p-8 text-center">
                    <svg className="mx-auto h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21z" />
                    </svg>
                    <p className="mt-2 text-sm text-gray-500">No photos yet. Upload photos above.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {visiblePhotos.map((photo, index) => (
                      <div key={photo.id} className={cn('group relative overflow-hidden rounded-lg border bg-gray-100', photo.status === 'pending_add' ? 'border-amber-300' : 'border-gray-200')}>
                        <div className="aspect-[4/3]">
                          <img src={photo.url} alt={`Photo ${index + 1}`} className="h-full w-full object-cover" />
                        </div>
                        {/* Overlay controls */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => handlePhotoMove(index, 'up')}
                            disabled={index === 0 || reordering}
                            className={cn('rounded bg-white p-1.5 text-gray-700 shadow-sm hover:bg-gray-100', index === 0 && 'opacity-50 cursor-not-allowed')}
                            title="Move left"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePhotoMove(index, 'down')}
                            disabled={index === visiblePhotos.length - 1 || reordering}
                            className={cn('rounded bg-white p-1.5 text-gray-700 shadow-sm hover:bg-gray-100', index === visiblePhotos.length - 1 && 'opacity-50 cursor-not-allowed')}
                            title="Move right"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePhotoDelete(photo.id)}
                            disabled={deletingPhotoId === photo.id}
                            className="rounded bg-red-600 p-1.5 text-white shadow-sm hover:bg-red-700"
                            title="Delete"
                          >
                            {deletingPhotoId === photo.id ? (
                              <LoadingSpinner />
                            ) : (
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            )}
                          </button>
                        </div>
                        {/* Position badge */}
                        <div className="absolute top-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">
                          {index + 1}
                        </div>
                        {index === 0 && (
                          <div className="absolute top-1 right-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-xs font-medium text-white">
                            Cover
                          </div>
                        )}
                        {photo.status === 'pending_add' && (
                          <div className="absolute bottom-1 left-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-medium text-white">
                            Pending
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
              )
            })()}
          </div>
        )}

        {/* ── Step 5: Testimonials ──────────────────────────────── */}
        {currentStep === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Testimonials</h2>
              <p className="mt-1 text-sm text-gray-500">
                Add customer testimonials to build trust with potential clients.
              </p>
            </div>

            {(() => {
              const visibleTestimonials = testimonials.filter(t => t.status !== 'pending_delete')
              const hasPendingTestimonialChanges = testimonials.some(t => t.status === 'pending_add' || t.status === 'pending_delete')

              return (
              <>
                <p className="text-sm text-gray-700">
                  {visibleTestimonials.length} testimonial{visibleTestimonials.length !== 1 ? 's' : ''}, {MAX_TESTIMONIALS - visibleTestimonials.length} remaining
                </p>

                {hasPendingTestimonialChanges && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm text-amber-800">
                      You have pending testimonial changes. Publish your listing to submit them for review.
                    </p>
                  </div>
                )}

                {visibleTestimonials.length < MAX_TESTIMONIALS && (
                  <div className="rounded-xl border border-gray-200 bg-white p-5">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Add Testimonial</h3>
                    <TestimonialForm onSubmit={handleAddTestimonial} submitting={submittingTestimonial} />
                  </div>
                )}

                {visibleTestimonials.length >= MAX_TESTIMONIALS && (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                    <p className="text-sm text-yellow-800">
                      Maximum of {MAX_TESTIMONIALS} testimonials reached. Delete one to add another.
                    </p>
                  </div>
                )}

                {visibleTestimonials.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-gray-300 p-8 text-center">
                    <svg className="mx-auto h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                    </svg>
                    <p className="mt-2 text-sm text-gray-500">No testimonials yet. Add one above.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {visibleTestimonials.map((testimonial) => (
                      <div key={testimonial.id} className={cn('relative', testimonial.status === 'pending_add' && 'ring-2 ring-amber-300 rounded-xl')}>
                        <TestimonialCard
                          author_name={testimonial.author_name}
                          text={testimonial.text}
                          rating={testimonial.rating}
                          created_at={testimonial.created_at}
                        />
                        {testimonial.status === 'pending_add' && (
                          <div className="absolute top-2 left-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">
                            Pending
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteTestimonial(testimonial.id)}
                          disabled={deletingTestimonialId === testimonial.id}
                          className="absolute top-4 right-4 rounded-lg border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-50 transition-colors"
                          title="Delete testimonial"
                        >
                          {deletingTestimonialId === testimonial.id ? (
                            <LoadingSpinner />
                          ) : (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
              )
            })()}
          </div>
        )}

        {/* ── Step 6: Preview ──────────────────────────────────── */}
        {currentStep === 6 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Preview Your Listing</h2>
              <p className="mt-1 text-sm text-gray-500">
                This is how your listing will appear to customers.
              </p>
            </div>

            {/* Verification status banners */}
            {isUnderReview && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <svg className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <div>
                    <h3 className="text-sm font-medium text-amber-800">Changes under review</h3>
                    <p className="mt-1 text-sm text-amber-700">Your changes are being reviewed. Your live listing is unchanged.</p>
                  </div>
                </div>
              </div>
            )}
            {business?.verification_status === 'rejected' && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="flex items-start gap-3">
                  <svg className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <div>
                    <h3 className="text-sm font-medium text-red-800">Changes not approved</h3>
                    <p className="mt-1 text-sm text-red-700">Your changes were not approved. Please edit and resubmit.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Preview card */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              {/* Business header */}
              <div className="border-b border-gray-100 p-6">
                <h3 className="text-xl font-bold text-gray-900">{name || 'Your Business Name'}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                  {suburb && state && (
                    <span className="flex items-center gap-1">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      </svg>
                      {suburb}, {state} {postcode}
                    </span>
                  )}
                  {serviceRadius && (
                    <span className="text-gray-400">
                      Services within {serviceRadius} km
                    </span>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="p-6">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">About</h4>
                <p className="text-sm text-gray-600 whitespace-pre-line">
                  {description || 'No description provided yet.'}
                </p>
              </div>

              {/* Contact details */}
              <div className="border-t border-gray-100 p-6">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Contact Details</h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
                  {phone && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                      </svg>
                      {formatPhone(phone)}
                    </div>
                  )}
                  {emailContact && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                      </svg>
                      {emailContact}
                    </div>
                  )}
                  {website && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                      </svg>
                      {website}
                    </div>
                  )}
                  {abn && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      ABN: {abn}
                    </div>
                  )}
                </div>
              </div>

              {/* Categories */}
              {primaryCategory && (
                <div className="border-t border-gray-100 p-6">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Categories</h4>
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const cat = categories.find((c) => c.id === primaryCategory)
                      return cat ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-800">
                          {cat.name}
                          <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                            Primary
                          </span>
                        </span>
                      ) : null
                    })()}
                    {secondaryCategories.map((catId) => {
                      const cat = categories.find((c) => c.id === catId)
                      return cat ? (
                        <span
                          key={catId}
                          className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700"
                        >
                          {cat.name}
                        </span>
                      ) : null
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Duplicate detection panel */}
            {business && !isUnderReview && dupeCandidates.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h3 className="text-sm font-semibold text-amber-800 mb-2">
                  Possible duplicate {dupeCandidates.length === 1 ? 'match' : 'matches'} found
                </h3>
                <p className="text-xs text-amber-700 mb-3">
                  We found existing listings that may be the same business. Please review and select an option.
                  {dupeCandidates.some(c => c.score >= 85) && !dupeChoice && (
                    <span className="font-semibold"> A selection is required before publishing.</span>
                  )}
                </p>
                <div className="space-y-2">
                  {dupeCandidates.map(c => (
                    <label
                      key={c.id}
                      className={cn(
                        'flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors',
                        dupeChoice === 'matched' && dupeMatchedId === c.id
                          ? 'border-amber-500 bg-amber-100'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      )}
                    >
                      <input
                        type="radio"
                        name="duplicate-choice"
                        checked={dupeChoice === 'matched' && dupeMatchedId === c.id}
                        onChange={() => handleDupeSelect('matched', c.id)}
                        disabled={dupeSaving}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          This is the same business as: <span className="text-amber-700">{c.name}</span>
                        </p>
                        <p className="text-xs text-gray-500">
                          {c.suburb}{c.suburb && c.state ? ', ' : ''}{c.state} {c.postcode}
                          <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            {c.score}% match
                          </span>
                        </p>
                      </div>
                    </label>
                  ))}
                  <label
                    className={cn(
                      'flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors',
                      dupeChoice === 'not_matched'
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    )}
                  >
                    <input
                      type="radio"
                      name="duplicate-choice"
                      checked={dupeChoice === 'not_matched'}
                      onChange={() => handleDupeSelect('not_matched')}
                      disabled={dupeSaving}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Not a match — this is a different business</p>
                    </div>
                  </label>
                </div>
                {dupeSaving && (
                  <p className="mt-2 text-xs text-gray-500">Saving...</p>
                )}
              </div>
            )}

            {dupeLoading && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 flex items-center gap-2">
                <LoadingSpinner />
                <span className="text-sm text-gray-500">Checking for duplicate listings...</span>
              </div>
            )}

            {/* Publish action */}
            {business && (() => {
              const isDraft = business.status === 'draft'
              const isLive = business.status === 'published' || business.status === 'paused'
              const hasPending = !!business.pending_changes
              if (isUnderReview) {
                return (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-medium text-amber-800">
                      Your changes are currently being reviewed. You can edit and re-submit once the review is complete.
                    </p>
                  </div>
                )
              }

              if (isLive && !hasPending) {
                return (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">No unpublished changes. Your listing is up to date.</p>
                  </div>
                )
              }

              return (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {isDraft ? 'Ready to go live?' : 'Publish your changes?'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {isDraft
                          ? 'Publishing makes your listing visible to customers across Australia.'
                          : 'Your changes will be validated before going live.'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-3">
                      <TurnstileWidget
                        captchaRequired={captchaRequired}
                        onSuccess={(token) => setCaptchaToken(token)}
                      />
                      <button
                        type="button"
                        data-testid="listing-publish"
                        onClick={handlePublish}
                        disabled={saving || publishDisabled || dupeRequiresChoice || (captchaRequired && !captchaToken)}
                        className="inline-flex items-center justify-center rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {saving ? (
                        <LoadingSpinner />
                      ) : publishDisabled ? (
                        <>Publish Blocked</>
                      ) : (
                        <>
                          <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.58-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                          </svg>
                          {isDraft ? 'Publish Listing' : 'Publish Changes'}
                        </>
                      )}
                      </button>
                      {publishError && (
                        <div
                          id="publish-error"
                          className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                          role="alert"
                        >
                          {publishError}
                        </div>
                      )}
                      {upgradeGating && (
                        <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 p-4">
                          <p className="text-sm font-medium text-brand-900">Upgrade to publish</p>
                          <p className="mt-1 text-xs text-brand-700">
                            Photos and testimonials require a Premium plan.
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {upgradeGating.allowedPlans.includes('premium') && (
                              <button
                                type="button"
                                onClick={() => {
                                  const returnTo = `/dashboard/listing?bid=${business?.id}&step=6`
                                  router.push(`/dashboard/billing?returnTo=${encodeURIComponent(returnTo)}&requiredPlan=premium`)
                                }}
                                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
                              >
                                Premium - $10/month
                              </button>
                            )}
                            {upgradeGating.allowedPlans.includes('premium_annual') && (
                              <button
                                type="button"
                                onClick={() => {
                                  const returnTo = `/dashboard/listing?bid=${business?.id}&step=6`
                                  router.push(`/dashboard/billing?returnTo=${encodeURIComponent(returnTo)}&requiredPlan=premium`)
                                }}
                                className="rounded-lg border border-brand-600 bg-white px-4 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50 transition-colors"
                              >
                                Annual - $99/year
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── Inline error above footer ────────────────────────── */}
        {step2Error && currentStep === 2 && (
          <div
            id="step2-footer-error"
            className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {step2Error}
          </div>
        )}

        {/* ── Navigation buttons ───────────────────────────────── */}
        <div className="mt-8 flex items-center justify-between border-t border-gray-200 pt-6">
          <button
            type="button"
            data-testid="listing-back"
            onClick={handleBack}
            disabled={currentStep === 1 || isUnderReview}
            className={cn(
              'inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              currentStep === 1 || isUnderReview
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-700 hover:bg-gray-100'
            )}
          >
            <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back
          </button>

          {currentStep < 6 ? (
            <button
              type="button"
              data-testid="listing-next"
              onClick={handleNext}
              disabled={saving || isUnderReview}
              className="inline-flex items-center rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <LoadingSpinner />
              ) : (
                <>
                  {currentStep <= 3 ? 'Save & Continue' : 'Continue'}
                  <svg className="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </>
              )}
            </button>
          ) : isUnderReview ? (
            <button
              type="button"
              onClick={() => router.push('/dashboard/listing')}
              className="inline-flex items-center rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Edit Details
            </button>
          )}
        </div>

        {isUnderReview && currentStep < 6 && (
          <p className="mt-2 text-center text-sm text-amber-600">
            This listing is under review and cannot be edited.
          </p>
        )}
      </div>

      {/* Toast notification */}
      {toast && (
        <div data-testid="listing-toast">
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        </div>
      )}
    </div>
  )
}

// ─── Main Component (with Suspense for useSearchParams) ─────────────

export default function ListingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <ListingContent />
    </Suspense>
  )
}
