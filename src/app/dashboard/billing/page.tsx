'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { getMyBusiness } from '@/app/actions/business'
import { PLANS, getPlanById } from '@/lib/constants'
import type { PlanTier } from '@/lib/types'
import { cn } from '@/lib/utils'
import LoadingSpinner from '@/components/LoadingSpinner'

// ─── Types ─────────────────────────────────────────────────────────────

interface Subscription {
  id: string
  status: string
  plan: PlanTier
  stripe_price_id: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
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

// ─── Status Badge ──────────────────────────────────────────────────────

function SubscriptionBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    trialing: 'bg-blue-100 text-blue-800',
    past_due: 'bg-orange-100 text-orange-800',
    canceled: 'bg-gray-100 text-gray-800',
    unpaid: 'bg-red-100 text-red-800',
    incomplete: 'bg-yellow-100 text-yellow-800',
    incomplete_expired: 'bg-red-100 text-red-800',
  }

  const labels: Record<string, string> = {
    active: 'Active',
    trialing: 'Trial',
    past_due: 'Past Due',
    canceled: 'Cancelled',
    unpaid: 'Unpaid',
    incomplete: 'Incomplete',
    incomplete_expired: 'Expired',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        styles[status] ?? 'bg-gray-100 text-gray-800'
      )}
    >
      {labels[status] ?? status}
    </span>
  )
}

// ─── Plan Card ──────────────────────────────────────────────────────────

function PlanCard({
  plan,
  isCurrentPlan,
  onSelect,
  redirecting,
}: {
  plan: (typeof PLANS)[number]
  isCurrentPlan: boolean
  onSelect: (planId: string) => void
  redirecting: boolean
}) {
  const isPremium = plan.id === 'premium' || plan.id === 'premium_annual'
  const priceDisplay = plan.id === 'free_trial' ? '$0' : `$${plan.price}`
  const intervalDisplay = plan.id === 'free_trial' ? '/ 30 days' : `/${plan.interval}`

  return (
    <div
      className={cn(
        'rounded-xl border-2 bg-white p-5',
        isCurrentPlan ? 'border-brand-600 ring-1 ring-brand-600' : 'border-gray-200',
        plan.id === 'premium' && !isCurrentPlan ? 'border-brand-300' : ''
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{plan.name}</h3>
          {isCurrentPlan && (
            <span className="mt-1 inline-block text-xs font-medium text-brand-600">Current Plan</span>
          )}
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-gray-900">{priceDisplay}</span>
          <span className="text-sm text-gray-500">{intervalDisplay}</span>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {plan.features.slice(0, 4).map((feature) => (
          <li key={feature} className="flex items-center gap-2 text-xs text-gray-600">
            <svg className="h-3.5 w-3.5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            {feature}
          </li>
        ))}
        {isPremium && (
          <>
            <li className="flex items-center gap-2 text-xs text-gray-600">
              <svg className="h-3.5 w-3.5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Photo gallery (up to 10)
            </li>
            <li className="flex items-center gap-2 text-xs text-gray-600">
              <svg className="h-3.5 w-3.5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Customer testimonials (up to 20)
            </li>
          </>
        )}
      </ul>

      {!isCurrentPlan && (
        <button
          type="button"
          onClick={() => onSelect(plan.id)}
          disabled={redirecting}
          className="mt-4 w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {redirecting ? (
            <span className="flex items-center justify-center gap-2">
              <LoadingSpinner />
              Redirecting...
            </span>
          ) : (
            `Switch to ${plan.name}`
          )}
        </button>
      )}
    </div>
  )
}

// ─── Billing Content ────────────────────────────────────────────────────

function BillingContent() {
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [redirecting, setRedirecting] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // ─── Check for Stripe success redirect ──────────────────────────

  useEffect(() => {
    const sessionId = searchParams.get('session_id')
    if (sessionId) {
      setToast({
        message: 'Subscription activated successfully! Your listing can now be published.',
        type: 'success',
      })
      window.history.replaceState({}, '', '/dashboard/billing')
    }
  }, [searchParams])

  // ─── Fetch subscription on mount ────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const business = await getMyBusiness()

      if (!business) {
        setBusinessId(null)
        setSubscription(null)
        return
      }

      setBusinessId(business.id)
      setSubscription((business.subscription as Subscription) ?? null)
    } catch {
      setToast({ message: 'Failed to load subscription data.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ─── Get price ID for a plan ──────────────────────────────────

  function getPriceIdForPlan(planId: string): string | null {
    const envMap: Record<string, string> = {
      free_trial: 'STRIPE_PRICE_ID_FREE_TRIAL',
      basic: 'STRIPE_PRICE_ID_BASIC',
      premium: 'STRIPE_PRICE_ID_PREMIUM',
      premium_annual: 'STRIPE_PRICE_ID_ANNUAL',
    }
    // These are NEXT_PUBLIC env vars exposed at build time, but since price IDs
    // are server-side only, we'll pass the plan ID to the checkout endpoint
    // and let it resolve the price ID.
    return planId
  }

  // ─── Create checkout session ────────────────────────────────────

  async function handleSelectPlan(planId: string) {
    if (!businessId) return

    setRedirecting(true)
    try {
      // Map plan ID to the env var name, which the server resolves
      const priceIdMap: Record<string, string | undefined> = {
        free_trial: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_FREE_TRIAL,
        basic: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_BASIC,
        premium: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PREMIUM,
        premium_annual: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL,
      }

      // Since price IDs are server-side env vars, send the plan ID
      // and let the server resolve it
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, planId }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setToast({
          message: data.error ?? 'Failed to create checkout session.',
          type: 'error',
        })
        setRedirecting(false)
        return
      }

      const { url } = await response.json()
      if (url) {
        window.location.href = url
      } else {
        setToast({ message: 'Failed to get checkout URL.', type: 'error' })
        setRedirecting(false)
      }
    } catch {
      setToast({ message: 'An unexpected error occurred.', type: 'error' })
      setRedirecting(false)
    }
  }

  // ─── Open Stripe customer portal ────────────────────────────────

  async function handleManage() {
    if (!businessId) return

    setRedirecting(true)
    try {
      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setToast({
          message: data.error ?? 'Failed to open billing portal.',
          type: 'error',
        })
        setRedirecting(false)
        return
      }

      const { url } = await response.json()
      if (url) {
        window.location.href = url
      } else {
        setToast({ message: 'Failed to get portal URL.', type: 'error' })
        setRedirecting(false)
      }
    } catch {
      setToast({ message: 'An unexpected error occurred.', type: 'error' })
      setRedirecting(false)
    }
  }

  // ─── Format date helper ─────────────────────────────────────────

  function formatDate(dateString: string | null): string {
    if (!dateString) return '--'
    return new Date(dateString).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  // ─── Loading state ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  // ─── No business ────────────────────────────────────────────────

  if (!businessId) {
    return (
      <div className="mx-auto max-w-2xl text-center py-12">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
        </svg>
        <h2 className="mt-4 text-lg font-semibold text-gray-900">No Business Listing</h2>
        <p className="mt-2 text-sm text-gray-500">
          Create a business listing first to manage your subscription.
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

  // ─── No subscription / cancelled ──────────────────────────────

  if (!subscription || subscription.status === 'canceled' || subscription.status === 'incomplete_expired') {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-gray-900">Choose a Plan</h1>
        <p className="mt-1 text-sm text-gray-500">
          Select a plan to publish your listing and start attracting customers.
        </p>

        {/* Plan cards */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrentPlan={false}
              onSelect={handleSelectPlan}
              redirecting={redirecting}
            />
          ))}
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            Secure payment powered by Stripe. Cancel anytime from your dashboard.
          </p>
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

  // ─── Active / Past Due subscription ─────────────────────────────

  const currentPlan = getPlanById(subscription.plan ?? 'basic')
  const isPremiumTier = subscription.plan === 'premium' || subscription.plan === 'premium_annual'

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
      <p className="mt-1 text-sm text-gray-500">
        Manage your subscription and billing details.
      </p>

      {/* Past due warning */}
      {subscription.status === 'past_due' && (
        <div className="mt-6 rounded-lg border border-orange-200 bg-orange-50 p-4">
          <div className="flex gap-3">
            <svg className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-orange-800">Payment Past Due</h3>
              <p className="mt-1 text-sm text-orange-700">
                Your last payment failed. Please update your payment method to keep your listing active.
              </p>
              <button
                type="button"
                onClick={handleManage}
                disabled={redirecting}
                className="mt-3 inline-flex items-center rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
              >
                {redirecting ? (
                  <span className="flex items-center gap-2">
                    <LoadingSpinner />
                    Redirecting...
                  </span>
                ) : (
                  'Update Payment Method'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subscription details card */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{currentPlan.name} Plan</h2>
              <SubscriptionBadge status={subscription.status} />
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-gray-900">
                ${currentPlan.price}
              </p>
              <p className="text-sm text-gray-500">
                /{currentPlan.interval}
              </p>
            </div>
          </div>

          {/* Billing details */}
          <div className="mt-6 divide-y divide-gray-100">
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-gray-500">Status</span>
              <SubscriptionBadge status={subscription.status} />
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-gray-500">Plan</span>
              <span className="text-sm font-medium text-gray-900">{currentPlan.name}</span>
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-gray-500">Current Period Ends</span>
              <span className="text-sm font-medium text-gray-900">
                {formatDate(subscription.current_period_end)}
              </span>
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-gray-500">Next Billing Date</span>
              <span className="text-sm font-medium text-gray-900">
                {subscription.cancel_at_period_end
                  ? 'Cancels at end of period'
                  : formatDate(subscription.current_period_end)}
              </span>
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-gray-500">Photos</span>
              <span className="text-sm font-medium text-gray-900">
                {isPremiumTier ? 'Up to 10 photos' : 'Not included'}
              </span>
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-gray-500">Testimonials</span>
              <span className="text-sm font-medium text-gray-900">
                {isPremiumTier ? 'Up to 20 testimonials' : 'Not included'}
              </span>
            </div>

            {subscription.cancel_at_period_end && (
              <div className="py-3">
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                  <p className="text-sm text-yellow-800">
                    Your subscription is set to cancel at the end of the current billing period
                    ({formatDate(subscription.current_period_end)}). Your listing will be unpublished
                    after this date.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 sm:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-gray-500">
              Manage your subscription, payment methods, and billing history on Stripe.
            </p>
            <button
              type="button"
              onClick={handleManage}
              disabled={redirecting}
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {redirecting ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner />
                  Redirecting...
                </span>
              ) : (
                <>
                  <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Manage Subscription
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Upgrade prompt for non-premium users */}
      {!isPremiumTier && (
        <div className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-6">
          <h3 className="text-sm font-semibold text-brand-900">Upgrade to Premium</h3>
          <p className="mt-1 text-sm text-brand-700">
            Get photo galleries and customer testimonials to showcase your work and build trust.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => handleSelectPlan('premium')}
              disabled={redirecting}
              className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              Premium - $10/month
            </button>
            <button
              type="button"
              onClick={() => handleSelectPlan('premium_annual')}
              disabled={redirecting}
              className="inline-flex items-center rounded-lg border border-brand-600 bg-white px-4 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50 transition-colors"
            >
              Annual - $99/year (save 17%)
            </button>
          </div>
        </div>
      )}

      {/* FAQ / Help */}
      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
        <h3 className="text-sm font-semibold text-gray-900">Frequently Asked Questions</h3>
        <dl className="mt-4 space-y-4">
          <div>
            <dt className="text-sm font-medium text-gray-700">How do I cancel?</dt>
            <dd className="mt-1 text-sm text-gray-500">
              Click &quot;Manage Subscription&quot; above to access the Stripe billing portal where you can cancel.
              Your listing stays active until the end of your current billing period.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-700">How do I upgrade?</dt>
            <dd className="mt-1 text-sm text-gray-500">
              Click the upgrade buttons above or manage your subscription through Stripe to switch plans.
              Upgrades take effect immediately.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-700">Can I change my payment method?</dt>
            <dd className="mt-1 text-sm text-gray-500">
              Yes. Click &quot;Manage Subscription&quot; to update your card or payment method in the Stripe portal.
            </dd>
          </div>
        </dl>
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

// ─── Main Component (with Suspense for useSearchParams) ─────────────

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <BillingContent />
    </Suspense>
  )
}
