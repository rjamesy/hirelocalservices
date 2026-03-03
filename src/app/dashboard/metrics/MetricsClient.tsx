'use client'

import { useState, useTransition } from 'react'
import { getBusinessMetrics } from '@/app/actions/metrics'

// ─── Types ─────────────────────────────────────────────────────────────

interface Business {
  id: string
  name: string
  slug: string
}

type Metrics = Awaited<ReturnType<typeof getBusinessMetrics>>

interface MetricsClientProps {
  businesses: Business[]
  initialMetrics: Metrics | null
}

type Timeframe = 'month' | 'all'

const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  month: 30,
  all: 99999,
}

// ─── Metric Card ───────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon,
  testId,
}: {
  label: string
  value: number
  icon: React.ReactNode
  testId: string
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-xl border border-gray-200 bg-white p-5"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-500 truncate">{label}</p>
          <p className="mt-0.5 text-2xl font-semibold text-gray-900">
            {value.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Icons ─────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
    </svg>
  )
}

function EnvelopeIcon() {
  return (
    <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  )
}

// ─── Main Component ────────────────────────────────────────────────────

export default function MetricsClient({ businesses, initialMetrics }: MetricsClientProps) {
  const [selectedBusinessId, setSelectedBusinessId] = useState(businesses[0]?.id ?? '')
  const [timeframe, setTimeframe] = useState<Timeframe>('month')
  const [metrics, setMetrics] = useState<Metrics | null>(initialMetrics)
  const [isPending, startTransition] = useTransition()

  // ─── Fetch metrics when selection changes ────────────────────────

  function handleBusinessChange(businessId: string) {
    setSelectedBusinessId(businessId)
    startTransition(async () => {
      const data = await getBusinessMetrics(businessId, TIMEFRAME_DAYS[timeframe])
      setMetrics(data)
    })
  }

  function handleTimeframeChange(tf: Timeframe) {
    setTimeframe(tf)
    startTransition(async () => {
      const data = await getBusinessMetrics(selectedBusinessId, TIMEFRAME_DAYS[tf])
      setMetrics(data)
    })
  }

  // ─── No businesses ───────────────────────────────────────────────

  if (businesses.length === 0) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 data-testid="metrics-heading" className="text-2xl font-bold text-gray-900">Metrics</h1>
        <p className="mt-1 text-sm text-gray-500">Track how customers find and interact with your listings.</p>

        <div className="mt-8 rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
          </svg>
          <h3 className="mt-3 text-sm font-semibold text-gray-900">No business listings</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create a business listing first to start tracking metrics.
          </p>
          <a
            href="/dashboard/listing?bid=new"
            className="mt-4 inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            Create Listing
          </a>
        </div>
      </div>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl">
      <h1 data-testid="metrics-heading" className="text-2xl font-bold text-gray-900">Metrics</h1>
      <p className="mt-1 text-sm text-gray-500">Track how customers find and interact with your listings.</p>

      {/* Controls row */}
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Business selector (only if multiple) */}
        {businesses.length > 1 && (
          <div data-testid="metrics-business-selector">
            <label htmlFor="business-select" className="sr-only">Select business</label>
            <select
              id="business-select"
              data-testid="metrics-business-select"
              value={selectedBusinessId}
              onChange={(e) => handleBusinessChange(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {businesses.map((biz) => (
                <option key={biz.id} value={biz.id}>
                  {biz.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Timeframe toggle */}
        <div data-testid="metrics-timeframe-toggle" className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            data-testid="metrics-timeframe-month"
            onClick={() => handleTimeframeChange('month')}
            className={
              timeframe === 'month'
                ? 'rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition-colors'
                : 'rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors'
            }
          >
            This Month
          </button>
          <button
            type="button"
            data-testid="metrics-timeframe-all"
            onClick={() => handleTimeframeChange('all')}
            className={
              timeframe === 'all'
                ? 'rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition-colors'
                : 'rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors'
            }
          >
            All Time
          </button>
        </div>
      </div>

      {/* Metrics cards */}
      <div
        data-testid="metrics-cards"
        className={`mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${isPending ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <MetricCard
          testId="metric-search-impressions"
          label="Search Impressions"
          value={metrics?.total_impressions ?? 0}
          icon={<SearchIcon />}
        />
        <MetricCard
          testId="metric-profile-views"
          label="Profile Views"
          value={metrics?.total_views ?? 0}
          icon={<EyeIcon />}
        />
        <MetricCard
          testId="metric-phone-clicks"
          label="Phone Clicks"
          value={metrics?.total_phone_clicks ?? 0}
          icon={<PhoneIcon />}
        />
        <MetricCard
          testId="metric-email-clicks"
          label="Email Clicks"
          value={metrics?.total_email_clicks ?? 0}
          icon={<EnvelopeIcon />}
        />
        <MetricCard
          testId="metric-website-clicks"
          label="Website Clicks"
          value={metrics?.total_website_clicks ?? 0}
          icon={<GlobeIcon />}
        />
      </div>

      {/* Loading indicator */}
      {isPending && (
        <div className="mt-4 flex items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <span className="ml-2 text-sm text-gray-500">Updating metrics...</span>
        </div>
      )}

      {/* Info note */}
      <div className="mt-8 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex gap-3">
          <svg className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <div>
            <p className="text-sm text-blue-800 font-medium">How metrics are tracked</p>
            <p className="mt-1 text-sm text-blue-700">
              Search Impressions count how often your listing appears in search results.
              Profile Views count visits to your business page. Contact clicks track
              when customers click your phone, email, or website links.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
