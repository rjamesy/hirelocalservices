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
} from '@/app/actions/business'
import { businessSchema, locationSchema } from '@/lib/validations'
import { AU_STATES, RADIUS_OPTIONS } from '@/lib/constants'
import { cn, formatPhone } from '@/lib/utils'
import LoadingSpinner from '@/components/LoadingSpinner'

// ─── Types ─────────────────────────────────────────────────────────────

interface Category {
  id: string
  name: string
  slug: string
  parent_id: string | null
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
  photos: Array<{ id: string; url: string; sort_order: number }>
  testimonials: Array<{
    id: string
    author_name: string
    text: string
    rating: number
  }>
  billing_status?: string
}

type FieldErrors = Record<string, string[] | undefined>

// ─── Steps ─────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Business Details' },
  { id: 2, label: 'Categories' },
  { id: 3, label: 'Location' },
  { id: 4, label: 'Preview' },
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

  // Step 1: Business details
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [emailContact, setEmailContact] = useState('')
  const [description, setDescription] = useState('')
  const [abn, setAbn] = useState('')
  const [step1Errors, setStep1Errors] = useState<FieldErrors>({})

  // Step 2: Categories
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [step2Error, setStep2Error] = useState<string | null>(null)

  // Step 3: Location
  const [suburb, setSuburb] = useState('')
  const [state, setState] = useState('')
  const [postcode, setPostcode] = useState('')
  const [serviceRadius, setServiceRadius] = useState(25)
  const [step3Errors, setStep3Errors] = useState<FieldErrors>({})

  const isBillingSuspended = business?.billing_status === 'billing_suspended'

  // ─── Fetch data on mount ─────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)

      // Fetch business and categories in parallel
      const [businessData, categoriesRes] = await Promise.all([
        getMyBusiness(bid ?? undefined),
        fetch('/api/categories').then((res) =>
          res.ok ? res.json() : []
        ),
      ])

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
          setSelectedCategories(
            biz.categories.map((c) => c.category_id)
          )
        }

        // Pre-fill step 3
        if (biz.location) {
          setSuburb(biz.location.suburb ?? '')
          setState(biz.location.state ?? '')
          setPostcode(biz.location.postcode ?? '')
          setServiceRadius(biz.location.service_radius_km ?? 25)
        }
      }
    } catch {
      setToast({ message: 'Failed to load data. Please refresh.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [bid])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ─── Step 1: Save business details ───────────────────────────────

  async function saveStep1() {
    setStep1Errors({})

    const parsed = businessSchema.safeParse({
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

    if (selectedCategories.length === 0) {
      setStep2Error('Select at least one category.')
      return false
    }

    if (selectedCategories.length > 5) {
      setStep2Error('You can select up to 5 categories.')
      return false
    }

    if (!business) {
      setStep2Error('Please save your business details first.')
      return false
    }

    setSaving(true)
    try {
      const result = await updateBusinessCategories(
        business.id,
        selectedCategories
      )
      if (result.error) {
        setStep2Error(typeof result.error === 'string' ? result.error : 'Failed to save categories.')
        return false
      }

      setToast({ message: 'Categories saved.', type: 'success' })
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
      return true
    } catch {
      setToast({ message: 'An unexpected error occurred.', type: 'error' })
      return false
    } finally {
      setSaving(false)
    }
  }

  // ─── Step navigation ────────────────────────────────────────────

  async function handleNext() {
    let success = false
    if (currentStep === 1) success = await saveStep1()
    else if (currentStep === 2) success = await saveStep2()
    else if (currentStep === 3) success = await saveStep3()
    else success = true

    if (success && currentStep < 4) {
      setCurrentStep((prev) => prev + 1)
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1)
    }
  }

  // ─── Publish ─────────────────────────────────────────────────────

  async function handlePublish() {
    if (!business) return
    if (isBillingSuspended) {
      setToast({
        message: 'Your billing is suspended. Please upgrade your plan first.',
        type: 'error',
      })
      return
    }

    setSaving(true)
    try {
      const result = await publishChanges(business.id)
      if ('error' in result && result.error) {
        if (result.error === 'subscription_required') {
          setToast({
            message: 'You need an active subscription to publish. Redirecting to billing...',
            type: 'error',
          })
          setTimeout(() => router.push('/dashboard/billing'), 2000)
          return
        }
        setToast({
          message: typeof result.error === 'string' ? result.error : 'Failed to publish.',
          type: 'error',
        })
        return
      }

      if ('published' in result && result.published) {
        setToast({ message: 'Your listing is now live!', type: 'success' })
        router.push('/dashboard')
      } else {
        // AI validation sent to review
        setToast({
          message: result.message || 'Your changes are being reviewed. Your live listing is unchanged.',
          type: 'success',
        })
        setBusiness((prev) => prev ? { ...prev, verification_status: 'pending' } : prev)
      }
    } catch {
      setToast({ message: 'An unexpected error occurred.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  // ─── Category toggle ────────────────────────────────────────────

  function toggleCategory(categoryId: string) {
    setSelectedCategories((prev) => {
      if (prev.includes(categoryId)) {
        return prev.filter((id) => id !== categoryId)
      }
      if (prev.length >= 5) return prev
      return [...prev, categoryId]
    })
  }

  // ─── Group categories by parent ──────────────────────────────────

  function getGroupedCategories() {
    const parents = categories
      .filter((c) => !c.parent_id)
      .sort((a, b) => a.name.localeCompare(b.name))

    return parents.map((parent) => ({
      ...parent,
      children: categories
        .filter((c) => c.parent_id === parent.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
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

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900">
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
                    // Only allow jumping to completed steps or current
                    if (step.id <= currentStep) setCurrentStep(step.id)
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
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={cn(
                  'mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors',
                  step1Errors.name ? 'border-red-300' : 'border-gray-300'
                )}
                placeholder="e.g. Smith's Plumbing"
              />
              {renderFieldError(step1Errors, 'name')}
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                id="description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={cn(
                  'mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors',
                  step1Errors.description ? 'border-red-300' : 'border-gray-300'
                )}
                placeholder="Describe your business, services, experience..."
              />
              <p className="mt-1 text-xs text-gray-400">
                {description.length}/2000 characters
              </p>
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
                Select up to 5 categories that best describe your services.
              </p>
              <p className="mt-1 text-sm font-medium text-gray-700">
                {selectedCategories.length}/5 selected
              </p>
            </div>

            {step2Error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-700">{step2Error}</p>
              </div>
            )}

            {categories.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
                <p className="text-sm text-gray-500">
                  No categories available. They will be loaded shortly.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {getGroupedCategories().map((group) => (
                  <div key={group.id}>
                    <h3 className="text-sm font-semibold text-gray-800 mb-2">
                      {group.name}
                    </h3>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {/* If parent has children, show children. Otherwise show parent itself. */}
                      {group.children.length > 0 ? (
                        group.children.map((child) => (
                          <label
                            key={child.id}
                            className={cn(
                              'flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                              selectedCategories.includes(child.id)
                                ? 'border-brand-300 bg-brand-50'
                                : 'border-gray-200 hover:bg-gray-50',
                              !selectedCategories.includes(child.id) &&
                                selectedCategories.length >= 5
                                ? 'opacity-50 cursor-not-allowed'
                                : ''
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selectedCategories.includes(child.id)}
                              onChange={() => toggleCategory(child.id)}
                              disabled={
                                !selectedCategories.includes(child.id) &&
                                selectedCategories.length >= 5
                              }
                              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                            />
                            <span className="text-sm text-gray-700">{child.name}</span>
                          </label>
                        ))
                      ) : (
                        <label
                          className={cn(
                            'flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                            selectedCategories.includes(group.id)
                              ? 'border-brand-300 bg-brand-50'
                              : 'border-gray-200 hover:bg-gray-50',
                            !selectedCategories.includes(group.id) &&
                              selectedCategories.length >= 5
                              ? 'opacity-50 cursor-not-allowed'
                              : ''
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selectedCategories.includes(group.id)}
                            onChange={() => toggleCategory(group.id)}
                            disabled={
                              !selectedCategories.includes(group.id) &&
                              selectedCategories.length >= 5
                            }
                            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                          <span className="text-sm text-gray-700">{group.name}</span>
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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

        {/* ── Step 4: Preview ──────────────────────────────────── */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Preview Your Listing</h2>
              <p className="mt-1 text-sm text-gray-500">
                This is how your listing will appear to customers.
              </p>
            </div>

            {/* Verification status banners */}
            {business?.verification_status === 'pending' && (
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
              {selectedCategories.length > 0 && (
                <div className="border-t border-gray-100 p-6">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Categories</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedCategories.map((catId) => {
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

            {/* Publish action */}
            {business && (() => {
              const isDraft = business.status === 'draft'
              const isLive = business.status === 'published' || business.status === 'paused'
              const hasPending = !!business.pending_changes
              const isPendingReview = business.verification_status === 'pending'

              if (isPendingReview) {
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
                    <button
                      type="button"
                      onClick={handlePublish}
                      disabled={saving}
                      className="inline-flex items-center justify-center rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {saving ? (
                        <LoadingSpinner />
                      ) : (
                        <>
                          <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.58-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                          </svg>
                          {isDraft ? 'Publish Listing' : 'Publish Changes'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── Navigation buttons ───────────────────────────────── */}
        <div className="mt-8 flex items-center justify-between border-t border-gray-200 pt-6">
          <button
            type="button"
            onClick={handleBack}
            disabled={currentStep === 1}
            className={cn(
              'inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              currentStep === 1
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-700 hover:bg-gray-100'
            )}
          >
            <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back
          </button>

          {currentStep < 4 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={saving}
              className="inline-flex items-center rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <LoadingSpinner />
              ) : (
                <>
                  Save & Continue
                  <svg className="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </>
              )}
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
      </div>

      {/* Toast notification */}
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
