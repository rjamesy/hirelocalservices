import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function AdminDashboardPage() {
  const supabase = await createClient()

  // Fetch all counts in parallel
  const [
    { count: totalBusinesses },
    { count: publishedCount },
    { count: draftCount },
    { count: pausedCount },
    { count: suspendedCount },
    { count: openReportsCount },
    { count: pendingClaimsCount },
    { count: pendingVerificationCount },
    { count: claimedCount },
    { count: seedCount },
    { count: activeSubsCount },
  ] = await Promise.all([
    supabase.from('businesses').select('*', { count: 'exact', head: true }),
    supabase
      .from('businesses')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'published'),
    supabase
      .from('businesses')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'draft'),
    supabase
      .from('businesses')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'paused'),
    supabase
      .from('businesses')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'suspended'),
    supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open'),
    supabase
      .from('business_claims')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('businesses')
      .select('*', { count: 'exact', head: true })
      .eq('verification_status', 'pending'),
    supabase
      .from('businesses')
      .select('*', { count: 'exact', head: true })
      .eq('claim_status', 'claimed'),
    supabase
      .from('businesses')
      .select('*', { count: 'exact', head: true })
      .eq('is_seed', true),
    supabase
      .from('user_subscriptions')
      .select('*', { count: 'exact', head: true })
      .in('status', ['active', 'past_due']),
  ])

  const stats = [
    {
      label: 'Total Businesses',
      value: totalBusinesses ?? 0,
      color: 'bg-blue-500',
      href: '/admin/listings',
    },
    {
      label: 'Published',
      value: publishedCount ?? 0,
      color: 'bg-green-500',
      href: '/admin/listings?status=published',
    },
    {
      label: 'Draft',
      value: draftCount ?? 0,
      color: 'bg-yellow-500',
      href: '/admin/listings?status=draft',
    },
    {
      label: 'Paused',
      value: pausedCount ?? 0,
      color: 'bg-gray-400',
      href: '/admin/listings?status=paused',
    },
    {
      label: 'Suspended',
      value: suspendedCount ?? 0,
      color: 'bg-red-500',
      href: '/admin/listings?status=suspended',
    },
    {
      label: 'Open Reports',
      value: openReportsCount ?? 0,
      color: 'bg-orange-500',
      href: '/admin/reports?status=open',
    },
    {
      label: 'Pending Claims',
      value: pendingClaimsCount ?? 0,
      color: 'bg-purple-500',
      href: '/admin/claims',
    },
    {
      label: 'Pending Verification',
      value: pendingVerificationCount ?? 0,
      color: 'bg-indigo-500',
      href: '/admin/verification',
    },
    {
      label: 'Claimed Businesses',
      value: claimedCount ?? 0,
      color: 'bg-teal-500',
      href: '/admin/listings?type=claimed',
    },
    {
      label: 'Seed Listings',
      value: seedCount ?? 0,
      color: 'bg-sky-500',
      href: '/admin/listings?type=seed',
    },
    {
      label: 'Active Subscriptions',
      value: activeSubsCount ?? 0,
      color: 'bg-emerald-500',
      href: '/admin/accounts',
    },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Dashboard</h1>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 mb-8">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full ${stat.color}`} />
              <p className="text-sm font-medium text-gray-500">{stat.label}</p>
            </div>
            <p className="mt-2 text-3xl font-bold text-gray-900">{stat.value}</p>
          </Link>
        ))}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Manage Listings</h2>
          <p className="text-sm text-gray-600 mb-4">
            View, suspend, or unsuspend business listings. Filter by status to find
            businesses that need attention.
          </p>
          <Link
            href="/admin/listings"
            className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            View All Listings
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Review Reports</h2>
          <p className="text-sm text-gray-600 mb-4">
            Review flagged businesses and take action. Resolve reports or suspend
            businesses that violate guidelines.
          </p>
          <Link
            href="/admin/reports"
            className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            View Reports
            {(openReportsCount ?? 0) > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">
                {openReportsCount}
              </span>
            )}
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  )
}
