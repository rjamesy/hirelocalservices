'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { claimBusiness } from '@/app/actions/claims'
import { getPublicProtectionFlags } from '@/app/actions/protection'
import TurnstileWidget from '@/components/TurnstileWidget'

interface ClaimPageProps {
  params: Promise<{ businessId: string }>
}

type Step = 'form' | 'loading' | 'approved' | 'pending_review' | 'rejected' | 'error'

export default function ClaimBusinessPage({ params }: ClaimPageProps) {
  const [step, setStep] = useState<Step>('form')
  const [errorMessage, setErrorMessage] = useState('')
  const [businessId, setBusinessId] = useState('')
  const router = useRouter()

  // CAPTCHA state
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaRequired, setCaptchaRequired] = useState(false)

  // Form state
  const [businessName, setBusinessName] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [postcode, setPostcode] = useState('')

  useEffect(() => {
    getPublicProtectionFlags().then((flags) => {
      setCaptchaRequired(flags.captcha_required)
    })
  }, [])

  useEffect(() => {
    // Handle both Promise params (Next.js 15) and sync proxy params (Next.js 14.2.x)
    // In some Next.js 14.x builds, params is a sync proxy object, not a true Promise
    try {
      if (typeof (params as any)?.then === 'function') {
        (params as any).then((p: { businessId: string }) => setBusinessId(p.businessId))
      } else {
        // Sync access fallback
        setBusinessId((params as unknown as { businessId: string }).businessId)
      }
    } catch {
      // Last resort: try direct property access
      const id = (params as unknown as { businessId: string })?.businessId
      if (id) setBusinessId(id)
    }
  }, [params])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStep('loading')
    setErrorMessage('')

    try {
      const result = await claimBusiness(businessId, {
        businessName,
        phone: phone || undefined,
        website: website || undefined,
        postcode: postcode || undefined,
        captchaToken: captchaToken ?? undefined,
      })

      if (result.error && typeof result.error === 'string') {
        setStep('rejected')
        setErrorMessage(result.error)
      } else if (result.error && typeof result.error === 'object') {
        // Validation errors
        const messages = Object.values(result.error).flat().join(', ')
        setStep('error')
        setErrorMessage(messages)
      } else if (result.step === 'approved') {
        setStep('approved')
      } else if (result.step === 'pending_review') {
        setStep('pending_review')
      } else if (result.step === 'rejected') {
        setStep('rejected')
        setErrorMessage(result.error as string || 'Claim rejected due to insufficient match.')
      } else {
        setStep('error')
        setErrorMessage('An unexpected error occurred.')
      }
    } catch {
      setStep('error')
      setErrorMessage('Something went wrong. Please try again.')
    }
  }

  if (step === 'approved') {
    return (
      <div className="mx-auto max-w-lg py-12 px-4 text-center">
        <div className="rounded-2xl border border-green-200 bg-green-50 p-8">
          <svg className="mx-auto h-12 w-12 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h1 className="mt-4 text-2xl font-bold text-green-900">Claim Approved!</h1>
          <p className="mt-2 text-green-700">
            Your claim has been automatically verified. The business is now linked to your account.
            Complete your listing details and subscribe to appear in search results.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  if (step === 'pending_review') {
    return (
      <div className="mx-auto max-w-lg py-12 px-4 text-center">
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-8">
          <svg className="mx-auto h-12 w-12 text-yellow-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h1 className="mt-4 text-2xl font-bold text-yellow-900">Submitted for Review</h1>
          <p className="mt-2 text-yellow-700">
            Your claim has been submitted and will be reviewed by our team.
            You will be notified once it is approved.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg py-12 px-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <svg className="mx-auto h-12 w-12 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Claim This Business</h1>
          <p className="mt-2 text-gray-600">
            Provide your business details to verify ownership. Matching information helps us
            verify your claim faster.
          </p>
        </div>

        {(step === 'error' || step === 'rejected') && (
          <div className="mt-6 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Business Name */}
          <div>
            <label htmlFor="businessName" className="block text-sm font-medium text-gray-700">
              Business Name
            </label>
            <input
              id="businessName"
              type="text"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-500"
              placeholder="Enter the business name"
            />
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
              Phone Number <span className="text-gray-400">(optional)</span>
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-500"
              placeholder="e.g. 0412 345 678"
            />
          </div>

          {/* Website */}
          <div>
            <label htmlFor="website" className="block text-sm font-medium text-gray-700">
              Website <span className="text-gray-400">(optional)</span>
            </label>
            <input
              id="website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-500"
              placeholder="https://example.com.au"
            />
          </div>

          {/* Postcode */}
          <div>
            <label htmlFor="postcode" className="block text-sm font-medium text-gray-700">
              Business Postcode <span className="text-gray-400">(optional)</span>
            </label>
            <input
              id="postcode"
              type="text"
              maxLength={4}
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-500"
              placeholder="e.g. 4000"
            />
          </div>

          <p className="text-xs text-gray-500">
            Providing more details increases the chance of automatic approval.
            At least the business name is required.
          </p>

          <TurnstileWidget
            captchaRequired={captchaRequired}
            onSuccess={(token) => setCaptchaToken(token)}
          />

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={step === 'loading' || !businessId || (captchaRequired && !captchaToken)}
              className="flex-1 rounded-lg bg-amber-600 px-4 py-3 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {step === 'loading' ? 'Verifying...' : 'Submit Claim'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
