import Link from 'next/link'
import { getMyBusinesses } from '@/app/actions/business'
import { getUserEntitlements } from '@/lib/entitlements'
import { getPlanById } from '@/lib/constants'
// Trial expiry is now handled by Stripe natively
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import ViewPublicProfileCard from '@/components/ViewPublicProfileCard'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 data-testid="dashboard-heading" className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">Please log in to access your dashboard.</p>
      </div>
    )
  }

  const [entitlements, businesses] = await Promise.all([
    getUserEntitlements(supabase, user.id),
    getMyBusinesses(),
  ])

  const hasBusinesses = businesses.length > 0
  const hasSub = entitlements.plan !== null
  const planDef = entitlements.plan ? getPlanById(entitlements.plan) : null

  // Trial check — Stripe-native trial (status=trialing)
  const isTrial = entitlements.isTrial
  let trialDaysLeft: number | null = null
  if (isTrial && entitlements.trialEndsAt) {
    const endDate = new Date(entitlements.trialEndsAt)
    const now = new Date()
    trialDaysLeft = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
  }

  // Listings needing attention
  const actionNeeded = businesses.filter(
    (b) => b.quality && b.quality.flag !== 'complete' && b.quality.flag !== 'under_review'
  )

  // Live businesses (have a public page) for public profile link
  const liveBusinesses = businesses.filter((b) => b.status === 'published' || b.status === 'paused')

  // Primary CTA logic
  let ctaLabel: string
  let ctaHref: string
  if (!hasBusinesses) {
    ctaLabel = 'Create Your First Listing'
    ctaHref = '/dashboard/listing'
  } else if (!hasSub) {
    ctaLabel = 'Choose a Plan'
    ctaHref = '/dashboard/billing'
  } else if (entitlements.effectiveState === 'blocked') {
    ctaLabel = 'Fix Billing'
    ctaHref = '/dashboard/billing'
  } else if (entitlements.canCreateMore) {
    ctaLabel = 'Create New Listing'
    ctaHref = '/dashboard/listing?bid=new'
  } else {
    ctaLabel = 'Manage Listings'
    ctaHref = '/dashboard/listing'
  }

  // Subscription status display
  const statusLabels: Record<string, { label: string; color: string }> = {
    active: { label: 'Active', color: 'bg-green-100 text-green-800' },
    past_due: { label: 'Past Due', color: 'bg-orange-100 text-orange-800' },
    canceled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-800' },
    trialing: { label: 'Trial', color: 'bg-blue-100 text-blue-800' },
  }
  const subStatusKey = isTrial ? 'trialing' : (entitlements.subscriptionStatus ?? '')
  const subStatus = statusLabels[subStatusKey] ?? { label: entitlements.subscriptionStatus ?? 'None', color: 'bg-gray-100 text-gray-800' }

  // No business - show CTA
  if (!hasBusinesses) {
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
            href="/dashboard/listing?bid=new"
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

  return (
    <div className="mx-auto max-w-4xl">
      <h1 data-testid="dashboard-heading" className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">
        Your account overview.
      </p>

      {/* Account summary card */}
      <div data-testid="dashboard-account-summary" className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            {/* Plan badge */}
            <div className="flex items-center gap-2">
              <span
                data-testid="dashboard-plan-badge"
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                  hasSub ? subStatus.color : 'bg-gray-100 text-gray-800'
                )}
              >
                {planDef?.name ?? 'No Plan'}
              </span>
              {hasSub && (
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                    subStatus.color
                  )}
                >
                  {subStatus.label}
                </span>
              )}
            </div>
            {/* Listings used */}
            <p data-testid="dashboard-listings-used" className="text-sm text-gray-600">
              Published: {entitlements.publishedListingCount} / {entitlements.maxListings}
            </p>
          </div>

          {/* Primary CTA */}
          <Link
            href={ctaHref}
            data-testid="dashboard-primary-cta"
            className={cn(
              'inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-medium transition-colors',
              entitlements.effectiveState === 'blocked'
                ? 'bg-orange-600 text-white hover:bg-orange-700'
                : 'bg-brand-600 text-white hover:bg-brand-700'
            )}
          >
            {ctaLabel}
          </Link>
        </div>
      </div>

      {/* Banners */}
      {entitlements.effectiveState === 'no_plan' && hasBusinesses && (
        <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 text-brand-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-brand-900">Publish your listing to start getting enquiries</h3>
              <p className="mt-1 text-sm text-brand-700">
                Choose a plan to publish this listing. Basic, Premium and Annual plans available.
              </p>
              <Link
                href="/dashboard/billing"
                className="mt-3 inline-flex items-center rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
              >
                View Plans
              </Link>
            </div>
          </div>
        </div>
      )}

      {entitlements.effectiveState === 'blocked' && (
        <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-orange-800">
                Billing Suspended
              </h3>
              <p className="mt-1 text-sm text-orange-700">
                Your subscription needs attention. Please fix your billing to keep your listings active.
              </p>
              <Link
                href="/dashboard/billing"
                className="mt-3 inline-flex items-center rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 transition-colors"
              >
                Fix Billing
              </Link>
            </div>
          </div>
        </div>
      )}

      {entitlements.cancelAtPeriodEnd && entitlements.currentPeriodEnd && (
        <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-yellow-800">Subscription Ending</h3>
              <p className="mt-1 text-sm text-yellow-700">
                Your subscription will end on{' '}
                {new Date(entitlements.currentPeriodEnd).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}.
                Your listings will remain active until then.
              </p>
              <Link
                href="/dashboard/billing"
                className="mt-3 inline-flex items-center text-sm font-medium text-yellow-700 hover:text-yellow-800"
              >
                Resubscribe
                <svg className="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      )}

      {entitlements.subscriptionStatus === 'past_due' && (
        <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-orange-800">Payment Past Due</h3>
              <p className="mt-1 text-sm text-orange-700">
                Your payment failed. Your listings are still visible, but you cannot publish new changes until your payment is resolved.
              </p>
              <Link
                href="/dashboard/billing"
                className="mt-3 inline-flex items-center rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 transition-colors"
              >
                Update Payment
              </Link>
            </div>
          </div>
        </div>
      )}

      {isTrial && trialDaysLeft !== null && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-blue-800">Free Trial - {trialDaysLeft} days remaining</h3>
              <p className="mt-1 text-sm text-blue-700">
                Your trial is active. After {trialDaysLeft} days your card will be charged automatically.
              </p>
            </div>
          </div>
        </div>
      )}

      {actionNeeded.length > 0 && entitlements.effectiveState !== 'blocked' && (
        <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-yellow-800">
                {actionNeeded.length} listing{actionNeeded.length > 1 ? 's' : ''} need{actionNeeded.length === 1 ? 's' : ''} attention
              </h3>
              <Link
                href="/dashboard/listing?filter=action_needed"
                className="mt-2 inline-flex items-center text-sm font-medium text-yellow-700 hover:text-yellow-800"
              >
                View listings
                <svg className="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Quick nav links */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Quick Links</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            href="/dashboard/listing"
            data-testid="dashboard-edit-link"
            className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-brand-300 hover:bg-brand-50 transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 group-hover:bg-brand-100">
              <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016A3.001 3.001 0 0021 9.349m-18 0a2.99 2.99 0 00.621-1.82L4.5 3h15l.879 4.529a2.99 2.99 0 00.621 1.82" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">My Listings</p>
              <p className="text-xs text-gray-500">Manage your business listings</p>
            </div>
          </Link>

          <Link
            href="/dashboard/billing"
            className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-brand-300 hover:bg-brand-50 transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 group-hover:bg-brand-100">
              <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Billing</p>
              <p className="text-xs text-gray-500">Manage your subscription</p>
            </div>
          </Link>

          {liveBusinesses.length > 0 && (
            <ViewPublicProfileCard
              slug={liveBusinesses.length === 1 ? liveBusinesses[0].slug : undefined}
              multi={liveBusinesses.length > 1}
            />
          )}
        </div>
      </div>
    </div>
  )
}
