'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getMyBusiness, getMyBusinesses, getUserPlan } from '@/app/actions/business'
import { addTestimonial, deleteTestimonial } from '@/app/actions/testimonials'
import { testimonialSchema } from '@/lib/validations'
import { MAX_TESTIMONIALS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import LoadingSpinner from '@/components/LoadingSpinner'
import TestimonialForm from '@/components/TestimonialForm'
import TestimonialCard from '@/components/TestimonialCard'
import BusinessSelector from '@/components/BusinessSelector'

// ─── Types ─────────────────────────────────────────────────────────────

interface Testimonial {
  id: string
  author_name: string
  text: string
  rating: number
  created_at: string
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

function TestimonialsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bid = searchParams.get('bid')

  const [loading, setLoading] = useState(true)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [testimonials, setTestimonials] = useState<Testimonial[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [canAddTestimonials, setCanAddTestimonials] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [allBusinesses, setAllBusinesses] = useState<
    { id: string; name: string; status: string; billing_status: string }[]
  >([])
  const [showSelector, setShowSelector] = useState(false)

  // ─── Fetch testimonials on mount ────────────────────────────────

  const fetchTestimonials = useCallback(async () => {
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
        setTestimonials([])
        return
      }

      setBusinessId(business.id)

      // Check plan tier for testimonial access
      const plan = await getUserPlan()
      setCanAddTestimonials(plan === 'premium' || plan === 'premium_annual')

      const sorted = [...(business.testimonials ?? [])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      setTestimonials(sorted as Testimonial[])
    } catch {
      setToast({ message: 'Failed to load testimonials.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [bid])

  useEffect(() => {
    fetchTestimonials()
  }, [fetchTestimonials])

  // ─── Add testimonial handler ────────────────────────────────────

  async function handleAdd(data: { author_name: string; text: string; rating: number }) {
    if (!businessId) return

    if (testimonials.length >= MAX_TESTIMONIALS) {
      setToast({
        message: `You can have a maximum of ${MAX_TESTIMONIALS} testimonials.`,
        type: 'error',
      })
      return
    }

    // Client-side validation
    const parsed = testimonialSchema.safeParse(data)
    if (!parsed.success) {
      const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]
      setToast({
        message: firstError?.[0] ?? 'Please check your input.',
        type: 'error',
      })
      return
    }

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.set('author_name', data.author_name)
      formData.set('text', data.text)
      formData.set('rating', String(data.rating))
      const result = await addTestimonial(businessId, formData)

      if ('error' in result) {
        setToast({
          message: typeof result.error === 'string' ? result.error : 'Failed to add testimonial.',
          type: 'error',
        })
        return
      }

      setToast({ message: 'Testimonial added successfully.', type: 'success' })
      await fetchTestimonials()
    } catch {
      setToast({ message: 'An unexpected error occurred.', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Delete testimonial handler ─────────────────────────────────

  async function handleDelete(testimonialId: string) {
    if (!businessId) return

    const confirmed = window.confirm('Are you sure you want to delete this testimonial?')
    if (!confirmed) return

    setDeletingId(testimonialId)
    try {
      const result = await deleteTestimonial(testimonialId)

      if ('error' in result) {
        setToast({
          message: typeof result.error === 'string' ? result.error : 'Failed to delete testimonial.',
          type: 'error',
        })
        return
      }

      setTestimonials((prev) => prev.filter((t) => t.id !== testimonialId))
      setToast({ message: 'Testimonial deleted.', type: 'success' })
    } catch {
      setToast({ message: 'An unexpected error occurred.', type: 'error' })
    } finally {
      setDeletingId(null)
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
        onSelect={(id) => router.push(`/dashboard/testimonials?bid=${id}`)}
        title="Testimonials"
        subtitle="Choose a listing to manage testimonials for."
      />
    )
  }

  // ─── No business ────────────────────────────────────────────────

  if (!businessId) {
    return (
      <div className="mx-auto max-w-2xl text-center py-12">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
        <h2 className="mt-4 text-lg font-semibold text-gray-900">No Business Listing</h2>
        <p className="mt-2 text-sm text-gray-500">
          Create a business listing first before adding testimonials.
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

  if (!canAddTestimonials) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900">Testimonials</h1>
        <p className="mt-1 text-sm text-gray-500">
          Add customer testimonials to build trust with potential clients.
        </p>

        <div className="mt-8 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-brand-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
          <h3 className="mt-4 text-lg font-semibold text-brand-900">Premium Feature</h3>
          <p className="mt-2 text-sm text-brand-700">
            Customer testimonials are available on Premium plans. Upgrade to display up to 20 testimonials.
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Testimonials</h1>
        <p className="mt-1 text-sm text-gray-500">
          {testimonials.length} of {MAX_TESTIMONIALS} testimonials
        </p>
      </div>

      {/* Info note */}
      <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex gap-3">
          <svg className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <div>
            <p className="text-sm text-blue-800 font-medium">Manual testimonials</p>
            <p className="mt-1 text-sm text-blue-700">
              In the MVP, you add testimonials manually. Customer reviews coming soon!
            </p>
          </div>
        </div>
      </div>

      {/* Add testimonial form */}
      {testimonials.length < MAX_TESTIMONIALS && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Testimonial</h2>
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <TestimonialForm onSubmit={handleAdd} submitting={submitting} />
          </div>
        </div>
      )}

      {testimonials.length >= MAX_TESTIMONIALS && (
        <div className="mt-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-sm text-yellow-800">
            You have reached the maximum of {MAX_TESTIMONIALS} testimonials. Delete one to add a new one.
          </p>
        </div>
      )}

      {/* Testimonials list */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Your Testimonials
        </h2>

        {testimonials.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
            <h3 className="mt-3 text-sm font-semibold text-gray-900">No testimonials yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              Add testimonials from your satisfied customers to build trust.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {testimonials.map((testimonial) => (
              <div
                key={testimonial.id}
                className="relative rounded-xl border border-gray-200 bg-white"
              >
                <div className="p-4">
                  <TestimonialCard
                    author_name={testimonial.author_name}
                    text={testimonial.text}
                    rating={testimonial.rating}
                    created_at={testimonial.created_at}
                  />
                </div>

                {/* Delete button */}
                <div className="absolute top-4 right-4">
                  <button
                    type="button"
                    onClick={() => handleDelete(testimonial.id)}
                    disabled={deletingId === testimonial.id}
                    className="rounded-lg border border-red-200 bg-white p-2 text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-50 transition-colors"
                    title="Delete testimonial"
                  >
                    {deletingId === testimonial.id ? (
                      <LoadingSpinner />
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
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

export default function TestimonialsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <TestimonialsContent />
    </Suspense>
  )
}
