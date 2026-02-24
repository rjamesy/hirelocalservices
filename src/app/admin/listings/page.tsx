'use client'

import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface AdminBusiness {
  id: string
  name: string
  slug: string
  status: string
  created_at: string
  owner_id: string
  owner_email?: string
  subscription_status?: string
}

type StatusFilter = 'all' | 'published' | 'draft' | 'suspended'

const PAGE_SIZE = 20

export default function AdminListingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialStatus = (searchParams.get('status') as StatusFilter) || 'all'
  const initialPage = parseInt(searchParams.get('page') || '1', 10)
  const initialSearch = searchParams.get('q') || ''

  const [businesses, setBusinesses] = useState<AdminBusiness[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus)
  const [searchQuery, setSearchQuery] = useState(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch)
  const [page, setPage] = useState(initialPage)
  const [totalCount, setTotalCount] = useState(0)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const supabase = createClient()

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchBusinesses = useCallback(async () => {
    setLoading(true)

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let query = supabase
      .from('businesses')
      .select(
        `
        id,
        name,
        slug,
        status,
        created_at,
        owner_id,
        profiles!businesses_owner_id_fkey ( email ),
        subscriptions ( status )
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to)

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    if (debouncedSearch) {
      query = query.ilike('name', `%${debouncedSearch}%`)
    }

    const { data, count, error } = await query

    if (!error && data) {
      const mapped: AdminBusiness[] = data.map((b: Record<string, unknown>) => {
        const profiles = b.profiles as { email: string } | { email: string }[] | null
        const subscriptions = b.subscriptions as { status: string } | { status: string }[] | null

        const ownerEmail = Array.isArray(profiles)
          ? profiles[0]?.email
          : (profiles as { email: string } | null)?.email

        const subStatus = Array.isArray(subscriptions)
          ? subscriptions[0]?.status
          : (subscriptions as { status: string } | null)?.status

        return {
          id: b.id as string,
          name: b.name as string,
          slug: b.slug as string,
          status: b.status as string,
          created_at: b.created_at as string,
          owner_id: b.owner_id as string,
          owner_email: ownerEmail ?? 'N/A',
          subscription_status: subStatus ?? 'none',
        }
      })
      setBusinesses(mapped)
      setTotalCount(count ?? 0)
    }

    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, debouncedSearch])

  useEffect(() => {
    fetchBusinesses()
  }, [fetchBusinesses])

  // Update URL params when filters change
  useEffect(() => {
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (page > 1) params.set('page', String(page))
    if (debouncedSearch) params.set('q', debouncedSearch)
    const qs = params.toString()
    router.replace(`/admin/listings${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [statusFilter, page, debouncedSearch, router])

  async function handleSuspend(businessId: string) {
    setActionLoading(businessId)
    const { error } = await supabase
      .from('businesses')
      .update({ status: 'suspended' })
      .eq('id', businessId)

    if (!error) {
      await fetchBusinesses()
    }
    setActionLoading(null)
  }

  async function handleUnsuspend(businessId: string) {
    setActionLoading(businessId)
    const { error } = await supabase
      .from('businesses')
      .update({ status: 'published' })
      .eq('id', businessId)

    if (!error) {
      await fetchBusinesses()
    }
    setActionLoading(null)
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const statusTabs: { label: string; value: StatusFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Published', value: 'published' },
    { label: 'Draft', value: 'draft' },
    { label: 'Suspended', value: 'suspended' },
  ]

  function getStatusBadge(status: string) {
    switch (status) {
      case 'published':
        return (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            Published
          </span>
        )
      case 'draft':
        return (
          <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
            Draft
          </span>
        )
      case 'suspended':
        return (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
            Suspended
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
            {status}
          </span>
        )
    }
  }

  function getSubscriptionBadge(status: string) {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
            Active
          </span>
        )
      case 'past_due':
        return (
          <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
            Past Due
          </span>
        )
      case 'canceled':
        return (
          <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
            Cancelled
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500">
            {status === 'none' ? 'No Sub' : status}
          </span>
        )
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">All Listings</h1>
        <p className="text-sm text-gray-500">{totalCount} total</p>
      </div>

      {/* Search bar */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by business name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="block w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 mb-6 w-fit">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setStatusFilter(tab.value)
              setPage(1)
            }}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              statusFilter === tab.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Business
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Subscription
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Created
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : businesses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-500">
                    No businesses found.
                  </td>
                </tr>
              ) : (
                businesses.map((business) => (
                  <tr key={business.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{business.name}</div>
                      <div className="text-xs text-gray-400">{business.owner_email}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getStatusBadge(business.status)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getSubscriptionBadge(business.subscription_status ?? 'none')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {new Date(business.created_at).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2 shrink-0">
                        <Link
                          href={`/business/${business.slug}`}
                          target="_blank"
                          className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 transition-colors"
                        >
                          View
                        </Link>
                        {business.status === 'suspended' ? (
                          <button
                            onClick={() => handleUnsuspend(business.id)}
                            disabled={actionLoading === business.id}
                            className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50 transition-colors"
                          >
                            {actionLoading === business.id ? 'Working...' : 'Unsuspend'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSuspend(business.id)}
                            disabled={actionLoading === business.id}
                            className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
                          >
                            {actionLoading === business.id ? 'Working...' : 'Suspend'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * PAGE_SIZE + 1} to{' '}
              {Math.min(page * PAGE_SIZE, totalCount)} of {totalCount} results
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <span className="flex items-center px-3 text-sm text-gray-700">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
