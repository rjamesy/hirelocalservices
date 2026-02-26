import Link from 'next/link'
import { getMyBusiness, getMyBusinesses } from '@/app/actions/business'
import { getBusinessMetrics } from '@/app/actions/metrics'
import { cn } from '@/lib/utils'
import { getPlanById } from '@/lib/constants'
import { isTrialExpired, TRIAL_DURATION_DAYS } from '@/lib/ranking'
import { createClient } from '@/lib/supabase/server'
import type { PlanTier } from '@/lib/types'
import PauseUnpauseButton from './PauseUnpauseButton'

function StatusCard({ status, billingStatus, hasSubscription, hasContact }: { status: string; billingStatus: string; hasSubscription: boolean; hasContact: boolean }) {
  const configs: Record<string, { bg: string; border: string; text: string; heading: string; message: string }> = {
    billing_suspended: {
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      text: 'text-orange-800',
      heading: 'Billing suspended',
      message: 'Your trial has expired. Upgrade to a paid plan to restore your listing.',
    },
    draft: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-800',
      heading: 'Your listing is in draft',
      message: hasSubscription
        ? 'Your listing is ready to go. Publish it so customers can find you.'
        : 'Complete your listing details and subscribe to go live.',
    },
    published: hasContact
      ? {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-800',
          heading: 'Your listing is live',
          message: 'Customers can find and contact you through your public profile.',
        }
      : {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          text: 'text-yellow-800',
          heading: 'Your listing is live but missing contact details',
          message: 'Customers can find your listing but have no way to reach you. Add a phone number, email, or website to start getting enquiries.',
        },
    paused: {
      bg: 'bg-gray-50',
      border: 'border-gray-200',
      text: 'text-gray-800',
      heading: 'Your listing is paused',
      message: 'Hidden from customers. Unpause to make it visible again.',
    },
    suspended: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-800',
      heading: 'Your listing has been suspended',
      message: 'Please contact support to resolve any issues with your listing.',
    },
  }

  // billing_suspended takes priority
  const effectiveStatus = billingStatus === 'billing_suspended' ? 'billing_suspended' : status
  const config = configs[effectiveStatus] ?? configs.draft

  return (
    <div className={cn('rounded-lg border p-4', config.bg, config.border)}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {effectiveStatus === 'published' && hasContact ? (
            <svg className={cn('h-5 w-5', config.text)} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : effectiveStatus === 'paused' ? (
            <svg className={cn('h-5 w-5', config.text)} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
            </svg>
          ) : (
            <svg className={cn('h-5 w-5', config.text)} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          )}
        </div>
        <div>
          <h3 className={cn('text-sm font-medium', config.text)}>{config.heading}</h3>
          <p className={cn('mt-1 text-sm', config.text, 'opacity-80')}>{config.message}</p>
          {effectiveStatus === 'billing_suspended' && (
            <Link
              href="/dashboard/billing"
              className="mt-3 inline-flex items-center rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 transition-colors"
            >
              Upgrade Now
            </Link>
          )}
          {effectiveStatus === 'published' && !hasContact && (
            <Link
              href="/dashboard/listing"
              className="mt-3 inline-flex items-center rounded-md bg-yellow-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-yellow-700 transition-colors"
            >
              Add Contact Details
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

export default async function DashboardPage() {
  const business = await getMyBusiness()

  // No business - show CTA
  if (!business) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 data-testid="dashboard-heading" className="text-2xl font-bold text-gray-900">Welcome to your Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Get started by creating your business listing. It only takes a few minutes.
        </p>

        <div data-testid="dashboard-create-cta" className="mt-8 rounded-xl border border-gray-200 bg-white p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50">
            <svg className="h-8 w-8 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016A3.001 3.001 0 0021 9.349m-18 0a2.99 2.99 0 00.621-1.82L4.5 3h15l.879 4.529a2.99 2.99 0 00.621 1.82" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-gray-900">Create Your Business Listing</h2>
          <p className="mt-2 text-sm text-gray-500">
            Add your business details, choose categories, set your service area, and start
            attracting local customers. Plans start from $4/month.
          </p>
          <Link
            href="/dashboard/listing"
            data-testid="dashboard-create-link"
            className="mt-6 inline-flex items-center rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Listing
          </Link>
        </div>
      </div>
    )
  }

  // Business exists - fetch user subscription from user_subscriptions
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: userSub } = user
    ? await supabase
        .from('user_subscriptions')
        .select('status, plan, current_period_end, cancel_at_period_end, trial_ends_at')
        .eq('user_id', user.id)
        .maybeSingle()
    : { data: null }

  const status = (business as Record<string, unknown>).status as string ?? 'draft'
  const billingStatus = (business as Record<string, unknown>).billing_status as string ?? 'active'
  const isBillingSuspended = billingStatus === 'billing_suspended'
  const hasActiveSubscription = userSub && ['active', 'past_due'].includes(userSub.status)
  const planTier = (userSub?.plan as PlanTier) ?? 'basic'
  const currentPlan = getPlanById(planTier)
  const isPremiumTier = planTier === 'premium' || planTier === 'premium_annual'

  // Calculate days until renewal
  let daysUntilRenewal: number | null = null
  if (userSub?.current_period_end) {
    const endDate = new Date(userSub.current_period_end)
    const now = new Date()
    daysUntilRenewal = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
  }

  // Trial expiration check
  const isTrial = planTier === 'free_trial'
  const trialExpired = isTrial && isTrialExpired(planTier, userSub?.current_period_end ?? null)
  const trialDaysLeft = isTrial && !trialExpired ? daysUntilRenewal : null

  // Check if business has any contact method
  const biz = business as Record<string, unknown>
  const hasContact = !!(biz.phone || biz.email_contact || biz.website)

  // Fetch real metrics and all businesses in parallel
  const businessId = biz.id as string
  const [metrics7d, metrics30d, allBusinesses] = await Promise.all([
    getBusinessMetrics(businessId, 7),
    getBusinessMetrics(businessId, 30),
    isPremiumTier ? getMyBusinesses() : Promise.resolve([]),
  ])
  const showBusinessSelector = isPremiumTier && allBusinesses.length > 1

  return (
    <div className="mx-auto max-w-4xl">
      <h1 data-testid="dashboard-heading" className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">
        Manage your business listing and subscription.
      </p>

      {/* Status card */}
      <div data-testid="dashboard-status-card" className="mt-6">
        <StatusCard status={status} billingStatus={billingStatus} hasSubscription={!!hasActiveSubscription} hasContact={hasContact} />
      </div>

      {/* Pause/Unpause button for published/paused listings (not if billing suspended) */}
      {!isBillingSuspended && (status === 'published' || status === 'paused') && (
        <div className="mt-4">
          <PauseUnpauseButton businessId={businessId} currentStatus={status} />
        </div>
      )}

      {/* Unpublished changes indicator */}
      {!isBillingSuspended && !!(business as Record<string, unknown>).pending_changes && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-blue-800">Unpublished changes</h3>
              <p className="mt-1 text-sm text-blue-700">
                You have draft changes that haven&apos;t been published yet.
              </p>
              <Link
                href="/dashboard/listing"
                className="mt-2 inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Review & Publish
                <svg className="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Verification status */}
      {(() => {
        const verificationStatus = (business as Record<string, unknown>).verification_status as string
        if (!verificationStatus || verificationStatus === 'approved') return null

        const vConfigs: Record<string, { bg: string; border: string; text: string; heading: string; message: string }> = {
          pending: {
            bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700',
            heading: 'Verification Pending',
            message: 'Your listing is being verified. This usually takes a few minutes.',
          },
          review: {
            bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800',
            heading: 'Under Review',
            message: 'Your listing is being reviewed by our team. You will be notified once the review is complete.',
          },
          rejected: {
            bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800',
            heading: 'Verification Failed',
            message: 'Your listing did not pass our verification checks. Please review your business details and try again, or contact support.',
          },
          suspended: {
            bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800',
            heading: 'Listing Suspended',
            message: 'Your listing has been suspended. Please contact support to resolve this.',
          },
        }

        const vConfig = vConfigs[verificationStatus] ?? vConfigs.pending
        return (
          <div className={cn('mt-4 rounded-lg border p-4', vConfig.bg, vConfig.border)}>
            <div className="flex items-start gap-3">
              <svg className={cn('h-5 w-5 flex-shrink-0 mt-0.5', vConfig.text)} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <div>
                <h3 className={cn('text-sm font-medium', vConfig.text)}>{vConfig.heading}</h3>
                <p className={cn('mt-1 text-sm', vConfig.text, 'opacity-80')}>{vConfig.message}</p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Prompts */}
      {!isBillingSuspended && status === 'draft' && !hasActiveSubscription && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-blue-800">Subscribe to publish</h3>
              <p className="mt-1 text-sm text-blue-700">
                You need an active subscription before your listing can go live. Try free for 30 days or start from $4/month.
              </p>
              <Link
                href="/dashboard/billing"
                className="mt-3 inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Choose a Plan
              </Link>
            </div>
          </div>
        </div>
      )}

      {!isBillingSuspended && status === 'draft' && hasActiveSubscription && (
        <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 text-brand-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.58-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-brand-800">Ready to publish!</h3>
              <p className="mt-1 text-sm text-brand-700">
                Your subscription is active. Visit your listing to preview and publish it.
              </p>
              <Link
                href="/dashboard/listing"
                className="mt-3 inline-flex items-center rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
              >
                Go to Listing
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Trial expiration warning */}
      {!isBillingSuspended && isTrial && trialExpired && (
        <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-orange-800">Trial Expired</h3>
              <p className="mt-1 text-sm text-orange-700">
                Your {TRIAL_DURATION_DAYS}-day free trial has ended. Upgrade to a paid plan to maintain your ranking priority and stay visible in search results.
              </p>
              <Link
                href="/dashboard/billing"
                className="mt-3 inline-flex items-center rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 transition-colors"
              >
                Upgrade Now
              </Link>
            </div>
          </div>
        </div>
      )}

      {!isBillingSuspended && isTrial && !trialExpired && trialDaysLeft !== null && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-blue-800">Free Trial - {trialDaysLeft} days remaining</h3>
              <p className="mt-1 text-sm text-blue-700">
                Your listing is live with trial ranking. Upgrade to a paid plan for higher search priority and full features.
              </p>
              <Link
                href="/dashboard/billing"
                className="mt-3 inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Choose a Plan
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Search impressions - 7 days */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{metrics7d.total_impressions}</p>
              <p className="text-sm text-gray-500">Search Impressions (7d)</p>
            </div>
          </div>
        </div>

        {/* Search impressions - 30 days */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{metrics30d.total_impressions}</p>
              <p className="text-sm text-gray-500">Search Impressions (30d)</p>
            </div>
          </div>
        </div>

        {/* Profile views - 7 days */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
              <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{metrics7d.total_views}</p>
              <p className="text-sm text-gray-500">Profile Views (7d)</p>
            </div>
          </div>
        </div>

        {/* Profile views - 30 days */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
              <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{metrics30d.total_views}</p>
              <p className="text-sm text-gray-500">Profile Views (30d)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Subscription & renewal row */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Plan tier */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg',
              hasActiveSubscription ? 'bg-green-100' : 'bg-gray-100'
            )}>
              <svg className={cn('h-5 w-5', hasActiveSubscription ? 'text-green-600' : 'text-gray-600')} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {hasActiveSubscription ? currentPlan.name : 'None'}
              </p>
              <p className="text-sm text-gray-500">Current Plan</p>
            </div>
          </div>
          {hasActiveSubscription && !isPremiumTier && (
            <Link
              href="/dashboard/billing"
              className="mt-3 inline-flex items-center text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Upgrade Plan
              <svg className="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
              </svg>
            </Link>
          )}
        </div>

        {/* Days until renewal */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
              <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {daysUntilRenewal !== null ? daysUntilRenewal : '--'}
              </p>
              <p className="text-sm text-gray-500">
                {isTrial ? 'Days Until Trial Ends' : 'Days Until Renewal'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Business selector for premium users with multiple listings */}
      {showBusinessSelector && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">Your Businesses</h2>
          <div className="mt-4 space-y-3">
            {allBusinesses.map((b) => {
              const statusColors: Record<string, string> = {
                published: 'bg-green-100 text-green-800',
                draft: 'bg-yellow-100 text-yellow-800',
                paused: 'bg-gray-100 text-gray-800',
                suspended: 'bg-red-100 text-red-800',
              }
              const billingColor = b.billing_status === 'billing_suspended' ? 'bg-orange-100 text-orange-800' : ''
              const badgeClass = billingColor || statusColors[b.status] || 'bg-gray-100 text-gray-800'
              const badgeLabel = b.billing_status === 'billing_suspended' ? 'billing suspended' : b.status

              return (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900">{b.name}</span>
                    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', badgeClass)}>
                      {badgeLabel}
                    </span>
                  </div>
                  <Link
                    href={`/dashboard/listing?bid=${b.id}`}
                    className="inline-flex items-center rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100 transition-colors"
                  >
                    Edit
                    <svg className="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                    </svg>
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick links — hide edit/photos/testimonials when billing suspended */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Quick Links</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {isBillingSuspended ? (
            <Link
              href="/dashboard/billing"
              className="group flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 p-4 hover:border-orange-300 hover:bg-orange-100 transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 group-hover:bg-orange-200">
                <svg className="h-5 w-5 text-orange-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-orange-900">Upgrade Plan</p>
                <p className="text-xs text-orange-700">Restore your listing by subscribing</p>
              </div>
            </Link>
          ) : (
            <>
              <Link
                href="/dashboard/listing"
                data-testid="dashboard-edit-link"
                className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-brand-300 hover:bg-brand-50 transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 group-hover:bg-brand-100">
                  <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Edit Listing</p>
                  <p className="text-xs text-gray-500">Update your business details</p>
                </div>
              </Link>

              <Link
                href="/dashboard/photos"
                data-testid="dashboard-photos-link"
                className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-brand-300 hover:bg-brand-50 transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 group-hover:bg-brand-100">
                  <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Manage Photos</p>
                  <p className="text-xs text-gray-500">Add or reorder your photos</p>
                </div>
              </Link>

              {(status === 'published' || status === 'paused') && (
                <Link
                  href={`/business/${(business as Record<string, unknown>).slug}`}
                  className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-brand-300 hover:bg-brand-50 transition-colors"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 group-hover:bg-brand-100">
                    <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">View Public Profile</p>
                    <p className="text-xs text-gray-500">See how customers see you</p>
                  </div>
                </Link>
              )}

              {status !== 'published' && status !== 'paused' && (
                <Link
                  href="/dashboard/testimonials"
                  className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-brand-300 hover:bg-brand-50 transition-colors"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 group-hover:bg-brand-100">
                    <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Testimonials</p>
                    <p className="text-xs text-gray-500">Add customer testimonials</p>
                  </div>
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
