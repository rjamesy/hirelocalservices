'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { pauseBusiness, unpauseBusiness, softDeleteBusiness } from '@/app/actions/business'
import { cn } from '@/lib/utils'
import type { QualityResult } from '@/lib/listing-quality'

interface BusinessItem {
  id: string
  name: string
  slug: string
  status: string
  quality?: QualityResult
}

type FilterTab = 'all' | 'action_needed' | 'under_review' | 'complete' | 'blocked'

interface ListingsCommandCenterProps {
  businesses: BusinessItem[]
  canCreateMore: boolean
  initialFilter?: FilterTab
}

function getFilterForBusiness(b: BusinessItem): FilterTab {
  const q = b.quality
  if (!q) return 'all'
  if (q.flag === 'blocked') return 'blocked'
  if (q.flag === 'under_review') return 'under_review'
  if (q.flag === 'complete') return 'complete'
  return 'action_needed'
}

const statusColors: Record<string, string> = {
  published: 'bg-green-100 text-green-800',
  draft: 'bg-yellow-100 text-yellow-800',
  paused: 'bg-gray-100 text-gray-800',
  suspended: 'bg-red-100 text-red-800',
}

export default function ListingsCommandCenter({
  businesses,
  canCreateMore,
  initialFilter,
}: ListingsCommandCenterProps) {
  const router = useRouter()
  const [activeFilter, setActiveFilter] = useState<FilterTab>(initialFilter ?? 'all')
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  const counts: Record<FilterTab, number> = {
    all: businesses.length,
    action_needed: businesses.filter((b) => getFilterForBusiness(b) === 'action_needed').length,
    under_review: businesses.filter((b) => getFilterForBusiness(b) === 'under_review').length,
    complete: businesses.filter((b) => getFilterForBusiness(b) === 'complete').length,
    blocked: businesses.filter((b) => getFilterForBusiness(b) === 'blocked').length,
  }

  const filtered =
    activeFilter === 'all'
      ? businesses
      : businesses.filter((b) => getFilterForBusiness(b) === activeFilter)

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'action_needed', label: 'Action needed' },
    { key: 'under_review', label: 'Under review' },
    { key: 'complete', label: 'Complete' },
    { key: 'blocked', label: 'Blocked' },
  ]

  async function handlePause(id: string) {
    setLoadingAction(`pause-${id}`)
    try {
      const result = await pauseBusiness(id)
      if (result.error) {
        alert(typeof result.error === 'string' ? result.error : 'Failed to pause listing')
        return
      }
      router.refresh()
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleResume(id: string) {
    setLoadingAction(`resume-${id}`)
    try {
      const result = await unpauseBusiness(id)
      if (result.error) {
        if (result.error === 'subscription_required') {
          alert('You need an active subscription to unpause your listing.')
          return
        }
        alert(typeof result.error === 'string' ? result.error : 'Failed to unpause listing')
        return
      }
      router.refresh()
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm(
      'Are you sure you want to delete this listing? This action can be reversed by contacting support.'
    )
    if (!confirmed) return

    setLoadingAction(`delete-${id}`)
    try {
      const result = await softDeleteBusiness(id)
      if (result.error) {
        alert(typeof result.error === 'string' ? result.error : 'Failed to delete listing')
        return
      }
      router.refresh()
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 data-testid="listings-heading" className="text-2xl font-bold text-gray-900">
            My Listings
          </h1>
          <p className="mt-1 text-sm text-gray-500">Choose a listing to edit.</p>
        </div>
        {canCreateMore && (
          <button
            type="button"
            data-testid="listings-create-btn"
            onClick={() => router.push('/dashboard/listing?bid=new')}
            className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            <svg
              className="mr-1.5 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create New Listing
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="mt-6 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            data-testid={`listings-filter-${tab.key}`}
            onClick={() => setActiveFilter(tab.key)}
            className={cn(
              'inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              activeFilter === tab.key
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            {tab.label}
            <span
              className={cn(
                'ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 text-xs',
                activeFilter === tab.key
                  ? 'bg-white/20 text-white'
                  : 'bg-gray-200 text-gray-600'
              )}
            >
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Listing rows */}
      <div className="mt-6 space-y-3">
        {businesses.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-300 p-8 text-center">
            <svg
              className="mx-auto h-10 w-10 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016A3.001 3.001 0 0021 9.349m-18 0a2.99 2.99 0 00.621-1.82L4.5 3h15l.879 4.529a2.99 2.99 0 00.621 1.82"
              />
            </svg>
            <p className="mt-3 text-sm font-medium text-gray-900">Create your first listing</p>
            <p className="mt-1 text-sm text-gray-500">
              Get started by adding your business details.
            </p>
            {canCreateMore && (
              <button
                type="button"
                onClick={() => router.push('/dashboard/listing?bid=new')}
                className="mt-4 inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
              >
                Create Listing
              </button>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
            <p className="text-sm text-gray-500">No listings match this filter.</p>
          </div>
        ) : (
          filtered.map((b) => {
            const q = b.quality
            const isPublished = b.status === 'published'
            const isPaused = b.status === 'paused'

            return (
              <div
                key={b.id}
                data-testid={`listings-row-${b.id}`}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4"
              >
                {/* Left: Name, status, quality */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 truncate">{b.name}</span>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        statusColors[b.status] || 'bg-gray-100 text-gray-800'
                      )}
                    >
                      {b.status}
                    </span>
                    {q && q.flag !== 'complete' && (
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          q.colorClass
                        )}
                      >
                        {q.label}
                      </span>
                    )}
                  </div>
                  {q && q.flag !== 'complete' && (
                    <p className="mt-1 text-xs text-gray-500">{q.hint}</p>
                  )}
                </div>

                {/* Right: Actions */}
                <div className="ml-3 flex items-center gap-2 flex-shrink-0">
                  {/* Edit */}
                  <button
                    type="button"
                    data-testid={`listings-edit-${b.id}`}
                    onClick={() => router.push(`/dashboard/listing?bid=${b.id}`)}
                    className="inline-flex items-center rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100 transition-colors"
                  >
                    Edit
                  </button>

                  {/* Pause/Resume */}
                  {isPublished && (
                    <button
                      type="button"
                      data-testid={`listings-pause-${b.id}`}
                      onClick={() => handlePause(b.id)}
                      disabled={loadingAction === `pause-${b.id}`}
                      className="inline-flex items-center rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
                    >
                      {loadingAction === `pause-${b.id}` ? 'Pausing...' : 'Pause'}
                    </button>
                  )}
                  {isPaused && (
                    <button
                      type="button"
                      data-testid={`listings-pause-${b.id}`}
                      onClick={() => handleResume(b.id)}
                      disabled={loadingAction === `resume-${b.id}`}
                      className="inline-flex items-center rounded-lg bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50 transition-colors"
                    >
                      {loadingAction === `resume-${b.id}` ? 'Resuming...' : 'Resume'}
                    </button>
                  )}

                  {/* Delete */}
                  <button
                    type="button"
                    data-testid={`listings-delete-${b.id}`}
                    onClick={() => handleDelete(b.id)}
                    disabled={loadingAction === `delete-${b.id}`}
                    className="inline-flex items-center justify-center rounded-lg p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                    title="Delete listing"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
